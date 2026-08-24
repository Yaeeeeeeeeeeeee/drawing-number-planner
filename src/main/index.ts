import { app, BrowserWindow } from 'electron';

import { startServer, type RunningServer } from '../server/start-server.js';

let runningServer: RunningServer | undefined;
process.on('uncaughtException', (error) => console.error('[main] uncaught', error));

async function createWindow() {
  runningServer ??= await startServer();
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
  await window.loadURL(process.env.VITE_DEV_SERVER_URL ?? 'http://127.0.0.1:5173');
}

app.whenReady().then(createWindow).catch((error) => console.error('[main] startup failed', error));
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => void runningServer?.close());
