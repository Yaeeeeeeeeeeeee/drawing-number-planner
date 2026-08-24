import { startServer } from './start-server.js';

const server = await startServer({ token: 'phase-one-development' });
console.log(`图号规划器本机服务：${server.url}`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await server.close();
    process.exit(0);
  });
}
