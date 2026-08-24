import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';

import { startServer, type RunningServer } from '../server/start-server.js';

let runningServer: RunningServer | undefined;
process.on('uncaughtException', (error) => console.error('[main] uncaught', error));

async function createWindow() {
  const devArgument = process.argv.find((argument) => argument.startsWith('--dev-server-url='));
  const devServerUrl = devArgument?.slice('--dev-server-url='.length);
  runningServer ??= await startServer({
    dataDir: app.getPath('userData'),
    ...(devServerUrl ? {} : { rendererDir: join(app.getAppPath(), 'dist', 'renderer') }),
  });
  const window = new BrowserWindow({
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
    },
  });

  window.once('ready-to-show', () => window.show());
  await window.loadURL(devServerUrl ?? runningServer.url);
}

app.whenReady().then(createWindow).catch((error) => console.error('[main] startup failed', error));
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => void runningServer?.close());
