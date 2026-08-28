import type { PlannerDatabase } from '../../db/database.js';
import { BomError } from './bom-errors.js';
import { BomRepository } from './bom-repository.js';
import type { BomCandidate, BomCandidateInput, BomDiffEntry, BomItemInput, BomQueryFilters, BomVersionDetail,
  BomVersionSummary, SaveBomInput, SavedBomVersion } from './bom-types.js';

export const WHITE_COLOR_CODE = '0';

function normalizedNotes(value?: string): string | null {
  const text = value?.trim();
  return text ? text : null;
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
    else type = oldItem.drawingId === newItem.drawingId && oldItem.quantity === newItem.quantity
      && oldItem.notes === newItem.notes && oldItem.usesWhiteMaterial === newItem.usesWhiteMaterial ? 'unchanged' : 'replaced';
    const item = newItem ?? oldItem!;
    return { type, projectItemId, projectItemName: item.projectItemName,
      previousDrawingId: oldItem?.drawingId ?? null, previousFullCode: oldItem?.fullCode ?? null,
      drawingId: newItem?.drawingId ?? null, fullCode: newItem?.fullCode ?? null };
  });
}

export class BomService {
  private readonly repository: BomRepository;
  constructor(private readonly db: PlannerDatabase) { this.repository = new BomRepository(db); }

  getCurrent(productId: number, colorId: number): BomVersionDetail | null {
    const id = this.repository.getCurrentVersionId(productId, colorId);
    return id === null ? null : this.getVersion(id);
  }

  getVersion(id: number): BomVersionDetail {
    const version = this.repository.getVersion(id);
    if (!version) throw new BomError('BOM_NOT_FOUND', 'BOM 版本不存在');
    return version;
  }

  listVersions(productId: number, colorId: number): BomVersionSummary[] {
    return this.repository.listVersions(productId, colorId);
  }

  queryVersions(filters: BomQueryFilters): BomVersionSummary[] {
    return this.repository.queryVersions(filters);
  }

  listCandidates(input: BomCandidateInput): BomCandidate[] {
    const context = this.validateContext(input.productId, input.bomColorId);
    if (input.usesWhiteMaterial && context.colorCode === WHITE_COLOR_CODE) {
      throw new BomError('WHITE_DRAWING_REQUIRED', '白色 BOM 不需要引用白色共用图号');
    }
    return this.repository.listCandidates(input, WHITE_COLOR_CODE);
  }

  saveVersion(input: SaveBomInput): SavedBomVersion {
    return this.db.transaction(() => {
      const context = this.validateContext(input.productId, input.colorId);
      const currentId = this.repository.getCurrentVersionId(input.productId, input.colorId);
      if (currentId !== input.expectedCurrentVersionId) throw new BomError('BOM_STALE', '当前 BOM 已变化，请刷新后重新保存');
      const projectIds = new Set<number>();
      const validated = input.items.map((item) => this.validateItem(item, input.productId, context.colorId, context.colorCode, projectIds));
      const previous = currentId === null ? null : this.getVersion(currentId);
      const now = new Date().toISOString();
      const versionId = this.repository.insertVersion(input.productId, input.colorId,
        (previous?.versionNumber ?? 0) + 1, currentId, normalizedNotes(input.notes), now);
      validated.forEach((item) => this.repository.insertItem(versionId, item));
      this.repository.activateDrawings(validated.map((item) => item.drawingId));
      this.repository.setCurrent(input.productId, input.colorId, versionId, now);
      const version = this.getVersion(versionId);
      return { version, diff: buildDiff(previous, version) };
    }).immediate();
  }

  private validateContext(productId: number, colorId: number) {
    const context = this.repository.getContext(productId, colorId);
    if (!context || context.productStatus !== 'active') throw new BomError('PRODUCT_NOT_ACTIVE', '产品不存在或已停用');
    if (context.colorType !== 'color' || context.colorStatus !== 'active') throw new BomError('COLOR_NOT_ACTIVE', 'BOM 颜色不存在或已停用');
    return context;
  }

  private validateItem(item: BomItemInput, productId: number, bomColorId: number, bomColorCode: string,
    projectIds: Set<number>) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) throw new BomError('INVALID_QUANTITY', 'BOM 数量必须是正整数');
    if (projectIds.has(item.projectItemId)) throw new BomError('DUPLICATE_PROJECT', '同一 BOM 不能重复添加项目');
    projectIds.add(item.projectItemId);
    const drawing = this.repository.getDrawing(item.drawingId);
    if (!drawing) throw new BomError('DRAWING_NOT_FOUND', '图号不存在');
    if (drawing.productId !== productId) throw new BomError('DRAWING_WRONG_PRODUCT', 'BOM 不允许引用其他型号图号');
    if (drawing.projectItemId !== item.projectItemId) throw new BomError('DRAWING_WRONG_PROJECT', '图号与 BOM 项目不一致');
    if (drawing.status === 'voided') throw new BomError('DRAWING_NOT_ELIGIBLE', '已作废图号不能加入 BOM');
    if (item.usesWhiteMaterial) {
      if (bomColorCode === WHITE_COLOR_CODE || drawing.colorCode !== WHITE_COLOR_CODE) {
        throw new BomError('WHITE_DRAWING_REQUIRED', '颜色共用必须引用同型号白色图号');
      }
    } else if (drawing.colorId !== bomColorId) {
      throw new BomError('DRAWING_WRONG_COLOR', '图号颜色与 BOM 颜色不一致');
    }
    return { projectItemId: item.projectItemId, drawingId: item.drawingId, quantity: item.quantity,
      notes: normalizedNotes(item.notes), usesWhiteMaterial: item.usesWhiteMaterial };
  }
}
