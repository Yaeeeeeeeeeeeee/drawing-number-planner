import type { PlannerDatabase } from '../../db/database.js';
import { OccupiedNumberRepository } from '../planning/occupied-number-repository.js';
import { MaterialBatchService } from '../files/material-batch-service.js';
import { DrawingRepository } from './drawing-repository.js';
import type { DeleteDrawingInput, DrawingDeletionBlocker, DrawingDeletionPreview,
  DrawingDeletionReferenceCounts, DrawingDeletionResult } from './drawing-deletion-types.js';
import type { DrawingOrigin, DrawingStatus } from './drawing-types.js';

interface DeletionRow {
  id: number;
  origin: DrawingOrigin;
  fullCode: string;
  storedFullCode: string;
  status: DrawingStatus;
  deletedAt: string | null;
  deletionMode: 'retain_occupied' | 'release' | null;
  previousStatus: string | null;
}

export class DrawingDeletionError extends Error {
  constructor(public readonly code: 'DRAWING_NOT_FOUND' | 'DRAWING_ALREADY_DELETED' | 'DRAWING_CONFIRMATION_MISMATCH'
    | 'DRAWING_DELETE_BLOCKED' | 'DRAWING_NOT_DELETED' | 'DRAWING_RESTORE_CONFLICT', message: string,
  public readonly preview?: DrawingDeletionPreview) { super(message); }
}

export class DrawingDeletionService {
  private readonly batches: MaterialBatchService;

  constructor(private readonly db: PlannerDatabase) { this.batches = new MaterialBatchService(db); }

  deleteBatch(inputs: DeleteDrawingInput[]) {
    const seen = new Set<number>();
    const items = inputs.filter((input) => {
      if (seen.has(input.signedId)) return false;
      seen.add(input.signedId); return true;
    }).map((input) => {
      try { return { signedId: input.signedId, status: 'deleted' as const, result: this.delete(input) }; }
      catch (error) {
        if (!(error instanceof DrawingDeletionError)) return { signedId: input.signedId, status: 'failed' as const,
          code: 'DRAWING_DELETE_FAILED', message: '该项删除失败，事务已回滚；请刷新后检查' };
        return { signedId: input.signedId, status: 'skipped' as const, code: error.code, message: error.message };
      }
    });
    return { items };
  }

  preview(signedId: number): DrawingDeletionPreview {
    const row = this.getRow(signedId);
    if (!row) throw new DrawingDeletionError('DRAWING_NOT_FOUND', '图号记录不存在');
    if (row.deletedAt && row.deletionMode !== 'retain_occupied') throw new DrawingDeletionError('DRAWING_ALREADY_DELETED', '图号号码已经释放');
    return this.buildPreview(signedId, row);
  }

