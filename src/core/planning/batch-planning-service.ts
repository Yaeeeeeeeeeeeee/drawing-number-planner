import { createHash } from 'node:crypto';
import type { PlannerDatabase } from '../../db/database.js';
import { parseDrawingCode } from '../drawings/drawing-code.js';
import { effectiveDrawingProductSql } from '../drawings/drawing-product-evidence.js';
import { resolveCanonicalProductId } from '../products/appearance-identity.js';
import { formatDisplayName } from './code-generator.js';
import { PlanningError } from './planning-errors.js';
import { PlanningRepository } from './planning-repository.js';
import type { PlanningService } from './planning-service.js';
import type { BatchPlanningCheck, BatchPlanningInput, BatchPlanningPreview, BatchPlanningResult, BatchPlanningRow,
  BatchReservePlanningInput, PlanningContext, PlanningWhiteBasesInput, WhiteDrawingBase } from './planning-types.js';

type Group = BatchPlanningInput['groups'][number];
const isWhite = (name: string) => ['白色', '白', 'white'].includes(name.trim().toLowerCase());
function failure(error: unknown): { code: string; message: string } {
  return error instanceof PlanningError ? { code: error.code, message: error.message }
    : { code: 'PLANNING_FAILED', message: error instanceof Error ? error.message : '图号处理失败，请重新检查' };
}

/** Batch orchestration only. Allocation is always the existing single-product planner. */
export class BatchPlanningService {
  private readonly repository: PlanningRepository;
  constructor(private readonly db: PlannerDatabase, private readonly planner: PlanningService) {
    this.repository = new PlanningRepository(db);
  }

  private resolveContext(group: Omit<Group, 'rows'>, row: BatchPlanningRow): PlanningContext {
    const context = this.repository.resolveContext({ ...group, rows: [row] });
    const ids = [context.brandId, context.productSizeId, context.appearanceId, row.colorId, row.mainCategoryId, row.projectItemId];
    const deleted = this.db.prepare(`select 1 from dictionary_items where id in (${ids.map(() => '?').join(',')}) and deleted_at is not null limit 1`).get(...ids);
    if (deleted) throw new PlanningError('DICTIONARY_NOT_ACTIVE', '产品或项目引用的编码已删除，请核对资料');
    if (!context.model.trim() || !context.productCategory.trim()) throw new PlanningError('INVALID_PLAN', '产品型号或类别资料不完整');
    return context;
  }

  private bases(context: PlanningContext, mainId: number, itemId: number): WhiteDrawingBase[] {
    const main = this.db.prepare('select code from dictionary_items where id=?').get(mainId) as { code: string };
    const item = this.db.prepare('select code from dictionary_items where id=?').get(itemId) as { code: string };
    const colors = this.db.prepare("select id,code,name from dictionary_items where type='color' and status='active' and deleted_at is null").all() as Array<{ id: number; code: string; name: string }>;
    const whites = colors.filter(color => isWhite(color.name));
    const results: WhiteDrawingBase[] = [];
    for (const origin of ['planned', 'historical'] as const) {
      const records = this.db.prepare(`select record.*, ${effectiveDrawingProductSql(`'${origin}'`, 'record.id')} as owner,
        binding.appearance_version_id as bound_version_id,version.appearance_id as bound_appearance_id
        from ${origin === 'planned' ? 'drawing_numbers' : 'historical_drawing_numbers'} record
        left join drawing_appearance_bindings binding on binding.origin=? and binding.record_id=record.id
        left join product_appearance_versions version on version.id=binding.appearance_version_id
        where record.deleted_at is null and record.status in ('reserved','active') and record.appearance_code=?
        and record.main_category_code=? and record.project_item_code=?`).all(origin, context.appearanceCode, main.code, item.code) as Array<Record<string, unknown>>;
      for (const record of records) {
        if (record.owner !== context.productId) continue;
        if (record.bound_appearance_id != null && record.bound_appearance_id !== context.appearanceId) continue;
        if (context.appearanceVersionId !== undefined && record.bound_version_id != null
          && record.bound_version_id !== context.appearanceVersionId) continue;
        if (origin === 'planned' && (record.appearance_id !== context.appearanceId || record.main_category_id !== mainId || record.project_item_id !== itemId)) continue;
        const white = whites.find(color => color.code === record.color_code && (origin === 'historical' || color.id === record.color_id));
        if (!white) continue;
        const parsed = parseDrawingCode(String(record.full_code));
        if (!parsed || parsed.brandCode !== context.brandCode || parsed.productSizeCode !== context.productSizeCode
          || parsed.appearanceCode !== record.appearance_code || parsed.colorCode !== record.color_code
          || parsed.mainCategoryCode !== record.main_category_code || parsed.projectItemCode !== record.project_item_code
          || parsed.sequence !== record.sequence || !this.repository.hasFullCode(parsed.fullCode)) continue;
        results.push({ origin, id: Number(record.id), fullCode: parsed.fullCode,
          displayName: typeof record.display_name === 'string' ? record.display_name : parsed.fullCode });
      }
    }
    return results;
  }

