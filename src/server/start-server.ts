import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';

import { resolveAppPaths } from '../core/config/app-paths.js';
import { ensureDailyBackup } from '../core/backup/daily-backup.js';
import { DictionaryService } from '../core/dictionaries/dictionary-service.js';
import { DrawingQueryService } from '../core/drawings/drawing-query-service.js';
import { ProductService } from '../core/products/product-service.js';
import { createDatabaseBackup } from '../db/backup.js';
import { openDatabase } from '../db/database.js';
import { migrateDatabase } from '../db/migrations.js';
import { registerDictionaryRoutes } from './routes/dictionaries.js';
import { registerDrawingRoutes } from './routes/drawings.js';
import { registerImportRoutes } from './routes/import.js';
import { registerProductRoutes } from './routes/products.js';
import { assertLoopbackHost, registerLocalAccess } from './security/local-access.js';

export interface ServerOptions {
  host?: '127.0.0.1';
  port?: number;
  token?: string;
  dataDir?: string;
  allowedOrigins?: string[];
  rendererDir?: string;
}

export interface RunningServer {
  url: string;
  token: string;
  close(): Promise<void>;
}

export async function startServer(options: ServerOptions = {}): Promise<RunningServer> {
  const host = options.host ?? '127.0.0.1';
  assertLoopbackHost(host);
  const token = options.token ?? crypto.randomUUID();
  const paths = resolveAppPaths(options.dataDir ?? join(process.cwd(), 'work', 'runtime-data'));
  mkdirSync(paths.baseDir, { recursive: true });
  const databaseExists = existsSync(paths.database);
  const database = openDatabase(paths.database);
  let server: ReturnType<typeof Fastify> | undefined;
  try {
    migrateDatabase(database, {
      databaseExists,
      createBackup: () => createDatabaseBackup(database, paths.database, paths.backups, 'migration'),
    });
    if (databaseExists) {
      const backup = ensureDailyBackup(database, paths.database, paths.backups);
      if (backup.status === 'failed') console.error(`[backup] ${backup.error}`);
    }
    server = Fastify({ logger: false, forceCloseConnections: true });

    registerLocalAccess(server, {
      token,
      allowedOrigins: options.allowedOrigins ?? ['http://127.0.0.1:4317'],
    });
    server.post('/api/session', async () => ({ token }));
    server.get('/api/health', async () => ({ status: 'ok' }));
    registerDictionaryRoutes(server, new DictionaryService(database));
    registerProductRoutes(server, new ProductService(database));
    registerDrawingRoutes(server, new DrawingQueryService(database));
    await registerImportRoutes(server, database, () => {
      createDatabaseBackup(database, paths.database, paths.backups, 'import');
    });
    if (options.rendererDir) await server.register(fastifyStatic, { root: options.rendererDir });
    const address = await server.listen({ host, port: options.port ?? 4317 });

    return {
      url: address,
      token,
      close: async () => {
        server!.server.closeAllConnections();
        await server!.close();
        if (database.open) database.close();
      },
    };
  } catch (error) {
    if (server) await server.close().catch(() => undefined);
    if (database.open) database.close();
    throw error;
  }
}
