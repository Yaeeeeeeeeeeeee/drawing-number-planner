import { acquireDesktopInstance } from './single-instance.js';
import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as databaseSafety from './database-validation.js';
import { performDatabaseReselection, createTrustedRecoveryHandler } from './database-reselection.js';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createQrManualHandlers } from './qr-manual-actions.js';
import { LocalServiceController } from './local-service-controller.js';
import { minimumOuterSize } from './window-layout.js';
import { loadDesktopSurface } from './desktop-startup.js';
import { createQrFileActionHandler, createShowBomAssetInFolderHandler, createShowFileInFolderHandler } from './open-file-location.js';
import { createChooseOutboundDirectoryHandler, createShowOutboundPackageHandler } from './outbound-file-actions.js';
import { RecoveryController, createNativeRecoveryActions, parseRecoveryServiceResponse, type RecoverableTask } from './recovery-controller.js';

let localService: LocalServiceController | undefined;
let mainWindow: BrowserWindow | undefined;
let recoveryController: RecoveryController | undefined;
let quitting = false;
process.on('uncaughtException', (error) => console.error('[main] uncaught', error));

async function createWindow() {
  const devArgument = process.argv.find((argument) => argument.startsWith('--dev-server-url='));
  const devServerUrl = devArgument?.slice('--dev-server-url='.length);
  localService ??= new LocalServiceController({
    entryPath: fileURLToPath(new URL('../service/entry.js', import.meta.url)),
    diagnosticsPath:join(app.getPath('userData'),'logs','service-startup.jsonl'),
    config: {
      dataDir: app.getPath('userData'),
      requireExistingDatabase: !devServerUrl,
      ...(devServerUrl ? { allowedOrigins: [new URL(devServerUrl).origin] } : {}),
      ...(devServerUrl ? {} : { rendererDir: join(app.getAppPath(), 'dist', 'renderer') }),
    },
  });
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 720,
    minHeight: 600,
    backgroundColor: '#FFFFFF',
    // Keep native recovery available via Alt, without a permanently visible menu row.
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: fileURLToPath(new URL('./preload.cjs', import.meta.url)),
    },
  });

  // Stored HTTP(S) links open in the system browser; remote pages never inherit desktop capabilities.
  mainWindow.webContents.setWindowOpenHandler(({url}) => {
    try { if (['http:','https:'].includes(new URL(url).protocol)) void shell.openExternal(url); } catch { /* Invalid links are denied. */ }
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    try { if (new URL(url).origin !== new URL(mainWindow!.webContents.getURL()).origin) event.preventDefault(); }
    catch { event.preventDefault(); }
  });

  // Calibrate only window geometry after the renderer exists. No IPC or recovery changes.
  const windowForLayout = mainWindow;
  const calibrateMinimum = () => {
    void windowForLayout.webContents.executeJavaScript('[window.innerWidth, window.innerHeight]')
      .then((viewport: [number, number]) => {
        if (windowForLayout.isDestroyed()) return;
        const [width, height] = windowForLayout.getSize();
        const size = minimumOuterSize({ outer: [width, height], viewport,
          zoom: windowForLayout.webContents.getZoomFactor() });
        if (size) windowForLayout.setMinimumSize(...size);
      }).catch(error => console.error('[main] minimum viewport measurement failed', error));
  };
  windowForLayout.webContents.on('did-finish-load', calibrateMinimum);
  windowForLayout.webContents.on('zoom-changed', () => {
    // Wait for the new renderer zoom before measuring CSS-to-native dimensions.
    setTimeout(() => { if (!windowForLayout.isDestroyed()) calibrateMinimum(); }, 0);
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.once('closed', () => { mainWindow = undefined; });
  installRecoveryControls();
  mainWindow.setMenuBarVisibility(false);
  const result = await loadDesktopSurface({
    startService: () => localService!.start(),
    loadURL: (url) => mainWindow!.loadURL(url),
    businessUrl: (connection) => devServerUrl ?? connection.url,
    quit: () => app.quit(),
  });
  if (result.status === 'unavailable') console.error('[main] local service unavailable', result.error);
}

async function serviceRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!localService) throw new Error('本机文件服务尚未启动');
  const connection = await localService.start();
  const response = await fetch(`${connection.url}${path}`, {
    ...init,
    headers: { origin: connection.url, ...(init.headers as Record<string, string> | undefined),
      ...(['POST', 'PUT', 'PATCH', 'DELETE'].includes(init.method?.toUpperCase() ?? 'GET')
        ? { 'x-planner-token': connection.token } : {}) },
  });
  const body = await response.text();
  return parseRecoveryServiceResponse<T>(response, body);
}

