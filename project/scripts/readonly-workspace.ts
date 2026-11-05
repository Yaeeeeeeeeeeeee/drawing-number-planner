/** Development-only viewer: existing database, no migration, seed, cleanup, or write handler. */
import Database from 'better-sqlite3';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { DictionaryService } from '../src/core/dictionaries/dictionary-service.js';
import { DrawingQueryService } from '../src/core/drawings/drawing-query-service.js';
import { FileRepository } from '../src/core/files/file-repository.js';
import { FileService } from '../src/core/files/file-service.js';
import { MaterialBatchService } from '../src/core/files/material-batch-service.js';
import { WorkspaceSettingsStore } from '../src/core/files/workspace-settings.js';
import { ProductService } from '../src/core/products/product-service.js';
import { QrService } from '../src/core/qr/qr-service.js';
import { BomService } from '../src/core/bom/bom-service.js';
import { OutboundReferenceService } from '../src/core/outbound/outbound-reference-service.js';
import { OutboundPackageService } from '../src/core/outbound/outbound-package-service.js';
import { TaskRegistry } from '../src/core/tasks/task-registry.js';
import { registerDictionaryRoutes } from '../src/server/routes/dictionaries.js';
import { registerDrawingRoutes } from '../src/server/routes/drawings.js';
import { registerFileRoutes } from '../src/server/routes/files.js';
import { registerMaterialBatchRoutes } from '../src/server/routes/material-batches.js';
import { registerProductRoutes } from '../src/server/routes/products.js';
import { registerQrCodeRoutes } from '../src/server/routes/qr-codes.js';
import { registerBomRoutes } from '../src/server/routes/boms.js';
import { registerOutboundReferenceRoutes } from '../src/server/routes/outbound-reference.js';
import { registerOutboundPackageRoutes } from '../src/server/routes/outbound-packages.js';
import { registerTaskRoutes } from '../src/server/routes/tasks.js';
import { registerLocalAccess } from '../src/server/security/local-access.js';

export async function createReadonlyWorkspace(options: { databasePath: string; settingsPath: string; rendererDir?: string }) {
  const databasePath = resolve(options.databasePath);
  const db = new Database(databasePath, { readonly: true, fileMustExist: true });
  db.pragma('query_only = ON');
  const names = new Set((db.prepare("select name from sqlite_master where type='table'").all() as { name: string }[]).map(row => row.name));
  if (['schema_migrations', 'products', 'drawing_numbers', 'historical_drawing_numbers', 'pdf_files', 'bom_versions', 'product_qr_codes', 'dictionary_items'].some(name => !names.has(name))) {
    db.close(); throw Error('已有数据库缺少本版查询所需的表；只读工具不会创建表或执行迁移。');
  }
  const snapshot = () => {
    const names = db.prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name").all() as { name: string }[];
    const tables: Record<string, { count: number; sha256: string }> = {};
    for (const { name } of names) {
      const hash = createHash('sha256'); let count = 0;
      for (const row of db.prepare(`select * from "${name.replaceAll('"', '""')}" order by rowid`).iterate()) { count++; hash.update(JSON.stringify(row) + '\n'); }
      tables[name] = { count, sha256: hash.digest('hex') };
    }
    return { databasePath, tables };
  };
  const before = snapshot(), token = randomUUID();
  const app = Fastify({ logger: false });
  // This separate dev viewer denies actions before any production write handler can run.
  app.addHook('onRequest', async (request, reply) => {
    if (request.url.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method) && !(request.method === 'POST' && request.url.split('?')[0] === '/api/session')) {
      return reply.code(403).send({ error: { code: 'READ_ONLY_ACCEPTANCE', message: '只读布局验收环境：业务操作未执行，原数据库与文件保持不变。' } });
    }
  });
  const access = registerLocalAccess(app, { token, allowedOrigins: ['http://127.0.0.1:5190'] });
  app.post('/api/session', async () => ({ token }));
  app.get('/api/health', async () => ({ status: 'ok' }));
  const settings = new WorkspaceSettingsStore(resolve(options.settingsPath));
  const tasks = new TaskRegistry();
  registerDictionaryRoutes(app, new DictionaryService(db));
  registerDrawingRoutes(app, new DrawingQueryService(db));
  registerProductRoutes(app, new ProductService(db));
  registerFileRoutes(app, new FileService(new FileRepository(db), settings), tasks);
  registerMaterialBatchRoutes(app, new MaterialBatchService(db));
  registerQrCodeRoutes(app, new QrService(db));
  registerBomRoutes(app, new BomService(db, () => settings.get().workspaceRoot));
  registerOutboundReferenceRoutes(app, new OutboundReferenceService(db));
  registerOutboundPackageRoutes(app, new OutboundPackageService(db, { workspaceRoot: () => settings.get().workspaceRoot, outputRoot: () => dirname(databasePath) }), tasks);
  registerTaskRoutes(app, tasks);
  if (options.rendererDir) await app.register(fastifyStatic, { root: resolve(options.rendererDir) });
  app.addHook('onClose', async () => { db.close(); });
  return { app, before, snapshot, token, allowOrigin: access.allowOrigin };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: { database: { type: 'string' }, settings: { type: 'string' }, port: { type: 'string', default: '5190' } } });
  if (!values.database) throw Error('必须指定 --database 已有planner.db；不会创建数据库或样例。');
  const path = resolve(values.database);
  const hash = () => createHash('sha256').update(readFileSync(path)).digest('hex');
  const initialHash = hash();
  const tool = await createReadonlyWorkspace({ databasePath: path, settingsPath: values.settings ?? join(dirname(path), 'settings.json'), rendererDir: 'dist/renderer' });
  const url = await tool.app.listen({ host: '127.0.0.1', port: Number(values.port) }); tool.allowOrigin(url);
  console.log(JSON.stringify({ mode: 'READ_ONLY_ACCEPTANCE', url, source: tool.before, databaseSha256: initialHash, warning: '只读布局查看，禁止保存/扫描/打包/恢复；不代表业务执行验收。' }));
  let stopping = false;
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, async () => {
    if (stopping) return; stopping = true;
    const after = tool.snapshot(); await tool.app.close();
    const report = { scope: 'Read-only existing data; no migrations, seed or business writes', before: tool.before, after, databaseHashBefore: initialHash, databaseHashAfter: hash(), unchanged: JSON.stringify(tool.before) === JSON.stringify(after) && initialHash === hash() };
    mkdirSync('work/p4-adaptive', { recursive: true });
    const file = `work/p4-adaptive/readonly-data-${Date.now()}.json`;
    writeFileSync(file, JSON.stringify(report, null, 2), { flag: 'wx' }); console.log(JSON.stringify({ report: file, unchanged: report.unchanged }));
    process.exit(report.unchanged ? 0 : 1);
  });
}
