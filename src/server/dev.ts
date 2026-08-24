import { startServer } from './start-server.js';

const server = await startServer({
  allowedOrigins: ['http://127.0.0.1:5173', 'http://127.0.0.1:4173'],
  ...(process.env.PLANNER_DATA_DIR ? { dataDir: process.env.PLANNER_DATA_DIR } : {}),
});
console.log(`图号规划器本机服务：${server.url}`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await server.close();
    process.exit(0);
  });
}
