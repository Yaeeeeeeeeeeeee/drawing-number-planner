import type { DrawingDetailView, DrawingFileView, DrawingView, PlannerApi } from '../data/client';

export const DRAWING_LIBRARY_MOCK_QUERY = 'mock=drawing-library';

const longCode = '02.0209.010.0501001-EXTENDED-APPEARANCE-CODE';
const longFileName = '说明书-超长文件名-当前转曲后-供应商确认版-20261001-final-final.pdf';
const longPath = '01.20261001/超长型号目录-SKU-T40-PRODUCTION-QC/包装资料/说明书/供应商交付/转曲后文件';

const file = (pdfIndexId: number, fileName: string, relativePath: string, isPresent: boolean, conversionType: DrawingFileView['conversionType']): DrawingFileView =>
  ({ pdfIndexId, fileName, relativePath, isPresent, conversionType });

const occurrence = (batchId: number, batchName: string, usageState: 'current' | 'historical' | 'unbatched', files: DrawingFileView[], productDirectory: string) => ({
  batchId, productId: 1, productDirectory, batchName, sequenceNumber: batchId, recognitionStatus: 'recognized' as const,
  usageState, files,
});

const makeRow = (id: number, overrides: Partial<DrawingView> = {}): DrawingView => ({
  id, origin: 'planned', sku: 'SKU-T40', fullCode: `02.0209.010.0501${String(id).padStart(3, '0')}`,
  displayName: id % 2 ? '说明书' : '包装箱', productId: 1, model: 'T40', productCategory: '洗碗机',
  brandName: '示例品牌', colorName: id % 2 ? '白色' : '黑色', mainCategoryName: '包装', projectItemName: id % 2 ? '说明书' : '包装箱',
  status: id % 7 === 0 ? 'reserved' : id % 5 === 0 ? 'voided' : 'active', hasSourceFile: id % 4 !== 0,
  hasOutlinedFile: id % 6 !== 0, dictionaryMappingStatus: id % 9 === 0 ? 'unmapped' : 'mapped', deletedAt: null,
  deletionMode: null, deletedPreviousStatus: null, deletedReason: null, occupied: true,
  batchUsage: { state: id % 6 === 0 ? 'historical' : 'current', occurrenceCount: id % 4 === 0 ? 3 : 1, currentProductCount: id % 6 === 0 ? 0 : 1,
    historicalProductCount: id % 4 === 0 ? 2 : 0, conflictWithBusinessStatus: false, occurrences: [
      occurrence(id, id % 6 === 0 ? '00.首批大货' : '01.20261001', id % 6 === 0 ? 'historical' : 'current', [], '01.20261001/SKU-T40'),
      ...(id % 4 === 0 ? [occurrence(id + 100, '00.20260920', 'historical', [], '00.20260920/SKU-T40'),
        occurrence(id + 200, '00.20260910', 'historical', [], '00.20260910/SKU-T40')] : []),
    ] },
  ...overrides,
});

const rows: DrawingView[] = Array.from({ length: 47 }, (_, index) => makeRow(index + 1));
rows[2] = makeRow(3, { fullCode: longCode, displayName: '超长图号对应的说明书与位置示意图' });
rows[7] = makeRow(8, { origin: 'historical', status: 'active', fullCode: '02.0209.010.0501008', displayName: '历史扫描图号 · 说明书', readOnly: true });
rows[8] = makeRow(9, { origin: 'historical', status: 'inactive', fullCode: '02.0209.010.0501009', displayName: '历史停用图号', readOnly: true });
rows[12] = makeRow(13, { status: 'voided', fullCode: '02.0209.010.0501013', displayName: '已作废正式图号' });
rows[16] = makeRow(17, { deletedAt: '2026-09-30', deletionMode: 'retain_occupied', deletedPreviousStatus: 'active', displayName: '删除记录但保留占号' });
rows[20] = makeRow(21, { hasSourceFile: false, hasOutlinedFile: false, displayName: '源文件与转曲后文件均缺失' });
rows[24] = makeRow(25, { hasSourceFile: true, hasOutlinedFile: false, displayName: '仅有转曲前源文件' });
rows[28] = makeRow(29, { hasSourceFile: false, hasOutlinedFile: true, displayName: '仅有转曲后文件' });
rows[32] = makeRow(33, { batchUsage: { state: 'unbatched', occurrenceCount: 0, currentProductCount: 0, historicalProductCount: 0, conflictWithBusinessStatus: false, occurrences: [] }, displayName: '未建立批次关系' });
rows[36] = makeRow(37, { fullCode: '02.0209.010.0501037', displayName: longFileName });

