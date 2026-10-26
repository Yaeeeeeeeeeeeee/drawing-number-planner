import { accessSync, constants, statSync } from 'node:fs';
import { resolveWorkspacePath } from './workspace-paths.js';

export type PdfPresenceStatus = 'present' | 'index-stale' | 'missing' | 'path-invalid' | 'read-failed' | 'index-missing';
export interface PdfPresenceResult { status: PdfPresenceStatus; path: string | null; message: string; sizeBytes?: number }
/** Concrete disk observation, independent of product/batch association and file size. */
export function inspectIndexedPdfPresence(root: string | null, indexed: {relativePath:string;isPresent:boolean} | null): PdfPresenceResult {
  if (!indexed) return {status:'index-missing',path:null,message:'PDF 索引未更新或关联未命中'};
  if (!root) return {status:'path-invalid',path:null,message:'资料根目录未配置'};
  let path: string;
  try { path = resolveWorkspacePath(root, indexed.relativePath); }
  catch { return {status:'path-invalid',path:null,message:'文件路径失效或无法访问资料根目录'}; }
  try {
    const stat = statSync(path);
    if (!stat.isFile()) return {status:'path-invalid',path:null,message:'文件路径不是普通文件'};
    accessSync(path, constants.R_OK);
    return {status:indexed.isPresent?'present':'index-stale',path,sizeBytes:stat.size,message:indexed.isPresent?'文件存在':'文件存在，索引待更新'};
  } catch(error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === 'ENOENT' || code === 'ENOTDIR' ? {status:'missing',path:null,message:'磁盘文件不存在'}
      : {status:'read-failed',path:null,message:'文件读取失败，请检查访问权限'};
  }
}
