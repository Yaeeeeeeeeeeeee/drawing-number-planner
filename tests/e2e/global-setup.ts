import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FullConfig } from '@playwright/test';
import { createServer } from 'vite';

import { startServer } from '../../src/server/start-server';

export default async function globalSetup(_config: FullConfig) {
  const server = await startServer({
    port: 4317,
    token: 'phase-one-development',
    allowedOrigins: ['http://127.0.0.1:5173'],
    dataDir: mkdtempSync(join(tmpdir(), 'drawing-planner-e2e-')),
  });
  const vite = await createServer({
    configFile: 'vite.config.ts',
    server: { host: '127.0.0.1', port: 5173, strictPort: true },
  });
  await vite.listen();
  return async () => {
    await vite.close();
    await server.close();
  };
}
