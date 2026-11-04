import type { PlannerDatabase } from '../../db/database.js';
import { DrawingDeletionError, DrawingDeletionService } from '../drawings/drawing-deletion-service.js';
import { productCleanupChoices, productHistoryPlan, purgeProductHistory, type ProductCleanupChoices, type ProductCleanupSelection } from './product-cleanup-options.js';
export type { ProductCleanupSelection } from './product-cleanup-options.js';

export class ProductCleanupError extends Error {
  constructor(public readonly code: 'PRODUCT_NOT_FOUND' | 'PRODUCT_CLEANUP_BLOCKED' | 'PRODUCT_CONFIRMATION_MISMATCH' | 'TASK_RUNNING',
    message: string) { super(message); }
}
export interface ProductCleanupPreview {
  productId: number; model: string; sku: string | null;
  blockers: string[];
  owned: { drawings: number; historicalDrawings: number; bomRecords: number; qrCodes: number; batches: number };
  preservedSnapshots: number;
  classification: { alreadyDeleted: number; presentPdfIndexes: number; missingPdfIndexes: number; preservedDrafts: number };
  choices?: ProductCleanupChoices;
}
export class ProductCleanupService {
  constructor(private readonly db: PlannerDatabase, private readonly isTaskRunning: () => boolean = () => false) {}
  preview(productId: number): ProductCleanupPreview {
    const product = this.db.prepare('select model, sku from products where id = ? and deleted_at is null')
      .get(productId) as { model: string; sku: string | null } | undefined;
    if (!product) throw new ProductCleanupError('PRODUCT_NOT_FOUND', '产品不存在或已经退出当前业务');
    const count = (sql: string) => (this.db.prepare(sql).get({ id: productId }) as { n: number }).n;
    const blockers: string[] = [];
    if (this.isTaskRunning()) blockers.push('后台任务正在执行，请先等待完成或取消任务');
    const dependentProducts = this.db.prepare(`select model from products
      where reference_product_id = ? and deleted_at is null and id <> ?`).all(productId, productId) as Array<{ model: string }>;
    for (const dependent of dependentProducts) blockers.push(`其他产品 ${dependent.model} 仍以本产品为参考来源`);
    const externalBoms = this.db.prepare(`select distinct version.id, product.model from bom_items item
      join bom_versions version on version.id = item.bom_version_id
      join products product on product.id = version.product_id
      where version.product_id <> @id and product.deleted_at is null
        and version.deleted_at is null and item.deleted_at is null and (
          item.drawing_id in (select id from drawing_numbers where product_id = @id)
          or item.historical_drawing_id in (select id from historical_drawing_numbers where product_id = @id)
          or item.effective_material_batch_id in (select id from material_batches where product_id = @id))`)
      .all({ id: productId }) as Array<{ id: number; model: string }>;
    for (const bom of externalBoms) blockers.push(`其他产品 ${bom.model} 的 BOM #${bom.id} 仍引用本产品资料`);
    const externalDrawings = count(`select count(*) as n from drawing_numbers drawing join products product on product.id = drawing.product_id
      where drawing.product_id <> @id and drawing.deleted_at is null and product.deleted_at is null and
      (drawing.source_product_id = @id or drawing.source_drawing_id in (select id from drawing_numbers where product_id = @id)
       or drawing.previous_drawing_id in (select id from drawing_numbers where product_id = @id))`);
    if (externalDrawings) blockers.push(`其他产品有 ${externalDrawings} 条有效图号引用本产品`);
    const externalFiles = count(`select count(*) as n from pdf_files file join material_batches batch on batch.id = file.material_batch_id
      where file.is_present = 1 and batch.product_id is not null and batch.product_id <> @id and
      (file.drawing_id in (select id from drawing_numbers where product_id = @id)
       or file.historical_drawing_id in (select id from historical_drawing_numbers where product_id = @id))`);
    if (externalFiles) blockers.push(`其他产品资料批次有 ${externalFiles} 个文件引用本产品图号`);
    const fileOwnership = `(file.drawing_id in (select id from drawing_numbers where product_id = @id)
      or file.historical_drawing_id in (select id from historical_drawing_numbers where product_id = @id)
      or file.material_batch_id in (select id from material_batches where product_id = @id))`;
    return { productId, ...product, blockers, choices: productCleanupChoices(this.db, productId),
      classification: {
        alreadyDeleted: ['drawing_numbers', 'historical_drawing_numbers', 'bom_versions', 'product_qr_codes']
          .reduce((sum, table) => sum + count(`select count(*) as n from ${table} where product_id = @id and deleted_at is not null`), 0),
        presentPdfIndexes: count(`select count(*) as n from pdf_files file where file.is_present = 1 and ${fileOwnership}`),
        missingPdfIndexes: count(`select count(*) as n from pdf_files file where file.is_present = 0 and ${fileOwnership}`),
        preservedDrafts: count(`select count(*) as n from outbound_email_drafts where package_id in
          (select id from outbound_packages where product_id = @id)`),
      },
      owned: {
        drawings: count('select count(*) as n from drawing_numbers where product_id = @id and deleted_at is null'),
        historicalDrawings: count('select count(*) as n from historical_drawing_numbers where product_id = @id and deleted_at is null'),
        bomRecords: count('select count(*) as n from bom_versions where product_id = @id and deleted_at is null'),
        qrCodes: count('select count(*) as n from product_qr_codes where product_id = @id and deleted_at is null'),
        batches: count('select count(*) as n from material_batches where product_id = @id'),
      }, preservedSnapshots: count('select count(*) as n from outbound_packages where product_id = @id') };
  }
  cleanup(productId: number, input: { confirmedModel: string; selection?: ProductCleanupSelection }): ProductCleanupPreview {
    return this.db.transaction(() => {
      const preview = this.preview(productId);
      if (input.confirmedModel !== preview.model) throw new ProductCleanupError('PRODUCT_CONFIRMATION_MISMATCH', '请准确输入要退出的产品型号');
      if (preview.blockers.length) throw new ProductCleanupError('PRODUCT_CLEANUP_BLOCKED', preview.blockers.join('；'));
      const selection = input.selection;
      const choices = preview.choices!;
      if (selection) {
        if (selection.expectedFingerprint !== choices.fingerprint) throw new ProductCleanupError('PRODUCT_CLEANUP_BLOCKED', '关联资料已变化，请重新检查并确认处理选项');
        if (selection.history === 'purge') {
          if (selection.confirmedHistory !== '永久清除历史') throw new ProductCleanupError('PRODUCT_CONFIRMATION_MISMATCH', '请输入“永久清除历史”确认历史处理');
          if (choices.purgeBlockers.length) throw new ProductCleanupError('PRODUCT_CLEANUP_BLOCKED', choices.purgeBlockers.join('；'));
        }
        if (selection.occupancy === 'release') {
          const confirmations = selection.confirmedCodes ?? [];
          if (confirmations.length !== choices.occupiedDrawings.length || new Set(confirmations.map(row=>row.signedId)).size !== confirmations.length
            || choices.occupiedDrawings.some(row=>!confirmations.some(value=>value.signedId===row.signedId && value.confirmedCode===row.fullCode))) {
            throw new ProductCleanupError('PRODUCT_CONFIRMATION_MISMATCH', '请逐条准确输入完整图号，确认释放范围');
          }
        }
      }
      // Capture exact ownership before the existing exit detaches batches.
      const history = productHistoryPlan(this.db, productId);
      const now = new Date().toISOString(); const values = { id: productId, now };
      this.db.prepare('delete from bom_current where product_id = ?').run(productId);
      this.db.prepare('update bom_versions set deleted_at = @now where product_id = @id and deleted_at is null').run(values);
      for (const [table, origin] of [['drawing_numbers', 'planned'], ['historical_drawing_numbers', 'historical']] as const) {
        this.db.prepare(`insert into drawing_deletion_events
          (origin, record_id, full_code, deletion_mode, previous_status, reason, reference_summary_json, deleted_at)
          select '${origin}', id, full_code, 'retain_occupied', status, '产品集中退出', '{}', @now
          from ${table} where product_id = @id and deleted_at is null`).run(values);
        this.db.prepare(`update ${table} set deleted_at = @now, deletion_mode = 'retain_occupied',
          deleted_full_code = full_code, deleted_previous_status = status, deleted_reason = '产品集中退出', scan_resolution = 'ignore'
          where product_id = @id and deleted_at is null`).run(values);
      }
      this.db.prepare(`update pdf_files set drawing_id = null, historical_drawing_id = null, match_status = 'pending',
        classification_warning = '产品已退出当前业务'
        where drawing_id in (select id from drawing_numbers where product_id = @id)
          or historical_drawing_id in (select id from historical_drawing_numbers where product_id = @id)`).run({ id: productId });
      if (selection?.history !== 'purge') this.db.prepare(`update material_batches set product_id = null, recognition_status = 'pending',
        classification_warning = '产品已退出当前业务' where product_id = ?`).run(productId);
      this.db.prepare(`update product_qr_codes set deleted_at = @now, status = 'inactive', updated_at = @now
        where product_id = @id and deleted_at is null`).run(values);
      this.db.prepare(`update products set deleted_at = @now, deletion_reason = '产品集中退出', status = 'inactive',
        deactivated_at = @now where id = @id`).run(values);
      if (selection?.history === 'purge') purgeProductHistory(this.db, productId, history.queries);
      if (selection?.occupancy === 'release') {
        const drawings = new DrawingDeletionService(this.db);
        for (const row of choices.occupiedDrawings) {
          try { drawings.delete({signedId:row.signedId, mode:'release', confirmedCode:row.fullCode, reason:'产品退出时明确选择释放占号'}); }
          catch (error) { if (error instanceof DrawingDeletionError) throw new ProductCleanupError('PRODUCT_CLEANUP_BLOCKED', `${row.fullCode}：${error.message}；本次操作已回滚`);throw error; }
        }
      }
      this.db.prepare(`insert into product_cleanup_events(product_id, identity_json, summary_json, created_at)
        values (?, ?, ?, ?)`).run(productId, JSON.stringify({ model: preview.model, sku: preview.sku }), JSON.stringify({...preview, selection:selection ? {occupancy:selection.occupancy,history:selection.history} : {occupancy:'retain_occupied',history:'retain'}}), now);
      return preview;
    }).immediate();
  }
}
