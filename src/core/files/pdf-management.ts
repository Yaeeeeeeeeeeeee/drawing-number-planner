import { createHash } from 'node:crypto';
import type { PlannerDatabase } from '../../db/database.js';
import type { IndexedFileSnapshot, CurrentFileSnapshot, FileScanDifference } from './file-scan-diff.js';
import { FileError } from './file-errors.js';

export type PdfManagementAction = 'clear' | 'ignore' | 'restore';
export interface PdfManagementInput { ids: number[]; action: PdfManagementAction }
export interface PdfManagementEntry { id: number; relativePath: string; allowed: boolean; reason: string | null }
export interface PdfManagementPreview extends PdfManagementInput {
  fingerprint: string; confirmation: string; entries: PdfManagementEntry[]; allowed: number; blocked: number;
}
export interface PdfDiskEvidence { id: number; sha256?: string; error?: string }
export interface PdfManagementApplyInput extends PdfManagementInput { fingerprint: string; confirmation: string }
export const pdfWorkspaceKey = (root: string | null): string => createHash('sha256')
  .update((root ?? '').replace(/\\/g, '/').replace(/\/+$/, '').normalize('NFC')).digest('hex');
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

/** Decisions deliberately live outside pdf_files so clearing a disposable index cannot erase them. */
export class PdfManagementRepository {
  constructor(private readonly db: PlannerDatabase) {}

  private references(id: number): Array<{ table: string; column: string; rows: unknown[] }> {
    const tables = this.db.prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%'").all() as Array<{ name: string }>;
    const result: Array<{ table: string; column: string; rows: unknown[] }> = [];
    for (const { name } of tables) {
      const keys = this.db.prepare(`pragma foreign_key_list(${quote(name)})`).all() as Array<{ table: string; from: string }>;
      for (const key of keys.filter(key => key.table === 'pdf_files')) {
        const rows = this.db.prepare(`select * from ${quote(name)} where ${quote(key.from)} = ?`).all(id);
        if (rows.length) result.push({ table: name, column: key.from, rows });
      }
    }
    // Detached snapshots and product-merge provenance remain evidence after live FKs change.
    for (const [table, columns] of [
      ['bom_revision_snapshots', ['before_snapshot_json','after_snapshot_json']],
      ['outbound_v2_snapshots', ['context_json','files_json']],
    ] as Array<[string,string[]]>) {
      if (!this.db.prepare("select 1 from sqlite_master where type='table' and name=?").get(table)) continue;
      const conditions = columns.map(column => `exists(select 1 from json_tree(${quote(column)}) entry
        where entry.key in ('pdfFileId','pdfIndexId','pdf_file_id','pdf_index_id') and entry.type='integer' and entry.value=?)`).join(' or ');
      const rows = this.db.prepare(`select * from ${quote(table)} where ${conditions}`).all(...columns.map(()=>id));
      if(rows.length) result.push({table,column:'snapshot.pdfIndexId',rows});
    }
    const rows = this.db.prepare(`select * from product_merge_events where exists(
      select 1 from json_each(before_json,'$.references') reference,json_each(reference.value,'$.ids') listed
      where json_extract(reference.value,'$.table')='pdf_files' and listed.type='integer' and listed.value=@id
    ) or exists(
      select 1 from json_each(after_json,'$.references') reference,json_each(reference.value,'$.ids') listed
      where json_extract(reference.value,'$.table')='pdf_files' and listed.type='integer' and listed.value=@id
    )`).all({id});
    if(rows.length) result.push({table:'product_merge_events',column:'references.pdf_files',rows});
    return result;
  }

  preview(input: PdfManagementInput, workspaceKey: string, diskEvidence: PdfDiskEvidence[] = []): PdfManagementPreview {
    if (!['clear', 'ignore', 'restore'].includes(input.action) || !Array.isArray(input.ids) || !input.ids.length
      || input.ids.length > 500 || input.ids.some(id => !Number.isInteger(id) || id <= 0)
      || new Set(input.ids).size !== input.ids.length) throw new FileError('INVALID_CLEANUP_IDS', '请选择 1–500 条不重复的 PDF 索引');
    const ids = [...input.ids].sort((a, b) => a - b);
    const snapshots = ids.map(id => {
      const row = this.db.prepare('select * from pdf_files where id = ?').get(id) as Record<string, unknown> | undefined;
      return { id, row: row ?? null, references: row ? this.references(id) : [] };
    });
    const entries = snapshots.map(({ id, row, references }): PdfManagementEntry => {
      let reason: string | null = !row ? '索引不存在，请刷新列表' : null;
      if (row && input.action === 'clear' && (references.length || row.drawing_id != null || row.historical_drawing_id != null)) {
        reason = references.length ? `保留历史追溯：被 ${references.map(ref => ref.table).join('、')} 引用` : '已关联图号，保留稳定索引与历史追溯';
      }
      const disk = diskEvidence.find(item => item.id === id);
      if (disk?.error) reason = disk.error;
      else if (row && disk?.sha256 && disk.sha256 !== row.content_sha256) reason = '磁盘内容已变化，请重新扫描并复核后再操作';
      if (row && input.action !== 'clear' && !row.content_sha256) reason = '缺少内容指纹，请先扫描后再决定';
      return { id, relativePath: String(row?.relative_path ?? ''), allowed: reason === null, reason };
    });
    const decisions = this.db.prepare('select * from pdf_file_decisions where workspace_key = ? order by id').all(workspaceKey);
    return { action: input.action, ids, entries, allowed: entries.filter(entry => entry.allowed).length,
      blocked: entries.filter(entry => !entry.allowed).length,
      confirmation: { clear: '清除 PDF 索引', ignore: '暂不纳入 PDF', restore: '恢复纳入 PDF' }[input.action],
      fingerprint: createHash('sha256').update(JSON.stringify({ workspaceKey, action: input.action, snapshots, decisions, diskEvidence })).digest('hex') };
  }

