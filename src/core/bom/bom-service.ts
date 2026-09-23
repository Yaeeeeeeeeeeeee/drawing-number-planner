import type { PlannerDatabase } from '../../db/database.js';
import { rmSync } from 'node:fs';
import { resolveWorkspacePath, validateWorkspaceRelativePath } from '../files/workspace-paths.js';
import { BomAssetArchiveService } from './bom-asset-archive-service.js';
import { BomError } from './bom-errors.js';
import { BomRepository } from './bom-repository.js';
import { BomAssetService, type ManagedBomAsset } from './bom-asset-service.js';
import type { BomCandidate, BomCandidateInput, BomDiffEntry, BomDrawingReference, BomItemInput, BomQueryFilters, BomVersionDetail,
  BomVersionDeletionPreview, BomVersionDeletionResult, BomVersionSummary, ProductBomDeletionResult, SaveBomInput, SavedBomVersion } from './bom-types.js';

export const WHITE_COLOR_CODE = '0';

function normalizedNotes(value?: string): string | null {
  const text = value?.trim();
  return text ? text : null;
}

function normalizedText(value?: string): string | null {
  const text = value?.trim();
  return text ? text : null;
}

function validBusinessDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function buildDiff(previous: BomVersionDetail | null, current: BomVersionDetail): BomDiffEntry[] {
  const before = new Map((previous?.items ?? []).map((item) => [item.projectItemId, item]));
  const after = new Map(current.items.map((item) => [item.projectItemId, item]));
  const ids = [...new Set([...before.keys(), ...after.keys()])].sort((a, b) => a - b);
  return ids.map((projectItemId) => {
    const oldItem = before.get(projectItemId); const newItem = after.get(projectItemId);
    let type: BomDiffEntry['type'];
    if (!oldItem) type = 'added';
    else if (!newItem) type = 'removed';
    else type = JSON.stringify({ drawingReference: referenceOf(oldItem), effectiveBatchRelativePath: oldItem.effectiveBatchRelativePath,
      effectiveBatchName: oldItem.effectiveBatchName,
        material: oldItem.material, dimensions: oldItem.dimensions, position: oldItem.position, notes: oldItem.notes, changeDetails: oldItem.changeDetails,
      usesWhiteMaterial: oldItem.usesWhiteMaterial, assets: oldItem.assets.map((asset) => ({ assetId: asset.assetId, role: asset.role })), qrCodes: oldItem.qrCodes.map((qr) => qr.id) })
      === JSON.stringify({ drawingReference: referenceOf(newItem), effectiveBatchRelativePath: newItem.effectiveBatchRelativePath,
        effectiveBatchName: newItem.effectiveBatchName,
          material: newItem.material, dimensions: newItem.dimensions, position: newItem.position, notes: newItem.notes, changeDetails: newItem.changeDetails,
        usesWhiteMaterial: newItem.usesWhiteMaterial, assets: newItem.assets.map((asset) => ({ assetId: asset.assetId, role: asset.role })), qrCodes: newItem.qrCodes.map((qr) => qr.id) }) ? 'unchanged' : 'replaced';
    const item = newItem ?? oldItem!;
    return { type, projectItemId, projectItemName: item.projectItemName,
      previousDrawingId: oldItem?.origin === 'planned' ? oldItem.drawingId : null,
      previousDrawingReference: oldItem ? referenceOf(oldItem) : null, previousFullCode: oldItem?.fullCode ?? null,
      drawingId: newItem?.origin === 'planned' ? newItem.drawingId : null,
      drawingReference: newItem ? referenceOf(newItem) : null, fullCode: newItem?.fullCode ?? null };
  });
}

function referenceOf(item: BomDrawingReference): BomDrawingReference {
  return item.origin === 'planned' ? { origin: 'planned', drawingId: item.drawingId }
    : { origin: 'historical', historicalDrawingId: item.historicalDrawingId };
}

export class BomService {
  private readonly repository: BomRepository;
  constructor(private readonly db: PlannerDatabase, private readonly workspaceRoot?: () => string | null) { this.repository = new BomRepository(db); }

