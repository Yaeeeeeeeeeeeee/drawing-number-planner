import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { startServer, type RunningServer } from '../server/start-server.js';
import { createQrFileActionHandler, createShowBomAssetInFolderHandler, createShowFileInFolderHandler } from './open-file-location.js';

let runningServer: RunningServer | undefined;
let mainWindow: BrowserWindow | undefined;
process.on('uncaughtException', (error) => console.error('[main] uncaught', error));

async function createWindow() {
  const devArgument = process.argv.find((argument) => argument.startsWith('--dev-server-url='));
  const devServerUrl = devArgument?.slice('--dev-server-url='.length);
  runningServer ??= await startServer({
    dataDir: app.getPath('userData'),
    ...(devServerUrl ? { allowedOrigins: [new URL(devServerUrl).origin] } : {}),
    ...(devServerUrl ? {} : { rendererDir: join(app.getAppPath(), 'dist', 'renderer') }),
  });
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
  await mainWindow.loadURL(devServerUrl ?? runningServer.url);
}

app.whenReady().then(() => {
  ipcMain.handle('planner:show-file-in-folder', createShowFileInFolderHandler({
    resolvePdfFilePath: (id) => {
      if (!runningServer) throw new Error('本机文件服务尚未启动');
      return runningServer.resolvePdfFilePath(id);
    },
    showItemInFolder: (path) => shell.showItemInFolder(path),
  }));
  ipcMain.handle('planner:show-bom-asset-in-folder', createShowBomAssetInFolderHandler({
    resolveBomAssetPath: (id) => {
      if (!runningServer) throw new Error('本机文件服务尚未启动');
      return runningServer.resolveBomAssetPath(id);
    },
    showItemInFolder: (path) => shell.showItemInFolder(path),
  }));
  ipcMain.handle('planner:qr-file-action', createQrFileActionHandler({
    resolveQrFilePath: (relativePath) => {
      if (!runningServer) throw new Error('本机文件服务尚未启动');
      return runningServer.resolveQrFilePath(relativePath);
    },
    openPath: (path) => shell.openPath(path),
    showItemInFolder: (path) => shell.showItemInFolder(path),
    readFile: (path) => readFileSync(path),
  }));
  return createWindow();
}).catch((error) => {
  console.error('[main] startup failed', error);
  dialog.showErrorBox('图号规划器无法启动', error instanceof Error ? error.message : '本机数据库启动失败');
  app.quit();
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => void runningServer?.close());
