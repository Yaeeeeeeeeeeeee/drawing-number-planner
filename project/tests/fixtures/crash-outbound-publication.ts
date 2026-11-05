import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import { openDatabase } from '../../src/db/database.js';

const [root, product, batch, selected] = process.argv.slice(2);
const copy = fs.copyFileSync;
fs.copyFileSync = ((...args: Parameters<typeof fs.copyFileSync>) => {
  copy(...args);
  // Abrupt process death after publishing part 1: no service catch/finally can run.
  process.exit(79);
}) as typeof fs.copyFileSync;
syncBuiltinESMExports();
const { OutboundPackageService } = await import('../../src/core/outbound/outbound-package-service.js');
const db = openDatabase(join(root, 'crash.sqlite'));
const service = new OutboundPackageService(db, { workspaceRoot: () => join(root, 'workspace'),
  outputRoot: () => join(root, 'exports'), now: () => new Date(2026, 8, 10, 9, 30) });
const request = { productId: Number(product), selectedMaterialBatchId: Number(batch),
  materialType: 'initial' as const, packageMode: 'current_complete' as const };
const preview = service.previewPackage(request);
await service.createPackage({ ...request, previewToken: preview.previewToken, selectedPdfFileIds: JSON.parse(selected) },
  { taskId: '6fc3f8a7-e1d0-4d61-9235-13d98350f091' });
throw new Error('Crash point was not reached');
