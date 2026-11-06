import { startServer, type RunningServer } from '../server/start-server.js';
import type { ParentToServiceMessage, ServiceRequestMethod, ServiceToParentMessage } from './protocol.js';

let running: RunningServer | undefined;
let closing = false;
let switchingDatabase = false;

function send(message: ServiceToParentMessage): void { if (process.send) process.send(message); }
function serializedError(error: unknown): { code?: string; message: string } {
  const message = error instanceof Error ? error.message : '本地服务操作失败';
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : undefined;
  return code ? { code, message } : { message };
}

async function closeAndExit(exitCode = 0): Promise<void> {
  if (closing) return;
  closing = true;
  try { await running?.close(); send({ type: 'stopped' }); }
  finally { process.exit(exitCode); }
}

async function handleRequest(id: number, method: ServiceRequestMethod, args: unknown[]): Promise<void> {
  if (switchingDatabase) { send({type:'response',id,ok:false,error:{code:'DATABASE_SWITCHING',message:'数据库切换准备中，请稍后重试'}}); return; }
  if (!running) { send({ type: 'response', id, ok: false, error: { code: 'SERVICE_NOT_READY', message: '本地服务尚未就绪' } }); return; }
  const preparingSwitch = method === 'prepareDatabaseSwitch';
  if (preparingSwitch) switchingDatabase = true;
  try {
    const callable = running[method] as (...values: unknown[]) => unknown;
    const value = await callable(...args);
    send({ type: 'response', id, ok: true, value });
  } catch (error) { if (preparingSwitch) switchingDatabase = false; send({ type: 'response', id, ok: false, error: serializedError(error) }); }
}

process.on('message', (value: unknown) => {
  const message = value as ParentToServiceMessage;
  if (!message || typeof message !== 'object') return;
  if (message.type === 'start' && !running && !closing) {
    void startServer(message.config).then((server) => {
      running = server;
      // The write token is delivered only over the private parent/child IPC channel.
      send({ type: 'ready', url: server.url, token: server.token });
    }).catch((error) => {
      send({ type: 'startup-error', ...serializedError(error) });
      setImmediate(() => process.exit(1));
    });
  } else if (message.type === 'stop') void closeAndExit();
  else if (message.type === 'request') void handleRequest(message.id, message.method, message.args);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => void closeAndExit());
process.on('disconnect', () => void closeAndExit());

