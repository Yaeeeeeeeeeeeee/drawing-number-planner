import type { BomItemView, BomVersionView } from '../../data/client';
export interface AppearanceBomDifference { name: string; before: string; after: string }
function describe(items: BomItemView[]): string {
  return items.map(item => [item.fullCode, item.material, item.dimensions, item.position, item.changeDetails,
    item.notes, item.effectiveBatchName, item.usesWhiteMaterial ? '引用白色图号' : null,
    ...(item.assets ?? []).map(asset => `${asset.role === 'image' ? '图片' : '位置示意图'} ${asset.originalFileName}`).sort()]
    .filter(value => value != null && value !== '').join(' · ')).join('；') || '无';
}
function facts(items: BomItemView[]): string {
  return JSON.stringify(items.map(item => ({
    fullCode: item.fullCode, material: item.material, dimensions: item.dimensions,
    position: item.position, changeDetails: item.changeDetails, notes: item.notes,
    materialBatchId: item.effectiveMaterialBatchId, usesWhiteMaterial: item.usesWhiteMaterial,
    assets: (item.assets ?? []).map(asset => ({role: asset.role, name: asset.originalFileName, content: asset.contentSha256}))
      .sort((a,b) => a.role.localeCompare(b.role)),
  })));
}
export function appearanceBomDifferences(before: BomVersionView | null, after: BomVersionView | null): AppearanceBomDifference[] {
  const projects = new Set([...(before?.items ?? []).map(item => item.projectItemId), ...(after?.items ?? []).map(item => item.projectItemId)]);
  return [...projects].flatMap(projectId => {
    const oldItems = before?.items.filter(item => item.projectItemId === projectId) ?? [];
    const newItems = after?.items.filter(item => item.projectItemId === projectId) ?? [];
    if (facts(oldItems) === facts(newItems)) return [];
    const oldDescription = describe(oldItems), newDescription = describe(newItems);
    return [{name: oldItems[0]?.projectItemName ?? newItems[0]?.projectItemName ?? String(projectId), before: oldDescription,
      after: oldDescription === newDescription ? `${newDescription}（关联或附件内容发生变化）` : newDescription}];
  });
}
