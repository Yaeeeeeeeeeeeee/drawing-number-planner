import type { PlannerDatabase } from '../../db/database.js';
import { validateWorkspaceRelativePath } from '../files/workspace-paths.js';
import { BomError } from './bom-errors.js';
import { BomRepository } from './bom-repository.js';
import { BomAssetService, type ManagedBomAsset } from './bom-asset-service.js';
import type { BomCandidate, BomCandidateInput, BomDiffEntry, BomItemInput, BomQueryFilters, BomVersionDetail,
  BomVersionSummary, SaveBomInput, SavedBomVersion } from './bom-types.js';

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
    else type = JSON.stringify({ drawingId: oldItem.drawingId, effectiveBatchRelativePath: oldItem.effectiveBatchRelativePath,
      effectiveBatchName: oldItem.effectiveBatchName, effectiveMaterialBatchId: oldItem.effectiveMaterialBatchId,
      material: oldItem.material, dimensions: oldItem.dimensions, position: oldItem.position, notes: oldItem.notes,
      usesWhiteMaterial: oldItem.usesWhiteMaterial, assets: oldItem.assets, qrCodes: oldItem.qrCodes })
      === JSON.stringify({ drawingId: newItem.drawingId, effectiveBatchRelativePath: newItem.effectiveBatchRelativePath,
        effectiveBatchName: newItem.effectiveBatchName, effectiveMaterialBatchId: newItem.effectiveMaterialBatchId,
        material: newItem.material, dimensions: newItem.dimensions, position: newItem.position, notes: newItem.notes,
        usesWhiteMaterial: newItem.usesWhiteMaterial, assets: newItem.assets, qrCodes: newItem.qrCodes }) ? 'unchanged' : 'replaced';
    const item = newItem ?? oldItem!;
    return { type, projectItemId, projectItemName: item.projectItemName,
      previousDrawingId: oldItem?.drawingId ?? null, previousFullCode: oldItem?.fullCode ?? null,
      drawingId: newItem?.drawingId ?? null, fullCode: newItem?.fullCode ?? null };
  });
}

export class BomService {
  private readonly repository: BomRepository;
  constructor(private readonly db: PlannerDatabase, private readonly workspaceRoot?: () => string | null) { this.repository = new BomRepository(db); }

  importAsset(productId: number, sourcePath: string): ManagedBomAsset {
    this.validateProduct(productId);
    const product = this.repository.getProductIdentity(productId);
    const workspaceRoot = this.workspaceRoot?.();
    if (!product?.sku || !workspaceRoot) throw new BomError('ASSET_SOURCE_INVALID', '资料根目录或产品 SKU 未配置，无法导入 BOM 附件');
    return new BomAssetService(this.db, workspaceRoot).import({ sku: product.sku, model: product.model, sourcePath });
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
    if (!batch || batch.isPresent !== 1) throw new BomError('BATCH_NOT_ELIGIBLE', '资料批次不存在或已缺失，无法重新关联');
    return { relinked: this.repository.relinkBatch(batchId) };
  }

  saveVersion(input: SaveBomInput): SavedBomVersion {
    return this.db.transaction(() => {
      this.validateProduct(input.productId);
      if (!input.businessChangeDate || !validBusinessDate(input.businessChangeDate)) {
        throw new BomError('INVALID_BUSINESS_CHANGE_DATE', '业务变更日期必须是有效的 ISO 日期');
      }
      if (input.items.length === 0) throw new BomError('INVALID_BOM_ITEM_COUNT', 'BOM 至少需要一个项目');
      const currentId = this.repository.getCurrentVersionId(input.productId);
      if (currentId !== input.expectedCurrentVersionId) throw new BomError('BOM_STALE', '当前 BOM 已变化，请刷新后重新保存');
      const projectIds = new Set<number>();
      const validated = input.items.map((item) => this.validateItem(item, input.productId, projectIds));
      const previous = currentId === null ? null : this.getVersion(currentId);
      const now = new Date().toISOString();
      const versionId = this.repository.insertVersion(input.productId, (previous?.versionNumber ?? 0) + 1,
        currentId, input.businessChangeDate, normalizedNotes(input.notes), now);
      validated.forEach((item) => {
        const bomItemId = this.repository.insertItem(versionId, item);
        this.saveItemAssets(bomItemId, item.projectItemId, currentId, item.assets);
        this.saveItemQrCodes(bomItemId, input.productId, item.qrCodeIds);
      });
      this.repository.activateDrawings(validated.map((item) => item.drawingId));
      this.repository.setCurrent(input.productId, versionId, now);
      const version = this.getVersion(versionId);
      return { version, diff: buildDiff(previous, version) };
    }).immediate();
  }

  private validateProduct(productId: number): void {
    const context = this.repository.getContext(productId);
    if (!context || context.productStatus !== 'active') throw new BomError('PRODUCT_NOT_ACTIVE', '产品不存在或已停用');
  }

  private validateItem(item: BomItemInput, productId: number, projectIds: Set<number>) {
    if (projectIds.has(item.projectItemId)) throw new BomError('DUPLICATE_PROJECT', '同一 BOM 不能重复添加项目');
    projectIds.add(item.projectItemId);
    const drawing = this.repository.getDrawing(item.drawingId);
    if (!drawing) throw new BomError('DRAWING_NOT_FOUND', '图号不存在');
    if (drawing.productId !== productId) throw new BomError('DRAWING_WRONG_PRODUCT', 'BOM 不允许引用其他型号图号');
    if (drawing.projectItemId !== item.projectItemId) throw new BomError('DRAWING_WRONG_PROJECT', '图号与 BOM 项目不一致');
    if (drawing.status === 'voided') throw new BomError('DRAWING_NOT_ELIGIBLE', '已作废图号不能加入 BOM');
    if (item.usesWhiteMaterial && drawing.colorCode !== WHITE_COLOR_CODE) {
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
    }
    if (effectiveBatchRelativePath) validateWorkspaceRelativePath(effectiveBatchRelativePath);
    return { projectItemId: item.projectItemId, drawingId: item.drawingId,
      effectiveBatchRelativePath, effectiveBatchName,
      effectiveMaterialBatchId, material: normalizedText(item.material),
      dimensions: normalizedText(item.dimensions), position: normalizedText(item.position), assets: item.assets ?? [],
      qrCodeIds: item.qrCodeIds ?? [],
      notes: normalizedNotes(item.notes), usesWhiteMaterial: item.usesWhiteMaterial };
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
