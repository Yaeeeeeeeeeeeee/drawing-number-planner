import { existsSync, mkdirSync, realpathSync, statSync } from 'node:fs';
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
import { OutboundReferenceService } from '../core/outbound/outbound-reference-service.js';
import { OutboundPackageService } from '../core/outbound/outbound-package-service.js';
import { cleanupStaleOutboundArtifacts } from '../core/outbound/outbound-artifact-ownership.js';
import { IndexedPdfResolver } from '../core/files/indexed-pdf-resolver.js';
import { resolveWorkspacePath } from '../core/files/workspace-paths.js';
import { WorkspaceSettingsStore } from '../core/files/workspace-settings.js';
import { PlanningService } from '../core/planning/planning-service.js';
import { ProductService } from '../core/products/product-service.js';
import { QrService } from '../core/qr/qr-service.js';
import { QrRepository } from '../core/qr/qr-repository.js';
import { createDatabaseBackup } from '../db/backup.js';
import { openDatabase } from '../db/database.js';
import { migrateDatabase } from '../db/migrations.js';
import { registerDictionaryRoutes } from './routes/dictionaries.js';
import { registerBomRoutes } from './routes/boms.js';
import { registerDrawingRoutes } from './routes/drawings.js';
import { registerFileRoutes } from './routes/files.js';
import { registerImportRoutes } from './routes/import.js';
import { registerMaterialBatchRoutes } from './routes/material-batches.js';
import { registerOutboundReferenceRoutes } from './routes/outbound-reference.js';
import { registerOutboundPackageRoutes } from './routes/outbound-packages.js';
import { registerProductRoutes } from './routes/products.js';
import { ProductCleanupService } from '../core/products/product-cleanup-service.js';
import { registerPlanningRoutes } from './routes/planning.js';
import { registerQrCodeRoutes } from './routes/qr-codes.js';
import { TaskRegistry } from '../core/tasks/task-registry.js';
import { registerTaskRoutes } from './routes/tasks.js';
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
  resolveBomAssetPath(id: unknown): string;
  resolveQrFilePath(relativePath: string): { path: string; mimeType: string };
  setOutboundOutputRoot(path: string): string;
  resolveOutboundPackagePath(id: unknown, partNumber?: unknown): string;
  close(): Promise<void>;
}

class QrFileResolverError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}
function qrFileError(code: string, message: string): QrFileResolverError { return new QrFileResolverError(code, message); }