const detailFiles = (row: DrawingView): { sourceFiles: DrawingFileView[]; outlinedFiles: DrawingFileView[] } => ({
  sourceFiles: row.id === 21 ? [] : [file(row.id * 10 + 1, row.id === 37 ? longFileName.replace('转曲后', '源文件') : `说明书-${row.id}-源文件.ai`, `${longPath}/源文件`, row.hasSourceFile, 'source')],
  outlinedFiles: row.id === 21 ? [] : [file(row.id * 10 + 2, row.id === 3 || row.id === 37 ? longFileName : `说明书-${row.id}-转曲后.pdf`, row.id === 3 || row.id === 37 ? longPath : `01.20261001/SKU-T40/转曲后`, row.hasOutlinedFile, 'outlined'),
    ...(row.id % 4 === 0 ? [file(row.id * 10 + 3, `历史批次-${row.id}.pdf`, `00.20260920/SKU-T40/历史文件/${row.id}`, true, 'outlined')] : [])],
});

export const drawingLibraryMockDetails = new Map<number, DrawingDetailView>(rows.map((row) => {
  const files = detailFiles(row);
  const batchUsage = row.batchUsage ? { ...row.batchUsage, occurrences: row.batchUsage.occurrences.map((item) => ({ ...item, files: [...files.outlinedFiles] })) } : undefined;
  return [row.id, { ...row, sourceFiles: files.sourceFiles, outlinedFiles: files.outlinedFiles, currentBomUsage: row.id % 3 === 0 ? [{ bomVersionId: row.id, productId: 1, model: 'T40', colorId: 1, colorName: '白色', versionNumber: 1, projectItemId: 1, projectItemName: '说明书', quantity: 1, usesWhiteMaterial: false }] : [], readOnly: row.origin === 'historical', readOnlyMessage: row.origin === 'historical' ? '历史扫描来源；编码不可直接修改。' : null, batchUsage }];
}));

const clone = <T,>(value: T): T => structuredClone(value);

export function isDrawingLibraryMockEnabled() {
  return import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mock') === 'drawing-library';
}

export function createDrawingLibraryMockApi(_api?: PlannerApi): PlannerApi {
  const mockSearch = async (filters: Record<string, string | number | boolean | undefined> = {}) => {
    const needle = String(filters.keyword || filters.drawingNumber || '').toLowerCase();
    const filtered = rows.filter((row) => (!needle || `${row.fullCode} ${row.displayName} ${row.model} ${row.sku ?? ''}`.toLowerCase().includes(needle))
      && (filters.deletionState === 'all' || !filters.deletionState || (filters.deletionState === 'normal' ? !row.deletedAt
        : filters.deletionState === 'deleted-retained' ? row.deletionMode === 'retain_occupied' : row.deletionMode === 'release'))
      && (!filters.status || row.status === filters.status)
      && (filters.sourcePresence !== 'missing' || !row.hasSourceFile) && (filters.sourcePresence !== 'present' || row.hasSourceFile)
      && (filters.outlinedPresence !== 'missing' || !row.hasOutlinedFile) && (filters.outlinedPresence !== 'present' || row.hasOutlinedFile));
    const pageSize = Number(filters.pageSize ?? 20); const page = Number(filters.page ?? 1); const start = (page - 1) * pageSize;
    return { items: clone(filtered.slice(start, start + pageSize)), total: filtered.length, page, pageSize };
  };
  const preview = { searchDrawings: mockSearch, getDrawing: async (id: number) => clone(drawingLibraryMockDetails.get(id) ?? drawingLibraryMockDetails.get(1)!), listDictionaries: async () => [], listProducts: async () => [], listMaterialBatches: async () => [], searchPdfFiles: async () => ({ items: [], total: 0, page: 1, pageSize: 100 }) };
  // No delegation: deny unknown methods too, including future write/disk APIs.
  return new Proxy(preview, { get(target, key) {
    if (key in target) return Reflect.get(target, key);
    if (typeof key !== 'string' || key === 'then') return undefined;
    return async () => { throw new Error('Mock 仅用于只读视觉预览，维护和磁盘操作已禁用'); };
  } }) as unknown as PlannerApi;
}
