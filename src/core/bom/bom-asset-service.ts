import { copyFileSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { basename, dirname, extname, isAbsolute, join } from 'node:path';

import type { PlannerDatabase } from '../../db/database.js';
import { resolveWorkspacePath, toWorkspaceRelativePath, validateWorkspaceRoot } from '../files/workspace-paths.js';
import { BomError } from './bom-errors.js';

const MAX_ASSET_BYTES = 10 * 1024 * 1024;
const MIME_BY_EXTENSION: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
};

export interface ImportBomAssetInput { sku: string; model: string; sourcePath: string }
export interface ManagedBomAsset {
  id: number; relativePath: string; originalFileName: string; mimeType: string; sizeBytes: number; contentSha256: string; createdAt: string;
}

function hasExpectedImageSignature(content: Buffer, extension: string): boolean {
  if (extension === '.png') return content.length >= 8 && content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (extension === '.jpg' || extension === '.jpeg') return content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff;
  return content.length >= 12 && content.subarray(0, 4).toString('ascii') === 'RIFF' && content.subarray(8, 12).toString('ascii') === 'WEBP';
}

function safeSegment(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed || /[\\/:*?"<>|\0]/.test(trimmed) || trimmed === '.' || trimmed === '..') {
    throw new BomError('ASSET_PATH_INVALID', `${label}不能包含不安全的路径字符`);
  }
  return trimmed;
}

export class BomAssetService {
  readonly workspaceRoot: string;
  constructor(private readonly db: PlannerDatabase, workspaceRoot: string) { this.workspaceRoot = validateWorkspaceRoot(workspaceRoot); }

  import(input: ImportBomAssetInput): ManagedBomAsset {
    if (!isAbsolute(input.sourcePath)) throw new BomError('ASSET_SOURCE_INVALID', 'BOM 附件源文件必须是本机绝对路径');
    let sourceStats: ReturnType<typeof statSync>;
    try { sourceStats = statSync(input.sourcePath); }
    catch { throw new BomError('ASSET_SOURCE_INVALID', 'BOM 附件源文件无法访问'); }
    if (!sourceStats.isFile()) throw new BomError('ASSET_SOURCE_INVALID', 'BOM 附件源路径必须是文件');
    if (sourceStats.size > MAX_ASSET_BYTES) throw new BomError('ASSET_TOO_LARGE', `BOM 图片不能超过 ${MAX_ASSET_BYTES} 字节`);
    const extension = extname(input.sourcePath).toLocaleLowerCase('en-US');
    const mimeType = MIME_BY_EXTENSION[extension];
    if (!mimeType) throw new BomError('ASSET_TYPE_INVALID', 'BOM 附件只支持 PNG、JPG、JPEG 或 WebP 图片');
    if (!hasExpectedImageSignature(readFileSync(input.sourcePath), extension)) {
      throw new BomError('ASSET_CONTENT_INVALID', 'BOM 附件内容与图片类型不匹配');
    }

    const sku = safeSegment(input.sku, 'SKU'); const model = safeSegment(input.model, '型号');
    const originalFileName = basename(input.sourcePath);
    const fileName = `${randomUUID()}-${originalFileName}`;
    const relativePath = join('_图号规划器', 'BOM附件', `${sku}-${model}`, fileName);
    const destination = resolveWorkspacePath(this.workspaceRoot, relativePath, { requireExistingParent: true });
    const temporary = `${destination}.${randomUUID()}.tmp`;
    let copied = false;
    try {
      mkdirSync(dirname(destination), { recursive: true });
      copyFileSync(input.sourcePath, temporary, 1);
      renameSync(temporary, destination);
      copied = true;
      const contentSha256 = createHash('sha256').update(readFileSync(destination)).digest('hex');
      const createdAt = new Date().toISOString();
      const id = Number(this.db.prepare(`insert into bom_assets
        (relative_path, original_file_name, mime_type, size_bytes, content_sha256, created_at) values (?, ?, ?, ?, ?, ?)`)
        .run(toWorkspaceRelativePath(this.workspaceRoot, destination), originalFileName, mimeType, sourceStats.size,
          contentSha256, createdAt).lastInsertRowid);
      return { id, relativePath: toWorkspaceRelativePath(this.workspaceRoot, destination), originalFileName, mimeType,
        sizeBytes: sourceStats.size, contentSha256, createdAt };
    } catch (error) {
      rmSync(temporary, { force: true });
      if (copied) rmSync(destination, { force: true });
      throw error;
    }
  }
}
