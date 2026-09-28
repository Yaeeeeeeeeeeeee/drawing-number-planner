import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { openDatabase } from '../src/db/database.js';
import { migrateDatabase } from '../src/db/migrations.js';
import { DictionaryService } from '../src/core/dictionaries/dictionary-service.js';
import { ProductService } from '../src/core/products/product-service.js';
import { PlanningService } from '../src/core/planning/planning-service.js';
import { FileService } from '../src/core/files/file-service.js';
import { FileRepository } from '../src/core/files/file-repository.js';
import { WorkspaceSettingsStore } from '../src/core/files/workspace-settings.js';
import { BomService } from '../src/core/bom/bom-service.js';
import { startServer } from '../src/server/start-server.js';

// Development-only disposable preview; never opens the user's real database or PDF library.
const dataDir = mkdtempSync(join(tmpdir(), 'planner-second-acceptance-preview-'));
const root = join(dataDir, '隔离验收资料'); mkdirSync(root);
const db = openDatabase(join(dataDir, 'planner.db'));
migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });
const dictionaries = new DictionaryService(db);
const brand = dictionaries.create({ type: 'brand', code: '02', name: '验收样例' });
const size = dictionaries.create({ type: 'product_size', code: '0404', name: '6L空气炸锅' });
const appearance = dictionaries.create({ type: 'appearance', code: '01', name: '标准外观' });
const white = dictionaries.create({ type: 'color', code: '0', name: '白色' });
const main = dictionaries.create({ type: 'main_category', code: '04', name: '印刷件类' });
const items = ['说明书', '售后卡', '顶部贴纸'].map((name, index) => dictionaries.create({ type: 'project_item', code: `0${index + 1}`, name, parentId: main.id }));
const product = new ProductService(db).create({ sku: 'PREVIEWF60', model: 'F60', productCategory: '空气炸锅',
  brandId: brand.id, productSizeId: size.id, defaultAppearanceId: appearance.id });
const planning = new PlanningService(db);
const input = { productId: product.id, rows: items.map((item) => ({ clientId: String(item.id), colorId: white.id,
  mainCategoryId: main.id, projectItemId: item.id })) };
const preview = planning.preview(input);
const drawings = planning.reserve({ ...input, rows: input.rows.map((row, index) => ({ ...row, expectedFullCode: preview.rows[index].fullCode })) });
const productDirectory = join(root, '01.空气炸锅', 'PREVIEWF60-F60');
for (const folder of ['02.未转曲源文件', '03.量产后的变更文件（已量产的产品看最新日期）/00.首批大货',
  '03.量产后的变更文件（已量产的产品看最新日期）/01.20260928']) {
  const directory = join(productDirectory, folder); mkdirSync(directory, { recursive: true });
  for (const [index, drawing] of drawings.entries()) {
    writeFileSync(join(directory, `${drawing.fullCode}-验收样例-F60白色-${items[index].name}${folder.startsWith('02.') ? '' : '（转曲）'}.pdf`), '%PDF-1.4\n% disposable acceptance fixture');
  }
}
const settings = new WorkspaceSettingsStore(join(dataDir, 'settings.json'));
settings.setWorkspaceRoot(root);
const scan = await new FileService(new FileRepository(db), settings).scan();
const batch = db.prepare('select id from material_batches order by sequence_number desc limit 1').get() as { id: number };
new BomService(db, () => root).saveVersion({ productId: product.id, businessChangeDate: '2026-09-28',
  expectedCurrentVersionId: null, items: items.map((item, index) => ({ projectItemId: item.id, drawingId: drawings[index].id,
    usesWhiteMaterial: false, effectiveMaterialBatchId: batch.id, material: '铜版纸', dimensions: '210×297mm',
    position: '包装内部', changeDetails: `${item.name}：调整文字及排版` })) });
db.close();
const server = await startServer({ port: 5187, dataDir, rendererDir: resolve('dist/renderer') });
console.log(JSON.stringify({ preview: server.url, dataDir, scan, note: '隔离样例数据，不是用户真实资料库' }));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, async () => { await server.close(); process.exit(0); });