  apply(input: PdfManagementApplyInput, workspaceKey: string, diskEvidence: PdfDiskEvidence[] = []): { changed: number; blocked: PdfManagementEntry[] } {
    return this.db.transaction(() => {
      const preview = this.preview(input, workspaceKey, diskEvidence);
      if (input.fingerprint !== preview.fingerprint) throw new FileError('PDF_PREVIEW_STALE', 'PDF 或引用已变化，请重新预览');
      if (input.confirmation !== preview.confirmation) throw new FileError('INVALID_CLEAR_INDEX_CONFIRMATION', `请准确输入“${preview.confirmation}”`);
      let changed = 0;
      for (const entry of preview.entries.filter(entry => entry.allowed)) {
        if (input.action === 'clear') this.db.prepare('delete from pdf_files where id = ?').run(entry.id);
        else {
          const row = this.db.prepare('select path_key, content_sha256 from pdf_files where id = ?').get(entry.id) as { path_key: string; content_sha256: string };
          this.db.prepare(`insert into pdf_file_decisions(workspace_key, path_key, content_sha256, decision, updated_at)
            values (?, ?, ?, ?, ?) on conflict(workspace_key, path_key, content_sha256)
            do update set decision = excluded.decision, updated_at = excluded.updated_at`)
            .run(workspaceKey, row.path_key, row.content_sha256, input.action === 'ignore' ? 'ignore' : 'restored', new Date().toISOString());
          this.db.prepare('update pdf_files set management_state = ? where id = ?').run(input.action === 'ignore' ? 'ignored' : 'included', entry.id);
        }
        changed++;
      }
      return { changed, blocked: preview.entries.filter(entry => !entry.allowed) };
    }).immediate();
  }

  reconcileMoves(workspaceKey: string, previous: IndexedFileSnapshot[], current: CurrentFileSnapshot[], differences: FileScanDifference[], scannedAt: string): void {
    const decisions = this.db.prepare('select path_key as pathKey,content_sha256 as hash,decision from pdf_file_decisions where workspace_key=?').all(workspaceKey) as Array<{pathKey:string;hash:string;decision:string}>;
    const paths = new Set(current.map(file => file.pathKey));
    const insert = this.db.prepare(`insert or ignore into pdf_file_decisions(workspace_key,path_key,content_sha256,decision,updated_at) values(?,?,?,?,?)`);
    for (const change of differences.filter(change => change.type === 'moved' || change.type === 'added')) {
      const file = current.find(file => file.relativePath === change.relativePath);
      if (!file?.contentSha256 || decisions.some(decision => decision.pathKey === file.pathKey && decision.hash === file.contentSha256)) continue;
      const possible = decisions.filter(decision => decision.hash === file.contentSha256 && decision.decision !== 'restored' && !paths.has(decision.pathKey));
      if (!possible.length) continue;
      const prior = previous.find(prior => prior.id === change.previousFileId);
      const reliable = change.type === 'moved' && prior && previous.filter(row => row.contentSha256 === file.contentSha256).length === 1
        && current.filter(row => row.contentSha256 === file.contentSha256).length === 1
        && possible.some(decision => decision.pathKey === prior.pathKey && decision.decision === 'ignore');
      insert.run(workspaceKey, file.pathKey, file.contentSha256, reliable ? 'ignore' : 'needs_review', scannedAt);
    }
  }

  reconcile(workspaceKey: string): void {
    // A changed file at the same path requires review. Same-hash copies at other paths are independent.
    this.db.prepare(`update pdf_files set management_state = case
      when exists(select 1 from pdf_file_decisions d where d.workspace_key = @workspaceKey
        and d.path_key = pdf_files.path_key and d.content_sha256 = pdf_files.content_sha256 and d.decision = 'ignore') then 'ignored'
      when exists(select 1 from pdf_file_decisions d where d.workspace_key = @workspaceKey
        and d.path_key = pdf_files.path_key and d.content_sha256 = pdf_files.content_sha256 and d.decision = 'restored') then 'included'
      when exists(select 1 from pdf_file_decisions d where d.workspace_key = @workspaceKey
        and d.path_key = pdf_files.path_key and d.decision = 'needs_review') then 'needs_review'
      when exists(select 1 from pdf_file_decisions d where d.workspace_key = @workspaceKey
        and d.path_key = pdf_files.path_key and d.decision = 'ignore') then 'needs_review'
      else 'included' end`).run({ workspaceKey });
  }
}
