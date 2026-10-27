import type { OutboundMailContext } from './PackageBuilder';

export interface DraftChange {
  id: number;
  itemName: string;
  fullCode: string;
  mainCategoryName: string;
  files: Array<{ fileName: string; batchName: string }>;
  reason: string;
  showFileName: boolean;
}
export const fileBaseName = (name: string) => name.split(/[\\/]/).at(-1) ?? name;

/** Context is the frozen successful ZIP manifest, never the current PDF or BOM list. */
export function draftChanges(context: OutboundMailContext | null): DraftChange[] {
  if (!context || context.materialType !== 'update') return [];
  return context.items.filter(item => item.changeVerified !== false && !!item.change && ['new', 'replaced', 'same_code_changed'].includes(item.change))
    .map((item, index) => ({ id: index, itemName: item.projectItemName,
      fullCode: item.fullCode ?? '', mainCategoryName: item.mainCategoryName ?? '',
      files: [{ fileName: fileBaseName(item.fileName), batchName: item.sourceBatchName }],
      reason: item.changeDetails?.trim() ?? '', showFileName: true }));
}
export function describeChanges(changes: DraftChange[], withFiles: boolean): string {
  return changes.map((item, index) => `${index + 1}. ${item.itemName}${item.fullCode ? `（${item.fullCode}）` : ''}\n修改内容：${item.reason.trim() || '【请填写具体修改原因】'}${withFiles && item.showFileName ? `\n新文件：${item.files.map(file => file.fileName).join('\n新文件：')}` : ''}`).join('\n\n');
}
export function mergeDraftChanges(changes: DraftChange[], selected: number[]): DraftChange[] {
  const entries = changes.filter(item => selected.includes(item.id));
  if (entries.length < 2) return changes;
  const merged: DraftChange = { ...entries[0], itemName: [...new Set(entries.map(item => item.itemName))].join('、'),
    fullCode: [...new Set(entries.map(item => item.fullCode).filter(Boolean))].join('、'),
    mainCategoryName: [...new Set(entries.map(item => item.mainCategoryName).filter(Boolean))].join('、'),
    files: entries.flatMap(item => item.files), reason: [...new Set(entries.map(item => item.reason.trim()).filter(Boolean))].join('\n') };
  return changes.flatMap(item => item.id === entries[0].id ? [merged] : selected.includes(item.id) ? [] : [item]);
}
export function unresolvedVariables(text: string): boolean { return /\{\{[^{}]+\}\}/.test(text); }