  listWhiteBases(input: PlanningWhiteBasesInput): WhiteDrawingBase[] {
    const item = this.db.prepare("select parent_id from dictionary_items where id=? and type='project_item'").get(input.projectItemId) as { parent_id: number } | undefined;
    const color = (this.db.prepare("select id,name from dictionary_items where type='color' and status='active' and deleted_at is null order by id").all() as Array<{id:number;name:string}>).find(color => isWhite(color.name));
    if (!item || !color) return [];
    const context = this.resolveContext(input, { clientId: 'white-base', colorId: color.id,
      mainCategoryId: input.mainCategoryId ?? item.parent_id, projectItemId: input.projectItemId });
    return this.bases(context, context.rows[0].mainCategoryId, input.projectItemId);
  }

  private fingerprint(group: Group, row: BatchPlanningRow, check: BatchPlanningCheck, context: PlanningContext): string {
    const product = this.db.prepare('select * from products where id=?').get(context.productId);
    const ids = [context.brandId, context.productSizeId, context.appearanceId, row.colorId, row.mainCategoryId, row.projectItemId];
    const dictionaries = this.db.prepare(`select * from dictionary_items where id in (${ids.map(() => '?').join(',')}) order by id`).all(...ids);
    const version = context.appearanceVersionId === undefined ? null : this.db.prepare('select * from product_appearance_versions where id=?').get(context.appearanceVersionId);
    const identity = this.db.prepare('select * from product_identity_members where raw_product_id=? or canonical_product_id=? order by raw_product_id').all(group.productId, context.productId);
    const base = check.shared ? {
      record: this.db.prepare(`select * from ${check.shared.origin === 'planned' ? 'drawing_numbers' : 'historical_drawing_numbers'} where id=?`).get(check.shared.id),
      binding: this.db.prepare('select * from drawing_appearance_bindings where origin=? and record_id=?').get(check.shared.origin, check.shared.id),
      colors: this.db.prepare("select * from dictionary_items where type='color' order by id").all(),
    } : null;
    // Explicit fields exclude transport approval fields and retain every user input.
    const input = { productId: group.productId, appearanceId: group.appearanceId, appearanceVersionId: group.appearanceVersionId,
      row: { clientId: row.clientId, colorId: row.colorId, mainCategoryId: row.mainCategoryId, projectItemId: row.projectItemId,
        notes: row.notes, shareWhite: row.shareWhite, whiteBase: row.whiteBase } };
    return createHash('sha256').update(JSON.stringify({ input, product, dictionaries, version, identity, base,
      fullCode: check.fullCode, shared: check.shared })).digest('hex');
  }

