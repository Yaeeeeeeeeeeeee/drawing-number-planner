import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LocalServiceController } from './local-service-controller.js';
import { createQrFileActionHandler, createShowBomAssetInFolderHandler, createShowFileInFolderHandler } from './open-file-location.js';
import { createChooseOutboundDirectoryHandler, createShowOutboundPackageHandler } from './outbound-file-actions.js';

let localService: LocalServiceController | undefined;
let mainWindow: BrowserWindow | undefined;
let quitting = false;
process.on('uncaughtException', (error) => console.error('[main] uncaught', error));

async function createWindow() {
  const devArgument = process.argv.find((argument) => argument.startsWith('--dev-server-url='));
  const devServerUrl = devArgument?.slice('--dev-server-url='.length);
  localService ??= new LocalServiceController({
    entryPath: fileURLToPath(new URL('../service/entry.js', import.meta.url)),
    config: {
      dataDir: app.getPath('userData'),
      ...(devServerUrl ? { allowedOrigins: [new URL(devServerUrl).origin] } : {}),
      ...(devServerUrl ? {} : { rendererDir: join(app.getAppPath(), 'dist', 'renderer') }),
    },
  });
  const connection = await localService.start();
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: '#f3f6fa',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: fileURLToPath(new URL('./preload.cjs', import.meta.url)),
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.once('closed', () => { mainWindow = undefined; });
  await mainWindow.loadURL(devServerUrl ?? connection.url);
}

app.whenReady().then(() => {
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
    resolvePackagePath: (id) => { if (!localService) throw new Error('本机文件服务尚未启动'); return localService.resolveOutboundPackagePath(id); },
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