  importAsset(productId: number, sourcePath: string, originalFileName?: string): ManagedBomAsset {
    this.validateProduct(productId);
    const product = this.repository.getProductIdentity(productId);
    const workspaceRoot = this.workspaceRoot?.();
    if (!product?.sku || !workspaceRoot) throw new BomError('ASSET_SOURCE_INVALID', '资料根目录或产品 SKU 未配置，无法导入 BOM 附件');
    return new BomAssetService(this.db, workspaceRoot).import({ sku: product.sku, model: product.model, sourcePath, originalFileName });
  }

  previewAsset(id: number) {
    const root = this.workspaceRoot?.();
    if (!root) throw new BomError('ASSET_SOURCE_INVALID', '资料根目录未配置');
    return new BomAssetService(this.db, root).preview(id);
  }

  previewAssetArchive() {
    const root = this.workspaceRoot?.();
    if (!root) throw new BomError('ASSET_SOURCE_INVALID', '资料根目录未配置');
    return new BomAssetArchiveService(this.db, root).preview();
  }

  archiveAssetLink(linkId: number) {
    const root = this.workspaceRoot?.();
    if (!root) throw new BomError('ASSET_SOURCE_INVALID', '资料根目录未配置');
    const asset = new BomAssetArchiveService(this.db, root).migrate(linkId);
    return { linkId, status: asset ? 'archived' as const : 'unchanged' as const };
  }

  getCurrent(productId: number, _legacyColorId?: number): BomVersionDetail | null {
    const id = this.repository.getCurrentVersionId(productId);
    return id === null ? null : this.getVersion(id);
  }

  getVersion(id: number): BomVersionDetail {
    const version = this.repository.getVersion(id);
    if (!version) throw new BomError('BOM_NOT_FOUND', 'BOM 版本不存在');
    return version;
  }

  listVersions(productId: number, _legacyColorId?: number): BomVersionSummary[] { return this.repository.listVersions(productId); }
  queryVersions(filters: BomQueryFilters): BomVersionSummary[] { return this.repository.queryVersions(filters); }

  previewBomVersionDeletion(id: number): BomVersionDeletionPreview {
    const version = this.repository.getDeletionVersion(id);
    if (!version) throw new BomError('BOM_NOT_FOUND', 'BOM 版本不存在');
    if (version.deletedAt) throw new BomError('BOM_ALREADY_DELETED', '该 BOM 变更记录已经删除');
    return this.repository.previewDeletion(id)!;
  }

  deleteBomVersion(id: number, confirmed: boolean): BomVersionDeletionResult {
    return this.db.transaction(() => {
      const preview = this.previewBomVersionDeletion(id);
      if (!confirmed) throw new BomError('BOM_DELETE_CONFIRMATION_REQUIRED', '删除 BOM 变更记录需要二次确认');
      const now = new Date().toISOString();
      if (this.repository.markVersionDeleted(id, now, '用户删除单次 BOM 变更') !== 1) {
        throw new BomError('BOM_ALREADY_DELETED', '该 BOM 变更记录已经删除');
      }
      if (preview.isCurrent) {
        if (preview.fallbackVersionId === null) this.repository.clearCurrent(preview.productId);
        else this.repository.setCurrent(preview.productId, preview.fallbackVersionId, now);
      }
      return { deletedVersionId: id, productId: preview.productId, wasCurrent: preview.isCurrent,
        currentVersionId: preview.isCurrent ? preview.fallbackVersionId : this.repository.getCurrentVersionId(preview.productId),
        currentVersionNumber: preview.isCurrent ? preview.fallbackVersionNumber
          : this.repository.previewDeletion(this.repository.getCurrentVersionId(preview.productId) ?? -1)?.versionNumber ?? null };
    }).immediate();
  }

  deleteProductBom(productId: number, modelConfirmation: string): ProductBomDeletionResult {
    return this.db.transaction(() => {
      const identity = this.repository.getProductIdentity(productId);
      if (!identity) throw new BomError('BOM_NOT_FOUND', '产品不存在');
      if (modelConfirmation !== identity.model) {
        throw new BomError('BOM_MODEL_CONFIRMATION_MISMATCH', '输入的型号与产品档案不一致，未删除 BOM');
      }
      const deletedCount = this.repository.markProductVersionsDeleted(productId, new Date().toISOString(), '用户删除整个型号 BOM');
      this.repository.clearCurrent(productId);
      return { productId, deletedCount, currentVersionId: null };
    }).immediate();
  }

