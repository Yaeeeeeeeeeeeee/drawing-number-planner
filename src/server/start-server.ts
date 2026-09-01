import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';

import { resolveAppPaths } from '../core/config/app-paths.js';
import { BomService } from '../core/bom/bom-service.js';
import { ensureDailyBackup } from '../core/backup/daily-backup.js';
import { DictionaryService } from '../core/dictionaries/dictionary-service.js';
import { DrawingQueryService } from '../core/drawings/drawing-query-service.js';
import { FileRepository } from '../core/files/file-repository.js';
import { FileService } from '../core/files/file-service.js';
import { MaterialBatchService } from '../core/files/material-batch-service.js';
import { IndexedPdfResolver } from '../core/files/indexed-pdf-resolver.js';
import { WorkspaceSettingsStore } from '../core/files/workspace-settings.js';
import { PlanningService } from '../core/planning/planning-service.js';
import { ProductService } from '../core/products/product-service.js';
import { QrService } from '../core/qr/qr-service.js';
import { createDatabaseBackup } from '../db/backup.js';
import { openDatabase } from '../db/database.js';
import { migrateDatabase } from '../db/migrations.js';
import { registerDictionaryRoutes } from './routes/dictionaries.js';
import { registerBomRoutes } from './routes/boms.js';
import { registerDrawingRoutes } from './routes/drawings.js';
import { registerFileRoutes } from './routes/files.js';
import { registerImportRoutes } from './routes/import.js';
import { registerMaterialBatchRoutes } from './routes/material-batches.js';
import { registerProductRoutes } from './routes/products.js';
import { registerPlanningRoutes } from './routes/planning.js';
import { registerQrCodeRoutes } from './routes/qr-codes.js';
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
  resolvePdfFilePath(id: unknown): string;
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

    const localAccess = registerLocalAccess(server, {
      token,
      allowedOrigins: options.allowedOrigins ?? [],
    });
    server.post('/api/session', async () => ({ token }));
    server.get('/api/health', async () => ({ status: 'ok' }));
    const fileRepository = new FileRepository(database);
    const workspaceSettings = new WorkspaceSettingsStore(paths.settings);
    const indexedPdfResolver = new IndexedPdfResolver(fileRepository, workspaceSettings);
    registerDictionaryRoutes(server, new DictionaryService(database));
    registerProductRoutes(server, new ProductService(database));
    registerQrCodeRoutes(server, new QrService(database));
    registerDrawingRoutes(server, new DrawingQueryService(database));
    registerFileRoutes(server, new FileService(fileRepository, workspaceSettings));
    registerMaterialBatchRoutes(server, new MaterialBatchService(database));
    registerPlanningRoutes(server, new PlanningService(database));
    registerBomRoutes(server, new BomService(database));
    await registerImportRoutes(server, database, () => {
      createDatabaseBackup(database, paths.database, paths.backups, 'import');
    });
    if (options.rendererDir) await server.register(fastifyStatic, { root: options.rendererDir });
    const address = await server.listen({ host, port: options.port ?? 4317 });
    if (!options.allowedOrigins) localAccess.allowOrigin(address);

    return {
      url: address,
      token,
      resolvePdfFilePath: (id) => indexedPdfResolver.resolve(id),
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