  delete(input: DeleteDrawingInput): DrawingDeletionResult {
    return this.db.transaction(() => {
      const row = this.getRow(input.signedId);
      if (!row) throw new DrawingDeletionError('DRAWING_NOT_FOUND', '图号记录不存在');
      if (row.deletedAt && (row.deletionMode !== 'retain_occupied' || input.mode !== 'release')) {
        throw new DrawingDeletionError('DRAWING_ALREADY_DELETED', '已删除记录只能继续释放占号，不能重复删除');
      }
      if (row.fullCode !== input.confirmedCode.trim()) {
        throw new DrawingDeletionError('DRAWING_CONFIRMATION_MISMATCH', '确认图号与当前图号不一致');
      }
      const preview = this.buildPreview(input.signedId, row);
      if (!preview.deletable) {
        throw new DrawingDeletionError('DRAWING_DELETE_BLOCKED', preview.blockers.map((item) => item.message).join('；'), preview);
      }
      if(input.mode==='release'&&!preview.releaseEligible)
        throw new DrawingDeletionError('DRAWING_DELETE_BLOCKED',preview.releaseBlockers.map(item=>item.message).join('；'),preview);
      const now = new Date().toISOString();
      const event = this.db.prepare(`insert into drawing_deletion_events
        (origin, record_id, full_code, deletion_mode, previous_status, reason, reference_summary_json, deleted_at)
        values (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(row.origin, row.id, row.fullCode, input.mode, row.status, input.reason?.trim() || null,
          JSON.stringify(preview.references), now);
      const table = row.origin === 'planned' ? 'drawing_numbers' : 'historical_drawing_numbers';
      const archiveCode = `__deleted__:${row.origin}:${row.id}:${Number(event.lastInsertRowid)}`;
      this.db.prepare(`update ${table} set full_code = ?, deleted_at = ?, deletion_mode = ?, deleted_full_code = ?,
        deleted_previous_status = ?, deleted_reason = ?, scan_resolution = 'pending' where id = ?`)
        .run(input.mode === 'release' ? archiveCode : row.storedFullCode, now, input.mode, row.fullCode,
          row.status, input.reason?.trim() || null, row.id);
      this.detachPdfIndexes(row, input.mode);
      return (input.mode === 'release'
        ? { outcome: 'deleted_released', fullCode: row.fullCode, occupied: false }
        : { outcome: 'deleted_retained', fullCode: row.fullCode, occupied: true }) as DrawingDeletionResult;
    }).immediate();
  }

  restore(signedId: number) {
    this.db.transaction(() => {
      const row = this.getRow(signedId);
      if (!row) throw new DrawingDeletionError('DRAWING_NOT_FOUND', '图号记录不存在');
      if (!row.deletedAt || !row.deletionMode || !row.previousStatus) {
        throw new DrawingDeletionError('DRAWING_NOT_DELETED', '图号记录未处于已删除状态');
      }
      if (this.occupiedByAnother(row)) {
        throw new DrawingDeletionError('DRAWING_RESTORE_CONFLICT', `图号 ${row.fullCode} 已被其他记录占用，无法恢复`);
      }
      const table = row.origin === 'planned' ? 'drawing_numbers' : 'historical_drawing_numbers';
      if (this.db.prepare(`select 1 from ${table} drawing join products product on product.id = drawing.product_id
        where drawing.id = ? and product.deleted_at is not null`).get(row.id)) {
        throw new DrawingDeletionError('DRAWING_RESTORE_CONFLICT', '所属产品已退出当前业务，不能单独恢复其图号');
      }
      this.db.prepare(`update ${table} set full_code = deleted_full_code, status = deleted_previous_status,
        deleted_at = null, deletion_mode = null, deleted_full_code = null, deleted_previous_status = null,
        deleted_reason = null, scan_resolution = null where id = ?`).run(row.id);
      this.db.prepare(`update drawing_deletion_events set restored_at = ? where id = (
        select id from drawing_deletion_events where origin = ? and record_id = ? and restored_at is null
        order by id desc limit 1)`).run(new Date().toISOString(), row.origin, row.id);
      const target = row.origin === 'planned' ? 'drawing_id' : 'historical_drawing_id';
      this.db.prepare(`update pdf_files set ${target} = ?, match_status = 'matched', classification_warning = null
        where drawing_id is null and historical_drawing_id is null and exists (
          select 1 from json_each(pdf_files.detected_codes_json) where json_each.value = ?
        )`).run(row.id, row.fullCode);
    }).immediate();
    const drawing = new DrawingRepository(this.db).getDetail(signedId);
    if (!drawing) throw new DrawingDeletionError('DRAWING_NOT_FOUND', '恢复后的图号记录不存在');
    return { ...drawing, batchUsage: this.batches.getDrawingUsage(drawing.fullCode, drawing.status) };
  }

  resolveScan(signedId: number, resolution: 'reimport' | 'ignore') {
    if (resolution === 'reimport') return { resolution, drawing: this.restore(signedId) } as const;
    const row = this.getRow(signedId);
    if (!row) throw new DrawingDeletionError('DRAWING_NOT_FOUND', '图号记录不存在');
    if (!row.deletedAt) throw new DrawingDeletionError('DRAWING_NOT_DELETED', '图号记录未处于已删除状态');
    const table = row.origin === 'planned' ? 'drawing_numbers' : 'historical_drawing_numbers';
    this.db.transaction(() => {
      this.db.prepare(`update ${table} set scan_resolution = 'ignore' where id = ?`).run(row.id);
      this.db.prepare(`update pdf_files set classification_warning = 'drawing-released-ignored'
        where drawing_id is null and historical_drawing_id is null and exists (
          select 1 from json_each(pdf_files.detected_codes_json) where json_each.value = ?
        )`).run(row.fullCode);
    }).immediate();
    return { resolution, fullCode: row.fullCode } as const;
  }

  private getRow(signedId: number): DeletionRow | undefined {
    const origin: DrawingOrigin = signedId < 0 ? 'historical' : 'planned';
    const id = Math.abs(signedId);
    const table = origin === 'planned' ? 'drawing_numbers' : 'historical_drawing_numbers';
    return this.db.prepare(`select id, ? as origin, coalesce(deleted_full_code, full_code) as fullCode,
      full_code as storedFullCode, status, deleted_at as deletedAt, deletion_mode as deletionMode,
      deleted_previous_status as previousStatus from ${table} where id = ?`).get(origin, id) as DeletionRow | undefined;
  }

  private buildPreview(signedId: number, row: DeletionRow): DrawingDeletionPreview {
    const referenceColumn = row.origin === 'planned' ? 'drawing_id' : 'historical_drawing_id';
    const pdf = this.db.prepare(`select
      sum(case when is_present = 1 then 1 else 0 end) as presentPdf,
      sum(case when is_present = 0 then 1 else 0 end) as missingPdf,
      sum(case when conversion_type = 'source' then 1 else 0 end) as sourcePdf,
      sum(case when conversion_type = 'outlined' then 1 else 0 end) as outlinedPdf
      from pdf_files where ${referenceColumn} = ?`).get(row.id) as Record<string, number | null>;
    const bom = this.db.prepare(`select
      sum(case when current.version_id = item.bom_version_id then 1 else 0 end) as currentBom,
      sum(case when current.version_id is null or current.version_id <> item.bom_version_id then 1 else 0 end) as historicalBom
      from bom_items item left join bom_current current on current.version_id = item.bom_version_id
      where item.${referenceColumn} = ? and item.deleted_at is null`).get(row.id) as Record<string, number | null>;
    const usage = this.batches.getDrawingUsage(row.fullCode, row.status);
    const lineage = row.origin === 'planned' ? (this.db.prepare(`select count(*) as count from drawing_numbers
      where deleted_at is null and id <> ? and (previous_drawing_id = ? or source_drawing_id = ?)`)
      .get(row.id, row.id, row.id) as { count: number }).count : 0;
    const outboundSnapshot = (this.db.prepare(`select count(*) as count from outbound_package_items
      where ${referenceColumn} = ?`).get(row.id) as { count: number }).count;
    const references: DrawingDeletionReferenceCounts = {
      presentPdf: pdf.presentPdf ?? 0, missingPdf: pdf.missingPdf ?? 0,
      sourcePdf: pdf.sourcePdf ?? 0, outlinedPdf: pdf.outlinedPdf ?? 0,
      currentBom: bom.currentBom ?? 0, historicalBom: bom.historicalBom ?? 0,
      currentMaterial: usage.currentProductCount, historicalMaterial: usage.historicalProductCount,
      lineage, outboundSnapshot, emailDraft: 0, qrCode: 0,
    };
    const blockers: DrawingDeletionBlocker[] = [];
    const appearanceUsage=(this.db.prepare('select count(*) as n from drawing_appearance_usages where origin=? and record_id=?').get(row.origin,row.id) as {n:number}).n;
    if(appearanceUsage)blockers.push({kind:'appearance_usage',count:appearanceUsage,message:`无法删除：该图号已明确沿用到 ${appearanceUsage} 个外观版本，须保留占号与追溯`});
    if (references.currentBom) blockers.push({ kind: 'current_bom', count: references.currentBom,
      message: `无法删除：该图号当前被 ${references.currentBom} 条 BOM 明细使用` });
    if (references.currentMaterial) blockers.push({ kind: 'current_material', count: references.currentMaterial,
      message: `无法删除：该图号仍在 ${references.currentMaterial} 个最新有效资料批次中使用` });
    if (references.lineage) blockers.push({ kind: 'lineage', count: references.lineage,
      message: `无法删除：该图号仍被 ${references.lineage} 条图号版本关系引用` });
    const releaseBlockers:DrawingDeletionBlocker[]=[...blockers];
    if(row.origin==='historical')releaseBlockers.push({kind:'historical_occupation',count:1,message:'该图号存在历史扫描占用记录，无法释放号码；可删除图号并保留占号。'});
    else if((row.previousStatus??row.status)!=='reserved')releaseBlockers.push({kind:'usage_unproven',count:1,message:'该正式图号已启用或缺少从未使用的可靠记录，无法确认属于未使用误占；可删除图号并保留占号。'});
    const protectedRows=(this.db.prepare(`select
      (select count(*) from pdf_files file where file.${referenceColumn}=@id or exists(select 1 from json_each(file.detected_codes_json) code where code.value=@code)) as pdf,
      (select count(*) from bom_items item where item.${referenceColumn}=@id) as bom,
      (select count(*) from outbound_package_items item where item.${referenceColumn}=@id or item.drawing_code_snapshot=@code) as outbound,
      (select count(*) from drawing_deletion_events event where event.origin=@origin and event.record_id=@id and exists(select 1 from json_each(event.reference_summary_json) refs where cast(refs.value as integer)>0)) as previousReferences,
      (select count(*) from drawing_numbers drawing where @origin='planned' and (drawing.previous_drawing_id=@id or drawing.source_drawing_id=@id)) as lineage
    `).get({id:row.id,code:row.fullCode,origin:row.origin}) as Record<string,number>);
    const protectedCount=Object.values(protectedRows).reduce((sum,count)=>sum+count,0);
    if(protectedCount)releaseBlockers.push({kind:'protected_history',count:protectedCount,message:'该图号存在受保护的 PDF、BOM、外发、图号关系或删除前历史引用，无法释放号码；须保留占号与追溯。'});
    return { signedId, origin: row.origin, fullCode: row.fullCode, status: row.status,
      deletable: blockers.length === 0, releaseEligible:releaseBlockers.length===0,releaseBlockers, references, blockers };
  }

  private detachPdfIndexes(row: DeletionRow, mode: 'retain_occupied' | 'release'): void {
    const referenceColumn = row.origin === 'planned' ? 'drawing_id' : 'historical_drawing_id';
    const files = this.db.prepare(`select id, detected_codes_json as detectedCodes from pdf_files
      where ${referenceColumn} = ?`).all(row.id) as Array<{ id: number; detectedCodes: string }>;
    const update = this.db.prepare(`update pdf_files set drawing_id = null, historical_drawing_id = null,
      match_status = 'pending', detected_codes_json = ?, classification_warning = ? where id = ?`);
    for (const file of files) {
      const parsed = JSON.parse(file.detectedCodes) as unknown;
      const codes = Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
      if (!codes.includes(row.fullCode)) codes.push(row.fullCode);
      const warning = mode === 'release' ? '图号已人工释放' : '图号已人工删除并保留占号';
      update.run(JSON.stringify(codes), warning, file.id);
    }
  }

  private occupiedByAnother(row: DeletionRow): boolean {
    const planned = this.db.prepare(`select count(*) as count from drawing_numbers where id <> ?
      and (deleted_at is null or deletion_mode = 'retain_occupied') and coalesce(deleted_full_code, full_code) = ?`)
      .get(row.origin === 'planned' ? row.id : -1, row.fullCode) as { count: number };
    const historical = this.db.prepare(`select count(*) as count from historical_drawing_numbers where id <> ?
      and (deleted_at is null or deletion_mode = 'retain_occupied') and coalesce(deleted_full_code, full_code) = ?`)
      .get(row.origin === 'historical' ? row.id : -1, row.fullCode) as { count: number };
    return planned.count + historical.count > 0;
  }
}