  listCandidates(input: BomCandidateInput): BomCandidate[] {
    this.validateProduct(input.productId);
    return this.repository.listCandidates(input, WHITE_COLOR_CODE);
  }

  listActiveQrCandidates(productId: number) {
    this.validateProduct(productId);
    return this.repository.listActiveQrCodes(productId);
  }
  relinkMaterialBatch(batchId: number): { relinked: number } {
    const batch = this.repository.getCurrentBatch(batchId);
    if (!batch || batch.productId === null || batch.isPresent !== 1) throw new BomError('BATCH_NOT_ELIGIBLE', '资料批次不存在、未关联产品或已缺失，无法重新关联');
    return { relinked: this.repository.relinkBatch(batchId) };
  }

  saveVersion(input: SaveBomInput): SavedBomVersion {
    return this.withArchiveTransaction((archive) => {
      this.validateProduct(input.productId);
      if (!input.businessChangeDate || !validBusinessDate(input.businessChangeDate)) {
        throw new BomError('INVALID_BUSINESS_CHANGE_DATE', '业务变更日期必须是有效的 ISO 日期');
      }
      if (input.items.length === 0) throw new BomError('INVALID_BOM_ITEM_COUNT', 'BOM 至少需要一个项目');
      const currentId = this.repository.getCurrentVersionId(input.productId);
      if (currentId !== input.expectedCurrentVersionId) throw new BomError('BOM_STALE', '当前 BOM 已变化，请刷新后重新保存');
      const projectIds = new Set<number>();
      const entryMode = input.entryMode ?? 'current';
      const validated = input.items.map((item) => this.validateItem(item, input.productId, projectIds, entryMode));
      const previous = currentId === null ? null : this.getVersion(currentId);
      const now = new Date().toISOString();
      const versionId = this.repository.insertVersion(input.productId, this.repository.nextVersionNumber(input.productId),
        currentId, input.businessChangeDate, normalizedNotes(input.notes), now);
      validated.forEach((item, index) => {
        const bomItemId = this.repository.insertItem(versionId, item);
        this.saveItemAssets(bomItemId, item.projectItemId, currentId, item.assets);
        if (input.items[index].qrCodeIds === undefined) {
          const previousItem = previous?.items.find((old) => old.projectItemId === item.projectItemId);
          previousItem?.qrCodes.forEach((qr) => this.repository.insertItemQrCode(bomItemId, qr.id));
        } else this.saveItemQrCodes(bomItemId, input.productId, item.qrCodeIds);
      });
      this.repository.activateDrawings(validated.flatMap((item) => item.drawingReference.origin === 'planned'
        ? [item.drawingReference.drawingId] : []));
      this.repository.setCurrent(input.productId, versionId, now);
      archive(versionId);
      const version = this.getVersion(versionId);
      return { version, diff: buildDiff(previous, version) };
    });
  }