  preview(input: BatchPlanningInput): BatchPlanningPreview {
    if (!Array.isArray(input.groups) || input.groups.length < 1 || input.groups.length > 100
      || input.groups.reduce((n, group) => n + group.rows.length, 0) > 1000) {
      throw new PlanningError('INVALID_PLAN', '每次请选择 1 至 100 个产品，最多 1000 个项目');
    }
    const canonical = input.groups.map(group => Number.isSafeInteger(group.productId) && group.productId > 0
      ? resolveCanonicalProductId(this.db, group.productId) : group.productId);
    const groups = input.groups.map((group, groupIndex) => {
      let model = '';
      if (Number.isSafeInteger(canonical[groupIndex]) && canonical[groupIndex] > 0) {
        model = (this.db.prepare('select model from products where id=?').get(canonical[groupIndex]) as {model:string}|undefined)?.model ?? '';
      }
      const clientIds = group.rows.map(row => row.clientId?.trim());
      const repeatedProduct = canonical.filter(id => id === canonical[groupIndex]).length > 1;
      const allocated: BatchPlanningRow[] = [];
      const rows = group.rows.map((row): BatchPlanningCheck => {
        const check: BatchPlanningCheck = { clientId: row.clientId, productId: group.productId, colorId: row.colorId,
          mainCategoryId: row.mainCategoryId, projectItemId: row.projectItemId, available: false };
        try {
          if (repeatedProduct || group.rows.length < 1 || group.rows.length > 100 || !row.clientId?.trim()
            || clientIds.filter(id => id === row.clientId.trim()).length > 1) {
            throw new PlanningError('INVALID_PLAN', '产品不能重复或使用同一产品的别名，项目行标识不能为空或重复');
          }
          if (![group.productId, row.colorId, row.mainCategoryId, row.projectItemId].every(id => Number.isSafeInteger(id) && id > 0)) {
            throw new PlanningError('INVALID_PLAN', '请选择有效产品和项目编码');
          }
          const context = this.resolveContext(group, row);
          model = context.model;
          const resolved = context.rows[0];
          if (row.whiteBase || (row.shareWhite === true && !isWhite(resolved.colorName))) {
            if (row.whiteBase && row.shareWhite === false) throw new PlanningError('INVALID_PLAN', '独立占号不能同时选择白色共用基准');
            const candidates = this.bases(context, row.mainCategoryId, row.projectItemId);
            const selected = row.whiteBase ? candidates.filter(base => base.origin === row.whiteBase!.origin && base.id === row.whiteBase!.id) : candidates;
            if (selected.length === 0) throw new PlanningError('WHITE_BASE_REQUIRED', '该产品外观及项目没有可用的真实白色图号，请先检查白色基准或取消共用');
            if (selected.length > 1) throw new PlanningError('WHITE_BASE_AMBIGUOUS', '存在多个真实白色图号，请明确选择共用基准');
            const base = selected[0], parsed = parseDrawingCode(base.fullCode)!;
            check.fullCode = base.fullCode; check.shared = { origin: base.origin, id: base.id };
            check.prefix = parsed.prefix; check.sequence = parsed.sequence;
            const { fullCode: _code, prefix: _prefix, sequence: _sequence, ...parts } = parsed; check.parts = parts;
          } else {
            const preview = this.planner.preview({ ...group, rows: [...allocated, row] });
            const planned = preview.rows[preview.rows.length - 1];
            check.fullCode = planned.fullCode; check.prefix = planned.prefix; check.sequence = planned.sequence;
            const parsed = parseDrawingCode(planned.fullCode)!;
            const { fullCode: _code, prefix: _prefix, sequence: _sequence, ...parts } = parsed; check.parts = parts;
            allocated.push(row);
          }
          check.available = true;
          check.fingerprint = this.fingerprint(group, row, check, context);
        } catch (error) { check.available = false; delete check.fingerprint; check.error = failure(error); }
        return check;
      });
      return { productId: group.productId, model, rows };
    });
    const proposals = new Map<string, BatchPlanningCheck[]>();
    for (const check of groups.flatMap(group => group.rows)) {
      if (!check.available || !check.fullCode) continue;
      const same = proposals.get(check.fullCode) ?? []; same.push(check); proposals.set(check.fullCode, same);
    }
    for (const same of proposals.values()) {
      // Multiple colors may intentionally share ONE real baseline in the same product/project.
      const intentionalShare = same.every(check => check.shared && check.productId === same[0].productId
        && check.mainCategoryId === same[0].mainCategoryId && check.projectItemId === same[0].projectItemId
        && check.shared.origin === same[0].shared?.origin && check.shared.id === same[0].shared?.id);
      if (same.length < 2 || intentionalShare) continue;
      for (const check of same) {
        check.available = false; delete check.fingerprint;
        check.error = { code: 'DRAWING_CODE_CONFLICT', message: '不同产品或项目推荐了相同完整图号，请核对编码资料；不能自动改变流水号掩盖冲突' };
      }
    }
    return { groups };
  }

  reserve(input: BatchReservePlanningInput): BatchPlanningResult {
    if (input.confirmed !== true) throw new PlanningError('INVALID_PLAN', '请明确确认检查结果后占号');
    return this.db.transaction(() => {
      // One current snapshot under an immediate write lock; each savepoint is independent.
      const preview = this.preview(input);
      const results: BatchPlanningResult['results'] = [];
      input.groups.forEach((group, groupIndex) => group.rows.forEach((row, index) => {
        const check = preview.groups[groupIndex].rows[index];
        try {
          if (!check.available) throw new PlanningError((check.error?.code ?? 'INVALID_PLAN') as PlanningError['code'], check.error?.message ?? '项目检查未通过');
          if (!row.fingerprint || row.fingerprint !== check.fingerprint || !row.expectedFullCode || row.expectedFullCode !== check.fullCode) {
            throw new PlanningError('PLAN_STALE', '检查依据或推荐图号已变化，请重新检查后确认');
          }
          const drawing = this.db.transaction(() => {
            if (check.shared) {
              const base = this.listWhiteBases({ ...group, mainCategoryId: row.mainCategoryId, projectItemId: row.projectItemId })
                .find(base => base.origin === check.shared!.origin && base.id === check.shared!.id);
              if (!base) throw new PlanningError('PLAN_STALE', '白色基准已变化，请重新检查');
              return base;
            }
            const context = this.resolveContext(group, row);
            if (this.repository.hasFullCode(check.fullCode!)) throw new PlanningError('PLAN_STALE', '图号已被占用，请重新检查');
            const saved = this.repository.insertReserved(context, context.rows[0], { clientId: row.clientId, fullCode: check.fullCode!,
              prefix: check.prefix!, sequence: check.sequence!, available: true,
              displayName: formatDisplayName({ brandName: context.brandName, model: context.model,
                colorName: context.rows[0].colorName, projectItemName: context.rows[0].projectItemName }) });
            return { id: saved.id, origin: 'planned' as const, fullCode: saved.fullCode, displayName: saved.displayName };
          })();
          results.push({ productId: group.productId, clientId: row.clientId, outcome: check.shared ? 'shared' : 'reserved', drawing });
        } catch (error) { results.push({ productId: group.productId, clientId: row.clientId, outcome: 'failed', error: failure(error) }); }
      }));
      return { results };
    }).immediate();
  }
}
