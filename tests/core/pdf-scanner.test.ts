import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { scanPdfWorkspace } from '../../src/core/files/pdf-scanner';

describe('PDF workspace scanner', () => {
  it('recursively returns only real PDF files with relative metadata', async () => {
    const root = mkdtempSync(join(tmpdir(), 'planner-scan-')); const nested = join(root, 'SAMKYO', 'ZC100', '02.未转曲源文件');
    mkdirSync(nested, { recursive: true }); writeFileSync(join(nested, 'a.pdf'), '%PDF-1.4\nA');
    writeFileSync(join(root, 'B.PDF'), '%PDF-1.4\nBBBB'); writeFileSync(join(root, 'ignore.ai'), 'AI');

    const result = await scanPdfWorkspace(root);

    expect(result.map((file) => file.relativePath)).toEqual([join('SAMKYO', 'ZC100', '02.未转曲源文件', 'a.pdf')]);
    expect(result[0]).toMatchObject({ fileName: 'a.pdf', sizeBytes: 10 });
    expect(result[0].absolutePath).toBe(realpathSync.native(join(nested, 'a.pdf')));
    expect(new Date(result[0].modifiedAt).toISOString()).toBe(result[0].modifiedAt);
  });

  it('does not follow a directory junction outside the workspace', async () => {
    const parent = mkdtempSync(join(tmpdir(), 'planner-scan-link-')); const root = join(parent, 'library');
    const outside = join(parent, 'outside'); mkdirSync(root); mkdirSync(outside); writeFileSync(join(outside, 'outside.pdf'), '%PDF');
    try { symlinkSync(outside, join(root, 'external'), 'junction'); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') return;
      throw error;
    }

    expect(await scanPdfWorkspace(root)).toEqual([]);
  });
});