  updateVersion(id: number, input: SaveBomInput, expectedRevision: number): SavedBomVersion {
    return this.withArchiveTransaction((archive) => {
      const previous = this.getVersion(id);
      if (previous.productId !== input.productId) throw new BomError('DRAWING_WRONG_PRODUCT', '不能改变 BOM 所属产品');
      this.validateProduct(input.productId);
      if (previous.editRevision !== expectedRevision) throw new BomError('BOM_STALE', '该记录已被修改，请重新加载后编辑');
      if (!input.businessChangeDate || !validBusinessDate(input.businessChangeDate)) throw new BomError('INVALID_BUSINESS_CHANGE_DATE', '业务变更日期无效');
      if (!input.items.length) throw new BomError('INVALID_BOM_ITEM_COUNT', 'BOM 至少需要一个项目');
      const projects = new Set<number>();
      const validated = input.items.map((item) => {
        const original = previous.items.find((old) => old.projectItemId === item.projectItemId);
        const plannedId = item.drawingReference?.origin === 'planned' ? item.drawingReference.drawingId : item.drawingId;
        const retainedPlannedId = original?.origin === 'planned' && original.drawingId === plannedId
          && original.usesWhiteMaterial === item.usesWhiteMaterial ? plannedId : undefined;
        const keepBatch = original && (item.effectiveMaterialBatchId === undefined
          || (item.effectiveMaterialBatchId !== null && item.effectiveMaterialBatchId === original.effectiveMaterialBatchId))
          && (item.effectiveBatchRelativePath === undefined || item.effectiveBatchRelativePath === original.effectiveBatchRelativePath)
          && (item.effectiveBatchName === undefined || item.effectiveBatchName === original.effectiveBatchName);
        const validatedItem = this.validateItem(keepBatch ? { ...item, effectiveMaterialBatchId: undefined,
          effectiveBatchRelativePath: undefined, effectiveBatchName: undefined } : item,
        input.productId, projects, input.entryMode ?? 'historical', retainedPlannedId);
        if (keepBatch) {
          validatedItem.effectiveMaterialBatchId = original.effectiveMaterialBatchId;
          validatedItem.effectiveBatchRelativePath = original.effectiveBatchRelativePath;
          validatedItem.effectiveBatchName = original.effectiveBatchName;
        }
        return validatedItem;
      });
      const now = new Date().toISOString();
      this.db.prepare(`update bom_versions set business_change_date = ?, updated_at = ?, edit_revision = edit_revision + 1,
        notes = ? where id = ?`).run(input.businessChangeDate, now, input.notes === undefined ? previous.notes : normalizedNotes(input.notes), id);
      this.db.prepare('update bom_items set deleted_at = ? where bom_version_id = ?').run(now, id);
      validated.forEach((item, index) => {
        const existing = this.db.prepare('select id from bom_items where bom_version_id = ? and project_item_id = ?')
          .get(id, item.projectItemId) as { id: number } | undefined;
        if (existing) {
          this.db.prepare(`update bom_items set drawing_id = ?, historical_drawing_id = ?, effective_batch_relative_path = ?,
            effective_batch_name = ?, effective_material_batch_id = ?, material = ?, dimensions = ?, position = ?, notes = ?,
            change_details = ?, uses_white_material = ?, deleted_at = null where id = ?`).run(
              item.drawingReference.origin === 'planned' ? item.drawingReference.drawingId : null,
              item.drawingReference.origin === 'historical' ? item.drawingReference.historicalDrawingId : null,
              item.effectiveBatchRelativePath, item.effectiveBatchName, item.effectiveMaterialBatchId,
              item.material, item.dimensions, item.position, item.notes, item.changeDetails, item.usesWhiteMaterial ? 1 : 0, existing.id);
          // Omitted assets/QR mean preserve existing relations while editing textual fields.
          if (input.items[index].assets !== undefined) this.replaceEditedAssets(existing.id, item.projectItemId, previous.previousVersionId, item.assets);
        } else {
          const itemId = this.repository.insertItem(id, item);
          this.saveItemAssets(itemId, item.projectItemId, previous.previousVersionId, item.assets);
        }
      });
      archive(id);
      const version = this.getVersion(id);
      return { version, diff: buildDiff(previous, version) };
    });
  }

  private withArchiveTransaction<T>(work: (archive: (versionId: number) => void) => T): T {
    const root = this.workspaceRoot?.(); const created: ManagedBomAsset[] = [];
    try {
      return this.db.transaction(() => work((versionId) => {
        if (!root) return;
        const archive = new BomAssetArchiveService(this.db, root);
        for (const item of archive.preview().filter((candidate) => candidate.versionId === versionId)) {
          const asset = archive.migrate(item.linkId); if (asset) created.push(asset);
        }
      })).immediate();
    } catch (error) {
      if (root) for (const asset of created) rmSync(resolveWorkspacePath(root, asset.relativePath, { requireExistingParent: true }), { force: true });
      throw error;
    }
  }