function installRecoveryControls(): void {
  if (!localService || !mainWindow) return;
  recoveryController = new RecoveryController({
    reselectDatabase,
    serviceHealth: () => localService!.health(),
    restartService: () => localService!.restart(),
    listTasks: async () => (await serviceRequest<{ tasks: RecoverableTask[] }>('/api/tasks')).tasks,
    cancelTask: async (id) => { await serviceRequest(`/api/tasks/${id}/cancel`, { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: '{}' }); },
    waitForTask: async (id, timeoutMs) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const task = await serviceRequest<RecoverableTask>(`/api/tasks/${id}`);
        if (['completed', 'failed', 'cancelled'].includes(task.status)) return true;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return false;
    },
    reloadRenderer: () => mainWindow?.webContents.reload(),
    notifyServiceRestarted: (url) => {
      if (!mainWindow?.isDestroyed()) mainWindow?.webContents.send('planner:service-restarted', { url });
    },
    relaunch: () => app.relaunch(),
    exit: (code) => app.exit(code),
  });
  const actions = createNativeRecoveryActions(recoveryController);
  const invoke = (action: keyof typeof actions) => void actions[action]().catch((error) => {
    dialog.showErrorBox('安全恢复未完成', error instanceof Error ? error.message : '恢复操作失败');
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: '应用', submenu: [
    { label: '安全恢复', submenu: [
      { label: '终止当前任务', click: () => invoke('terminateTask') },
      { label: '重新加载界面', click: () => invoke('reloadRenderer') },
      { label: '重启本地服务', click: () => invoke('restartService') },
      { type: 'separator' },
      { label: '完整恢复应用', click: () => invoke('relaunchApp') },
      { type: 'separator' },
      { label: '重新选择数据库', click: () => invoke('reselectDatabase') },
    ] },
  ] }]));
  const result = async (action: keyof typeof actions) => {
    try { return await actions[action](); }
    catch (error) { return { ok: false, error: { code: typeof error === 'object' && error && 'code' in error ? String(error.code) : 'RECOVERY_FAILED',
      message: error instanceof Error ? error.message : '恢复操作失败' } }; }
  };
  const trusted = (event: unknown) => {
    const sender = event as Electron.IpcMainInvokeEvent;
    return Boolean(mainWindow && sender.sender === mainWindow.webContents && sender.senderFrame === mainWindow.webContents.mainFrame);
  };
  for (const [channel, action] of [
    ['status', () => recoveryController!.status()],
    ['terminate-task', () => result('terminateTask')], ['reload-renderer', () => result('reloadRenderer')],
    ['restart-service', () => result('restartService')], ['relaunch-app', () => result('relaunchApp')],
    ['reselect-database', () => result('reselectDatabase')],
  ] as const) {
    ipcMain.removeHandler(`planner:recovery-${channel}`);
    ipcMain.handle(`planner:recovery-${channel}`, createTrustedRecoveryHandler(trusted, action));
  }
}

async function reselectDatabase(): Promise<{ok:true;cancelled:boolean}> {
  if (!localService || !mainWindow) throw new Error('桌面尚未准备好');
  const oldService = localService;
  const oldData = app.getPath('userData');
  const devUrl = process.argv.find(argument => argument.startsWith('--dev-server-url='))?.slice('--dev-server-url='.length);
  let candidate: LocalServiceController | undefined;
  const {prepareProductionProfile} = createRequire(import.meta.url)(join(app.getAppPath(), existsSync(join(app.getAppPath(),'production-profile.cjs')) ? 'production-profile.cjs' : 'scripts/production-profile.cjs'));
  const selected = await performDatabaseReselection({
    quiesce: async () => {
      if (oldService.health().status === 'running') await oldService.prepareDatabaseSwitch();
      else {
        if (oldService.health().status === 'starting' || existsSync(join(oldData,'illustrator-operations','active-operation.json'))) {
          throw new Error('本机服务正在启动或 Illustrator 操作尚未核对，暂不能切换数据库');
        }
        await oldService.stop();
      }
    },
    prepare: beforeSwitch => prepareProductionProfile({
      appData: app.getPath('appData'), currentDataDir:oldData, forceSelection: true, databaseSafety,
      chooseMode: async () => 'existing',
      chooseDatabase: async () => {
        const result = await dialog.showOpenDialog(mainWindow!, {title:'重新选择数据库（保留当前数据库和全部原文件）', defaultPath:oldData,
          properties:['openFile'], filters:[{name:'图号规划器数据库 planner.db',extensions:['db']}]});
        return result.canceled ? null : result.filePaths[0] ?? null;
      },
      beforeSwitch,
      verifyStartup: async (data: string) => {
        await oldService.stop();
        candidate = new LocalServiceController({entryPath:fileURLToPath(new URL('../service/entry.js',import.meta.url)),
          diagnosticsPath:join(data,'logs','service-startup.jsonl'),
          config:{dataDir:data,requireExistingDatabase:true,...(devUrl ? {allowedOrigins:[new URL(devUrl).origin]} : {rendererDir:join(app.getAppPath(),'dist','renderer')})}});
        await candidate.start();
      },
    }),
    restore: async () => {
      await candidate?.stop(); localService = oldService;
      const connection = await oldService.restart();
      await mainWindow!.loadURL(devUrl ?? connection.url);
    },
  });
  if (!selected.cancelled && candidate) {
    localService = candidate;
    // profile.json was atomically committed only after candidate.start() succeeded.
    const connection = await candidate.start();
    const {dataDir} = JSON.parse(readFileSync(join(app.getPath('appData'),'DrawingNumberPlanner','profile.json'),'utf8'));
    app.setPath('userData',dataDir);
    await mainWindow.loadURL(devUrl ?? connection.url);
  }
  return selected;
}

