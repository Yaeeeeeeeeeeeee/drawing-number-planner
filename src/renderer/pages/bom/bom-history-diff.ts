import type { BomItemAssetView, BomItemView } from '../../data/client';

type ExtendedItem = BomItemView & { quantity?: number };
export const bomFields = [
  { key: 'main', label: '主类别', value: (item: BomItemView) => item.projectItemId },
  { key: 'project', label: '项目明细', value: (item: BomItemView) => item.projectItemId },
  { key: 'drawing', label: '图号', value: (item: BomItemView) => [item.origin, item.origin === 'planned' ? item.drawingId : item.historicalDrawingId, item.fullCode] },
  { key: 'batch', label: '生效批次', value: (item: BomItemView) => [item.effectiveMaterialBatchId, item.effectiveBatchRelativePath, item.effectiveBatchName] },
  { key: 'quantity', label: '数量', value: (item: BomItemView) => (item as ExtendedItem).quantity },
  { key: 'white', label: '引用白色图号', value: (item: BomItemView) => item.usesWhiteMaterial },
  { key: 'material', label: '材质', value: (item: BomItemView) => item.material },
  { key: 'dimensions', label: '尺寸', value: (item: BomItemView) => item.dimensions },
  { key: 'position', label: '位置', value: (item: BomItemView) => item.position },
  { key: 'changeDetails', label: '修改明细', value: (item: BomItemView) => item.changeDetails },
  { key: 'notes', label: '备注', value: (item: BomItemView) => item.notes },
  { key: 'qr', label: '二维码关联', value: (item: BomItemView) => item.qrCodes.map(code => code.id).sort((a, b) => a - b) },
] as const;
export type BomFieldKey = typeof bomFields[number]['key'];
export type AssetRole = BomItemAssetView['role'];
export const assetRoles: AssetRole[] = ['image', 'diagram'];
export type AttachmentComparison = { kind: 'none' | 'added' | 'removed' | 'replaced' | 'association' | 'unchanged' | 'unknown'; changed: boolean; uncertain: boolean; label: string };
const digest = (value: string) => /^[a-f0-9]{64}$/i.test(value) ? value.toLowerCase() : null;

/** Compare stored attachment associations/content digests, never infer live disk availability. */
export function compareAttachments(previous: BomItemAssetView[], selected: BomItemAssetView[]): AttachmentComparison {
  if (previous.length > 1 || selected.length > 1) return { kind: 'unknown', changed: false, uncertain: true, label: '同类型附件不唯一，待确认关联' };
  if (!previous.length && !selected.length) return { kind: 'none', changed: false, uncertain: false, label: '未关联' };
  if (!previous.length) return { kind: 'added', changed: true, uncertain: false, label: '新增关联' };
  if (!selected.length) return { kind: 'removed', changed: true, uncertain: false, label: '删除关联' };
  const a = previous[0], b = selected[0], oldHash = digest(a.contentSha256), newHash = digest(b.contentSha256);
  if (oldHash && newHash && oldHash !== newHash) return { kind: 'replaced', changed: true, uncertain: false, label: '记录内容摘要不同 · 替换' };
  const identity = (asset: BomItemAssetView) => [asset.assetId, asset.role, asset.relativePath, asset.originalFileName, asset.mimeType, asset.sizeBytes];
  if (JSON.stringify(identity(a)) !== JSON.stringify(identity(b))) return { kind: 'association', changed: true, uncertain: !oldHash || !newHash, label: oldHash && newHash ? '关联变更 · 记录内容摘要一致' : '关联变更 · 内容待核对' };
  if (!oldHash || !newHash) return { kind: 'unknown', changed: false, uncertain: true, label: '内容摘要不足，不能确认内容一致' };
  return { kind: 'unchanged', changed: false, uncertain: false, label: '记录内容摘要一致' };
}

export type HistoryKind = 'added' | 'removed' | 'modified' | 'unchanged' | 'pending' | 'first';
export interface HistoryItem {
  key: string; kind: HistoryKind; selected?: BomItemView; previous?: BomItemView;
  changedFields: BomFieldKey[]; attachments: Record<AssetRole, AttachmentComparison>; reason?: string;
}
const emptyAttachments = (): Record<AssetRole, AttachmentComparison> => ({ image: compareAttachments([], []), diagram: compareAttachments([], []) });
export const snapshotItems = (items: BomItemView[], kind: 'first' | 'pending', reason: string): HistoryItem[] => items.map((selected, index) => ({
  key: `selected:${selected.bomItemId}:${index}`, kind, selected, changedFields: [], attachments: emptyAttachments(), reason,
}));

/** projectItemId is unique within a BOM version in the current schema; fail closed on bad payloads. */
export function compareBomItems(selected: BomItemView[], previous: BomItemView[]) {
  const group = (items: BomItemView[]) => {
    const result = new Map<number, BomItemView[]>();
    for (const item of items) result.set(item.projectItemId, [...(result.get(item.projectItemId) ?? []), item]);
    return result;
  };
  const currentGroups = group(selected), oldGroups = group(previous), rows: HistoryItem[] = [];
  const ambiguous = (id: number) => !Number.isSafeInteger(id) || id === 0 || (currentGroups.get(id)?.length ?? 0) > 1 || (oldGroups.get(id)?.length ?? 0) > 1;
  const pending = (item: BomItemView, side: 'selected' | 'previous', index: number): HistoryItem => ({ key: `${side}:${item.bomItemId}:${index}`, kind: 'pending', [side]: item, changedFields: [], attachments: emptyAttachments(), reason: '待确认对应关系：项目身份缺失或同一版本项目不唯一；未按名称、图号或排列位置配对。' });
  selected.forEach((item, index) => {
    if (ambiguous(item.projectItemId)) { rows.push(pending(item, 'selected', index)); return; }
    const old = oldGroups.get(item.projectItemId)?.[0];
    const attachments = Object.fromEntries(assetRoles.map(role => [role, compareAttachments(old?.assets.filter(asset => asset.role === role) ?? [], item.assets.filter(asset => asset.role === role))])) as HistoryItem['attachments'];
    if (!old) { rows.push({ key: `project:${item.projectItemId}`, kind: 'added', selected: item, changedFields: [], attachments }); return; }
    const changedFields = bomFields.filter(field => JSON.stringify(field.value(item)) !== JSON.stringify(field.value(old))).map(field => field.key);
    const changed = changedFields.length > 0 || assetRoles.some(role => attachments[role].changed);
    const uncertain = assetRoles.some(role => attachments[role].uncertain);
    rows.push({ key: `project:${item.projectItemId}`, kind: changed ? 'modified' : uncertain ? 'pending' : 'unchanged', selected: item, previous: old, changedFields, attachments, ...(uncertain ? { reason: '项目对应关系已确认；附件摘要或关联不足，部分附件内容待确认。' } : {}) });
  });
  previous.forEach((item, index) => {
    if (ambiguous(item.projectItemId)) { rows.push(pending(item, 'previous', index)); return; }
    if (!currentGroups.has(item.projectItemId)) rows.push({ key: `project:${item.projectItemId}`, kind: 'removed', previous: item, changedFields: [], attachments: Object.fromEntries(assetRoles.map(role => [role, compareAttachments(item.assets.filter(asset => asset.role === role), [])])) as HistoryItem['attachments'] });
  });
  const counts = { added: 0, removed: 0, modified: 0, unchanged: 0, pending: 0 };
  for (const row of rows) if (row.kind !== 'first') counts[row.kind]++;
  return { rows, counts };
}