  private replaceEditedAssets(itemId: number, projectId: number, previousVersionId: number | null,
    assets: NonNullable<BomItemInput['assets']>): void {
    const existing = this.repository.listItemAssets(itemId);
    const unchanged = existing.length === assets.length && assets.every((asset) =>
      existing.some((old) => old.role === asset.role && (asset.reusePrevious || old.assetId === asset.assetId)));
    if (unchanged) return;
    // Historical consumers hold their own asset IDs; preserve their origin before changing this source link.
    for (const old of existing) {
      this.db.prepare(`update bom_item_assets set inheritance_snapshot_json = ?, inherited_from_bom_item_asset_id = null
        where inherited_from_bom_item_asset_id = ?`).run(JSON.stringify({ sourceLinkId: old.id, sourceBomItemId: itemId,
          assetId: old.assetId, fileName: old.originalFileName, relativePath: old.relativePath }), old.id);
    }
    const roles = new Set<string>();
    for (const asset of assets) {
      if (roles.has(asset.role)) throw new BomError('DUPLICATE_ASSET_ROLE', '同一 BOM 项目每种附件角色只能有一个');
      roles.add(asset.role);
      const old = existing.find((link) => link.role === asset.role);
      if (!old) { this.saveItemAssets(itemId, projectId, previousVersionId, [asset]); continue; }
      if (asset.reusePrevious) {
        if (asset.assetId !== undefined) throw new BomError('ASSET_REUSE_NOT_FOUND', '沿用附件不能同时指定新附件');
        continue;
      }
      if (asset.assetId === undefined || !Number.isInteger(asset.assetId) || !this.repository.assetExists(asset.assetId)) {
        throw new BomError('ASSET_NOT_FOUND', 'BOM 附件不存在');
      }
      this.db.prepare(`update bom_item_assets set asset_id = ?, inherited_from_bom_item_asset_id = null,
        inheritance_snapshot_json = null where id = ?`).run(asset.assetId, old.id);
    }
    for (const old of existing) if (!roles.has(old.role)) {
      this.db.prepare('update bom_item_assets set deleted_at = ? where id = ?').run(new Date().toISOString(), old.id);
    }
  }

  private validateProduct(productId: number): void {
    const context = this.repository.getContext(productId);
    if (!context || context.productStatus !== 'active') throw new BomError('PRODUCT_NOT_ACTIVE', '产品不存在或已停用');
  }

