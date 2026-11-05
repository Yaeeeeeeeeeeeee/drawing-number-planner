import { mkdirSync, mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { scanQrWorkspace } from '../../src/core/qr/qr-file-scanner';

describe('scanQrWorkspace', () => {
  it('returns QR naming candidates across supported file types without rewriting any workspace file', async () => {
    const root = mkdtempSync(join(tmpdir(), 'planner-qr-scan-'));
    const directory = join(root, '冰柜', 'SKUZC-ZC100', '二维码'); mkdirSync(directory, { recursive: true });
    const qrFile = join(directory, 'ZC100-User Manual（二维码的网址编码）.png');
    const legacyPdf = join(directory, 'ZC100-Warranty（网址编码）.pdf');
    const dottedModel = join(directory, 'ZC.100-Warranty（abc7）.pdf');
    writeFileSync(qrFile, 'png-contents'); writeFileSync(legacyPdf, '%PDF-contents'); writeFileSync(dottedModel, '%PDF-dotted-model');
    writeFileSync(join(directory, '02.0404.010.0401001-history.pdf'), '%PDF drawing');
    const before = statSync(qrFile);

    const files = await scanQrWorkspace(root);

    expect(files.map((file) => file.relativePath.replaceAll('\\','/')).sort()).toEqual([
      '冰柜\\SKUZC-ZC100\\二维码\\ZC.100-Warranty（abc7）.pdf',
      '冰柜\\SKUZC-ZC100\\二维码\\ZC100-User Manual（二维码的网址编码）.png',
      '冰柜\\SKUZC-ZC100\\二维码\\ZC100-Warranty（网址编码）.pdf',
    ].map(path=>path.replaceAll('\\','/')).sort());
    const after = statSync(qrFile);
    expect({ size: after.size, modifiedAt: after.mtimeMs }).toEqual({ size: before.size, modifiedAt: before.mtimeMs });
  });
});
