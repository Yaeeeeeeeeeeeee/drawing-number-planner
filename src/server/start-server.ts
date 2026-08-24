import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import Fastify from 'fastify';

import { resolveAppPaths } from '../core/config/app-paths.js';
import { DictionaryService } from '../core/dictionaries/dictionary-service.js';
import { DrawingQueryService } from '../core/drawings/drawing-query-service.js';
import { ProductService } from '../core/products/product-service.js';
import { backupDatabaseFile } from '../db/backup.js';
import { openDatabase } from '../db/database.js';
import { migrateDatabase } from '../db/migrations.js';
import { registerDictionaryRoutes } from './routes/dictionaries.js';
import { registerDrawingRoutes } from './routes/drawings.js';
import { registerImportRoutes } from './routes/import.js';
import { registerProductRoutes } from './routes/products.js';

export interface ServerOptions {
  host?: '127.0.0.1';
  port?: number;
  token?: string;
  dataDir?: string;
}

export interface RunningServer {
  url: string;
  token: string;
  close(): Promise<void>;
}

export async function startServer(options: ServerOptions = {}): Promise<RunningServer> {
  const host = options.host ?? '127.0.0.1';
  const token = options.token ?? crypto.randomUUID();
  const paths = resolveAppPaths(options.dataDir ?? join(process.cwd(), 'work', 'runtime-data'));
  mkdirSync(paths.baseDir, { recursive: true });
  const databaseExists = existsSync(paths.database);
  const database = openDatabase(paths.database);
  migrateDatabase(database, {
    databaseExists,
    createBackup: () => backupDatabaseFile(paths.database, paths.backups),
  });
  const server = Fastify({ logger: false });

  server.get('/api/health', async () => ({ status: 'ok' }));
  registerDictionaryRoutes(server, new DictionaryService(database));
  registerProductRoutes(server, new ProductService(database));
  registerDrawingRoutes(server, new DrawingQueryService(database));
  await registerImportRoutes(server, database);
  const address = await server.listen({ host, port: options.port ?? 4317 });

  return {
    url: address,
    token,
    close: async () => {
      await server.close();
      database.close();
    },
  };
}