export async function startServer(options: ServerOptions = {}): Promise<RunningServer> {
  const host = options.host ?? '127.0.0.1';
  assertLoopbackHost(host);
  const token = options.token ?? crypto.randomUUID();
  const paths = resolveAppPaths(options.dataDir ?? join(process.cwd(), 'work', 'runtime-data'));
  mkdirSync(paths.baseDir, { recursive: true });
  mkdirSync(paths.exports, { recursive: true });
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
    const qrRepository = new QrRepository(database);
    const tasks = new TaskRegistry();
    registerDictionaryRoutes(server, new DictionaryService(database));
    registerProductRoutes(server, new ProductService(database), new ProductCleanupService(database,
      () => tasks.list().some((task) => ['queued', 'running', 'finalizing'].includes(task.status))));
    registerQrCodeRoutes(server, new QrService(database));
    registerDrawingRoutes(server, new DrawingQueryService(database));
    registerFileRoutes(server, new FileService(fileRepository, workspaceSettings), tasks);
    registerMaterialBatchRoutes(server, new MaterialBatchService(database));
    registerOutboundReferenceRoutes(server, new OutboundReferenceService(database));
    registerOutboundPackageRoutes(server, new OutboundPackageService(database, {
      workspaceRoot: () => workspaceSettings.get().workspaceRoot,
      outputRoot: () => workspaceSettings.getOutboundOutputRoot() ?? paths.exports,
    }), tasks);
    registerPlanningRoutes(server, new PlanningService(database));
    registerBomRoutes(server, new BomService(database, () => workspaceSettings.get().workspaceRoot));
    await registerImportRoutes(server, database, () => {
      createDatabaseBackup(database, paths.database, paths.backups, 'import');
    }, tasks);
    registerTaskRoutes(server, tasks);
    if (options.rendererDir) await server.register(fastifyStatic, { root: options.rendererDir });
    const address = await server.listen({ host, port: options.port ?? 4317 });
    if (!options.allowedOrigins) localAccess.allowOrigin(address);
    let configuredOutputRoot: string | null = null;
    try { configuredOutputRoot = workspaceSettings.getOutboundOutputRoot(); }
    catch (error) { console.error(`[outbound-cleanup] ${error instanceof Error ? error.message : '外发目录设置无效'}`); }
    const activeTaskIds = new Set(tasks.list().filter((task) => ['queued', 'running', 'finalizing'].includes(task.status))
      .map((task) => task.id));
    for (const outputRoot of new Set([paths.exports, configuredOutputRoot].filter((value): value is string => Boolean(value)))) {
      cleanupStaleOutboundArtifacts(outputRoot, { activeTaskIds, nowMs: Date.now(), minimumAgeMs: 60 * 60 * 1_000 });
    }

    return {
      url: address,
      token,
      resolvePdfFilePath: (id) => indexedPdfResolver.resolve(id),
      resolveBomAssetPath: (id) => {
        if (!Number.isInteger(id) || Number(id) <= 0) throw qrFileError('INVALID_BOM_ASSET_ID', 'BOM 附件索引无效');
        const indexed = database.prepare('select relative_path as relativePath from bom_assets where id = ?')
          .get(id) as { relativePath: string } | undefined;
        if (!indexed) throw qrFileError('BOM_ASSET_NOT_FOUND', '未找到 BOM 附件');
        const workspaceRoot = workspaceSettings.get().workspaceRoot;
        if (!workspaceRoot) throw qrFileError('WORKSPACE_NOT_CONFIGURED', '请先设置资料根目录');
        const resolved = resolveWorkspacePath(workspaceRoot, indexed.relativePath, { requireExistingParent: true });
        try {
          const canonical = realpathSync.native(resolved);
          if (!statSync(canonical).isFile()) throw qrFileError('BOM_ASSET_UNAVAILABLE', 'BOM 附件当前不可用');
          return canonical;
        } catch (error) {
          if (error instanceof QrFileResolverError) throw error;
          throw qrFileError('BOM_ASSET_UNAVAILABLE', 'BOM 附件当前不可用');
        }
      },
      resolveQrFilePath: (relativePath) => {
        const indexed = qrRepository.getIndexedQrFile(relativePath);
        if (!indexed) throw qrFileError('QR_FILE_NOT_FOUND', '未找到已关联的二维码文件');
        if (!indexed.isPresent) throw qrFileError('QR_FILE_MISSING', '二维码文件已缺失，请重新扫描资料库');
        const workspaceRoot = workspaceSettings.get().workspaceRoot;
        if (!workspaceRoot) throw qrFileError('WORKSPACE_NOT_CONFIGURED', '请先设置资料根目录');
        const resolved = resolveWorkspacePath(workspaceRoot, indexed.relativePath, { requireExistingParent: true });
        try {
          const canonical = realpathSync.native(resolved);
          if (!statSync(canonical).isFile()) throw qrFileError('QR_FILE_UNAVAILABLE', '二维码文件当前不可用，请重新扫描资料库');
          return { path: canonical, mimeType: indexed.mimeType };
        } catch (error) {
          if (error instanceof QrFileResolverError) throw error;
          throw qrFileError('QR_FILE_UNAVAILABLE', '二维码文件当前不可用，请重新扫描资料库');
        }
      },
      setOutboundOutputRoot: (path) => workspaceSettings.setOutboundOutputRoot(path),
      resolveOutboundPackagePath: (id, partNumber) => {
        if (!Number.isInteger(id) || Number(id) <= 0) throw new Error('外发压缩包编号无效');
        if (partNumber !== undefined && (!Number.isInteger(partNumber) || Number(partNumber) <= 0)) throw new Error('分包序号无效');
        const row = (partNumber === undefined ? database.prepare("select zip_relative_path as relativePath from outbound_packages where id = ? and status = 'completed'").get(id)
          : database.prepare(`select part.zip_relative_path as relativePath from outbound_package_parts part
            join outbound_packages package on package.id = part.package_id
            where package.id = ? and package.status = 'completed' and part.part_number = ?`).get(id, partNumber)) as { relativePath: string | null } | undefined;
        if (!row?.relativePath) throw new Error('未找到已完成的外发压缩包');
        const outputRoot = workspaceSettings.getOutboundOutputRoot() ?? paths.exports;
        const resolved = resolveWorkspacePath(outputRoot, row.relativePath, { requireExistingParent: true });
        try { const canonical = realpathSync.native(resolved); if (!statSync(canonical).isFile()) throw new Error(); return canonical; }
        catch { throw new Error('压缩包当前不可用'); }
      },
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
