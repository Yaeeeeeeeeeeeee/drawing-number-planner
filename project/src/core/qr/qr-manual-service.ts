import { createHash, randomUUID } from 'node:crypto';
import { openSync, closeSync, fstatSync, readFileSync, realpathSync, lstatSync, constants, statSync } from 'node:fs';
import { basename, extname } from 'node:path';
import type { PlannerDatabase } from '../../db/database.js';
import { QrService } from './qr-service.js';
import { QrRepository } from './qr-repository.js';
import { QrManualError, validateQrManualFilename, qrUrlTail } from './qr-manual-validation.js';
export interface QrManualSelection { token: string; fileName: string; path: string }
export interface QrManualInput { token: string; qrCodeId?: number; productId: number; purposeId: number; name: string; targetUrl: string; appearanceVersionId?: number | null }
export interface QrManualPreview { previewId: string; fileName: string; path: string; tail: string; issues: string[]; revision: string }
interface Fingerprint { path: string; fileName: string; size: number; modified: number; changed: number; device: number; inode: number; hash: string }
interface Prepared { input: QrManualInput; file: Fingerprint; issues: string[]; revision: string; expires: number }
function fingerprint(path: string): Fingerprint {
  if (lstatSync(path).isSymbolicLink()) throw new QrManualError('UNSAFE_FILE', '不能选择符号链接');
  const canonical = realpathSync(path);
  // Shell opening uses the real filename's extension. A PDF header cannot make
  // an executable safe, and naming exceptions must never bypass this boundary.
  if (extname(canonical).toLowerCase() !== '.pdf') throw new QrManualError('INVALID_PDF', '只能选择PDF文件，扩展名必须为.pdf');
  const fd = openSync(canonical, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > 64 * 1024 * 1024) throw new QrManualError('INVALID_PDF', '请选择64MB以内的PDF文件');
    const check = statSync(canonical);
    if (realpathSync(canonical)!==canonical || check.ino!==stat.ino || check.dev!==stat.dev) throw new QrManualError('FILE_CHANGED','文件路径在读取期间改变');
    const bytes = readFileSync(fd);
    if (!/^%PDF-[12]\.[0-9]/.test(bytes.subarray(0, 8).toString('ascii'))) throw new QrManualError('INVALID_PDF', '文件内容不是PDF');
    return { path: canonical, fileName: basename(canonical), size: stat.size, modified: stat.mtimeMs, changed: stat.ctimeMs, device: stat.dev, inode: stat.ino, hash: createHash('sha256').update(bytes).digest('hex') };
  } finally { closeSync(fd); }
}
export class QrManualService {
  private selections = new Map<string, { file: Fingerprint; expires: number }>();
  private previews = new Map<string, Prepared>();
  private repository: QrRepository;
  constructor(private db: PlannerDatabase) { this.repository = new QrRepository(db); }
  /** Trusted desktop RPC only. Never expose path registration through HTTP. */
  selectTrustedFile(path: string): QrManualSelection {
    const file = fingerprint(path); const token = randomUUID();
    this.selections.set(token, { file, expires: Date.now() + 30 * 60_000 });
    return { token, fileName: file.fileName, path: file.path };
  }
  private revision(input: QrManualInput): string {
    const code = input.qrCodeId ? this.repository.get(input.qrCodeId) : null;
    if (input.qrCodeId && (!code || code.productId !== input.productId || code.purposeId !== input.purposeId)) throw new QrManualError('RECORD_CHANGED', '二维码记录已变化，请重新打开');
    const links = input.qrCodeId ? this.db.prepare('select id from qr_manual_links where qr_code_id=? and unlinked_at is null').all(input.qrCodeId) : [];
    // New records also need a revision: their filename validation depends on
    // live product identity, purpose and selected appearance, not a QR row yet.
    const identity = this.db.prepare('select * from product_identity_members where raw_product_id=?').get(input.productId) as {canonical_product_id:number}|undefined;
    const product = this.db.prepare('select * from products where id=?').get(input.productId);
    const canonicalProduct = this.db.prepare('select * from products where id=?').get(identity?.canonical_product_id ?? input.productId);
    const purpose = this.db.prepare('select * from qr_purposes where id=?').get(input.purposeId);
    const appearanceId = input.appearanceVersionId ?? code?.appearanceVersionId;
    const appearance = appearanceId == null ? null : this.db.prepare('select * from product_appearance_versions where id=?').get(appearanceId);
    const colors = appearanceId == null ? [] : this.db.prepare('select color_id from product_appearance_colors where appearance_version_id=? order by color_id').all(appearanceId);
    return createHash('sha256').update(JSON.stringify({ code, links, identity, product, canonicalProduct, purpose, appearance, colors })).digest('hex');
  }
  preview(input: QrManualInput): QrManualPreview {
    if (!input || typeof input.token!=='string' || typeof input.name!=='string' || input.name.length>500
      || typeof input.targetUrl!=='string' || input.targetUrl.length>2000
      || !Number.isSafeInteger(input.productId) || input.productId<=0
      || !Number.isSafeInteger(input.purposeId) || input.purposeId<=0
      || (input.qrCodeId!=null&&(!Number.isSafeInteger(input.qrCodeId)||input.qrCodeId<=0))
      || (input.appearanceVersionId!=null&&(!Number.isSafeInteger(input.appearanceVersionId)||input.appearanceVersionId<=0))) {
      throw new QrManualError('INVALID_REQUEST','手动二维码参数无效');
    }
    const selection = this.selections.get(input.token);
    if (!selection || selection.expires < Date.now()) throw new QrManualError('SELECTION_EXPIRED', '文件选择已过期，请重新选择');
    if (!input.name.trim()) throw new QrManualError('INVALID_NAME', '二维码名称不能为空');
    const product = this.db.prepare(`select coalesce(master.model,product.model) as model from products product left join product_identity_members identity on identity.raw_product_id=product.id left join products master on master.id=identity.canonical_product_id where product.id=? and product.deleted_at is null`).get(input.productId) as { model: string } | undefined;
    const purpose = this.repository.listPurposes().find(p => p.id === input.purposeId && p.status === 'active');
    if (!product || !purpose) throw new QrManualError('NOT_FOUND', '产品或用途不存在');
    if (input.appearanceVersionId!=null) new QrService(this.db).list({productId:input.productId,appearanceVersionId:input.appearanceVersionId});
    if (input.qrCodeId) {
      const code=this.repository.get(input.qrCodeId);
      if (!code || input.name!==code.name || input.targetUrl!==code.targetUrl || (input.appearanceVersionId??null)!==(code.appearanceVersionId??null)) throw new QrManualError('METADATA_CHANGED','更换文件仅修改文件关联；请先在详情中保存二维码名称或网址');
    }
    const current = fingerprint(selection.file.path);
    if (JSON.stringify(current) !== JSON.stringify(selection.file)) throw new QrManualError('FILE_CHANGED', '文件已改变，请重新选择');
    const issues = validateQrManualFilename(current.fileName, product.model, purpose.englishName, input.targetUrl);
    const revision = this.revision(input); const previewId = randomUUID();
    this.previews.set(previewId, { input: { ...input }, file: current, issues, revision, expires: Date.now() + 10 * 60_000 });
    return { previewId, fileName: current.fileName, path: current.path, tail: qrUrlTail(input.targetUrl), issues, revision };
  }
  commit(previewId: string, exception?: { confirmed: boolean; reason: string }) {
    const prepared = this.previews.get(previewId);
    if (!prepared || prepared.expires < Date.now()) throw new QrManualError('PREVIEW_EXPIRED', '预检已过期，请重新校验');
    if (prepared.issues.length && (exception?.confirmed !== true || typeof exception.reason !== 'string' || exception.reason.trim().length < 5)) throw new QrManualError('VALIDATION_BLOCKED', '校验不一致；例外关联需明确确认并填写至少5字理由');
    const file = fingerprint(prepared.file.path);
    if (JSON.stringify(file) !== JSON.stringify(prepared.file)) throw new QrManualError('FILE_CHANGED', '文件在预检后改变，请重新选择');
    const result = this.db.transaction(() => {
      if (this.revision(prepared.input) !== prepared.revision) throw new QrManualError('RECORD_CHANGED', '二维码记录在预检后改变，请重新校验');
      const input = prepared.input; const now = new Date().toISOString();
      let code = input.qrCodeId ? this.repository.get(input.qrCodeId)! : new QrService(this.db).create({ productId: input.productId, purposeId: input.purposeId, name: input.name.trim(), targetUrl: input.targetUrl.trim(), status: 'inactive', ...(input.appearanceVersionId ? { appearanceVersionId: input.appearanceVersionId } : {}) });
      // Existing QR identity, name, URL, state and all historical references remain unchanged.
      if (!input.qrCodeId) code = this.repository.get(code.id)!;
      const fileId = randomUUID();
      this.db.prepare('insert into qr_manual_files(id,absolute_path,file_name,size_bytes,modified_ms,content_sha256,created_at) values(?,?,?,?,?,?,?)').run(fileId,file.path,file.fileName,file.size,file.modified,file.hash,now);
      this.db.prepare('update qr_manual_links set unlinked_at=? where qr_code_id=? and unlinked_at is null').run(now, code.id);
      this.db.prepare('insert into qr_manual_links(qr_code_id,file_id,linked_at,exception_reason) values(?,?,?,?)').run(code.id,fileId,now,prepared.issues.length ? exception!.reason.trim() : null);
      this.audit('link',code.id,fileId,prepared.issues.length ? exception!.reason.trim() : null,{ issues: prepared.issues, previousRevision: prepared.revision });
      return this.repository.get(code.id)!;
    }).immediate();
    this.previews.delete(previewId); this.selections.delete(prepared.input.token); return result;
  }
  unlink(qrCodeId: number, expectedRevision: string) {
    const code = this.repository.get(qrCodeId);
    if (!code) throw new QrManualError('NOT_FOUND','二维码不存在');
    if (!code.files.length) throw new QrManualError('NO_CURRENT_LINK','当前没有关联文件');
    return this.db.transaction(() => {
      if (this.revision({ qrCodeId, productId: code.productId, purposeId: code.purposeId } as QrManualInput) !== expectedRevision) throw new QrManualError('RECORD_CHANGED','二维码已变化，请刷新');
      this.db.prepare('update qr_manual_links set unlinked_at=? where qr_code_id=? and unlinked_at is null').run(new Date().toISOString(),qrCodeId);
      this.audit('unlink',qrCodeId,null,null,{}); return this.repository.get(qrCodeId)!;
    }).immediate();
  }
  history(qrCodeId: number) {
    const code = this.repository.get(qrCodeId);
    if (!code) throw new QrManualError('NOT_FOUND','二维码不存在');
    return {
      revision: this.revision({ qrCodeId, productId:code.productId, purposeId:code.purposeId } as QrManualInput),
      items: this.db.prepare(`select link.*,file.file_name,file.absolute_path from qr_manual_links link
        join qr_manual_files file on file.id=link.file_id where qr_code_id=? order by link.id desc`).all(qrCodeId),
      legacyItems: this.db.prepare(`select id,file_name as fileName,relative_path as relativePath,
        mime_type as mimeType,is_present as isPresent from qr_code_files where qr_code_id=? order by id`).all(qrCodeId),
    };
  }
  resolveFile(fileId: string) {
    const row = this.db.prepare('select absolute_path,content_sha256 from qr_manual_files where id=?').get(fileId) as { absolute_path: string; content_sha256: string } | undefined;
    if (!row) throw new QrManualError('NOT_FOUND','文件记录不存在');
    const file = fingerprint(row.absolute_path);
    if (file.hash !== row.content_sha256) throw new QrManualError('FILE_CHANGED','文件内容已变化，请重新关联');
    return { path: file.path, mimeType: 'application/pdf' };
  }
  private audit(event: string, codeId: number, fileId: string | null, reason: string | null, details: unknown) {
    this.db.prepare('insert into qr_manual_audit(event,qr_code_id,file_id,reason,details_json,created_at) values(?,?,?,?,?,?)').run(event,codeId,fileId,reason,JSON.stringify(details),new Date().toISOString());
  }
}