const primaryInstance = acquireDesktopInstance(app, () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show(); mainWindow.focus();
});
if (primaryInstance) void app.whenReady().then(() => {
  ipcMain.handle('planner:show-file-in-folder', createShowFileInFolderHandler({
    resolvePdfFilePath: (id) => {
      if (!localService) throw new Error('本机文件服务尚未启动');
      return localService.resolvePdfFilePath(id);
    },
    showItemInFolder: (path) => shell.showItemInFolder(path),
  }));
  ipcMain.handle('planner:show-bom-asset-in-folder', createShowBomAssetInFolderHandler({
    resolveBomAssetPath: (id) => {
      if (!localService) throw new Error('本机文件服务尚未启动');
      return localService.resolveBomAssetPath(id);
    },
    showItemInFolder: (path) => shell.showItemInFolder(path),
  }));
  const manualQr = createQrManualHandlers({
    isTrustedEvent: event => {
      const sender=event as Electron.IpcMainInvokeEvent;
      return Boolean(mainWindow && sender.sender===mainWindow.webContents && sender.senderFrame===mainWindow.webContents.mainFrame);
    },
    choosePdf: async () => {
      const result = await dialog.showOpenDialog(mainWindow!, { title: '选择二维码原始PDF', properties: ['openFile'], filters: [{name:'PDF',extensions:['pdf']}] });
      return result.canceled ? null : result.filePaths[0] ?? null;
    },
    execute: (action, input) => {
      if (!localService) throw new Error('本机文件服务尚未启动');
      return localService.qrManualAction(action, input);
    },
    openPath: path => shell.openPath(path),
    showItemInFolder: path => shell.showItemInFolder(path),
  });
  ipcMain.handle('planner:qr-manual-select', event => manualQr.select(event));
  ipcMain.handle('planner:qr-manual-action', manualQr.action);
  ipcMain.handle('planner:qr-file-action', createQrFileActionHandler({
    resolveQrFilePath: (relativePath) => {
      if (!localService) throw new Error('本机文件服务尚未启动');
      return localService.resolveQrFilePath(relativePath);
    },
    openPath: (path) => shell.openPath(path),
    showItemInFolder: (path) => shell.showItemInFolder(path),
    readFile: (path) => readFileSync(path),
  }));
  ipcMain.handle('planner:choose-outbound-directory', createChooseOutboundDirectoryHandler({
    chooseDirectory: async () => dialog.showOpenDialog(mainWindow!, { title: '选择外发压缩包保存目录', properties: ['openDirectory', 'createDirectory'] }),
    setOutputRoot: (path) => { if (!localService) throw new Error('本机文件服务尚未启动'); return localService.setOutboundOutputRoot(path); },
  }));
  ipcMain.handle('planner:show-outbound-package-in-folder', createShowOutboundPackageHandler({
    resolvePackagePath: (id, partNumber) => { if (!localService) throw new Error('本机文件服务尚未启动'); return localService.resolveOutboundPackagePath(id, partNumber); },
    showItemInFolder: (path) => shell.showItemInFolder(path),
  }));
  return createWindow();
}).catch((error) => {
  console.error('[main] startup failed', error);
  dialog.showErrorBox('图号规划器无法启动', error instanceof Error ? error.message : '本机数据库启动失败');
  app.quit();
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', (event) => {
  if (quitting || !localService) return;
  event.preventDefault(); quitting = true;
  void localService.stop().finally(() => app.quit());
});