  private validateItem(item: BomItemInput, productId: number, projectIds: Set<number>, entryMode: 'current' | 'historical', retainedPlannedId?: number) {
    if (projectIds.has(item.projectItemId)) throw new BomError('DUPLICATE_PROJECT', '同一 BOM 不能重复添加项目');
    projectIds.add(item.projectItemId);
    const hasDrawingReference = item.drawingReference !== undefined;
    const hasLegacyDrawingId = item.drawingId !== undefined;
    if (hasDrawingReference === hasLegacyDrawingId) {
      throw new BomError('DRAWING_REFERENCE_INVALID', 'BOM 项目必须且只能提供一种图号引用');
    }
    const drawingReference = item.drawingReference ?? { origin: 'planned' as const, drawingId: item.drawingId! };
    let colorCode: string;
    if (drawingReference.origin === 'planned') {
      const drawing = this.repository.getDrawing(drawingReference.drawingId);
      if (!drawing) throw new BomError('DRAWING_NOT_FOUND', '图号不存在');
      if (drawing.productId !== productId) throw new BomError('DRAWING_WRONG_PRODUCT', 'BOM 不允许引用其他型号图号');
      if (drawing.projectItemId !== item.projectItemId) throw new BomError('DRAWING_WRONG_PROJECT', '图号与 BOM 项目不一致');
      if (drawing.status === 'voided' && drawingReference.drawingId !== retainedPlannedId) throw new BomError('DRAWING_NOT_ELIGIBLE', '已作废图号不能加入 BOM');
      colorCode = drawing.colorCode;
    } else {
      const drawing = this.repository.getHistoricalDrawing(drawingReference.historicalDrawingId);
      if (!drawing) throw new BomError('DRAWING_NOT_FOUND', '历史图号不存在');
      if (entryMode !== 'historical') throw new BomError('DRAWING_NOT_ELIGIBLE', '历史图号只能在历史 BOM 录入模式使用');
      if (drawing.productId === null) throw new BomError('DRAWING_PRODUCT_UNCONFIRMED', '历史图号尚未确认产品归属');
      if (drawing.productId !== productId) throw new BomError('DRAWING_WRONG_PRODUCT', 'BOM 不允许引用其他型号图号');
      const project = this.repository.getProjectCodes(item.projectItemId);
      if (!project || drawing.projectItemCode !== project.projectItemCode || drawing.mainCategoryCode !== project.mainCategoryCode) {
        throw new BomError('DRAWING_WRONG_PROJECT', '图号与 BOM 项目不一致');
      }
      colorCode = drawing.colorCode;
    }
    if (item.usesWhiteMaterial && colorCode !== WHITE_COLOR_CODE) {
      throw new BomError('WHITE_DRAWING_REQUIRED', '颜色共用必须引用同型号白色图号');
    }
    let effectiveBatchRelativePath = normalizedText(item.effectiveBatchRelativePath);
    let effectiveBatchName = normalizedText(item.effectiveBatchName);
    let effectiveMaterialBatchId = item.effectiveMaterialBatchId ?? null;
    if (effectiveMaterialBatchId !== null) {
      const batch = this.repository.getCurrentBatch(effectiveMaterialBatchId);
      if (!batch || batch.productId !== productId || batch.isPresent !== 1) throw new BomError('BATCH_NOT_ELIGIBLE', '生效资料批次不存在、已缺失或不属于该产品');
      if ((effectiveBatchRelativePath && effectiveBatchRelativePath !== batch.relativePath) || (effectiveBatchName && effectiveBatchName !== batch.name)) {
        throw new BomError('BATCH_SNAPSHOT_MISMATCH', '生效资料批次快照必须由当前索引生成');
      }
      effectiveBatchRelativePath = batch.relativePath; effectiveBatchName = batch.name;
    } else if (effectiveBatchRelativePath || effectiveBatchName) throw new BomError('BATCH_NOT_ELIGIBLE', '新 BOM 的生效批次必须选择当前资料批次');
    if (effectiveBatchRelativePath) validateWorkspaceRelativePath(effectiveBatchRelativePath);
    return { projectItemId: item.projectItemId, drawingReference,
      effectiveBatchRelativePath, effectiveBatchName,
      effectiveMaterialBatchId, material: normalizedText(item.material),
      dimensions: normalizedText(item.dimensions), position: normalizedText(item.position), assets: item.assets ?? [],
      qrCodeIds: item.qrCodeIds ?? [],
      notes: normalizedNotes(item.notes), changeDetails: normalizedText(item.changeDetails), usesWhiteMaterial: item.usesWhiteMaterial };
  }

  private saveItemAssets(bomItemId: number, projectItemId: number, previousVersionId: number | null,
    assets: NonNullable<BomItemInput['assets']>): void {
    const roles = new Set<string>();
    for (const asset of assets) {
      if (roles.has(asset.role)) throw new BomError('DUPLICATE_ASSET_ROLE', '同一 BOM 项目每种附件角色只能有一个');
      roles.add(asset.role);
      if (asset.reusePrevious) {
        if (asset.assetId !== undefined || previousVersionId === null) {
          throw new BomError('ASSET_REUSE_NOT_FOUND', '上一版对应项目没有可沿用的附件');
        }
        const source = this.repository.previousItemAsset(previousVersionId, projectItemId, asset.role);
        if (!source) throw new BomError('ASSET_REUSE_NOT_FOUND', '上一版对应项目没有可沿用的附件');
        this.repository.insertItemAsset(bomItemId, source.assetId, asset.role, source.id);
      } else {
        if (asset.assetId === undefined || !Number.isInteger(asset.assetId) || !this.repository.assetExists(asset.assetId)) {
          throw new BomError('ASSET_NOT_FOUND', 'BOM 附件不存在');
        }
        this.repository.insertItemAsset(bomItemId, asset.assetId, asset.role, null);
      }
    }
  }

  private saveItemQrCodes(bomItemId: number, productId: number, qrCodeIds: number[]): void {
    const unique = new Set(qrCodeIds);
    if (unique.size !== qrCodeIds.length || [...unique].some((id) => !Number.isInteger(id)
      || !this.repository.activeQrCodeExists(productId, id))) {
      throw new BomError('QR_CODE_NOT_ELIGIBLE', '新 BOM 只能关联同产品且启用中的二维码');
    }
    unique.forEach((qrCodeId) => this.repository.insertItemQrCode(bomItemId, qrCodeId));
  }
}
