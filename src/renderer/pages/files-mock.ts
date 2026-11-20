import type { PlannerApi, PdfFileView, MaterialBatchView, ProductView, LocalTaskView, PdfScanSummaryView } from '../data/client';

export const filesScenarios = { normal: '大量文件 / 多批次', long: '超长文件名与路径', anomalies: '缺失 / 匹配异常', empty: '无数据', 'no-results': '无搜索结果', loading: '加载中', error: '加载失败', 'scan-error': '扫描失败' } as const;
export type FilesScenario = keyof typeof filesScenarios;
export const isFilesMockEnabled = () => import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mock') === 'files';
export function initialFilesScenario(): FilesScenario {
  const value = new URLSearchParams(window.location.search).get('files-scenario');
  return value && Object.hasOwn(filesScenarios, value) ? value as FilesScenario : 'normal';
}

// This adapter never accepts a real API or file bridge. New methods are denied by default.
export function createFilesMockApi(scenario: FilesScenario): PlannerApi {
  const clone = <T,>(value: T): T => structuredClone(value);
  const product: ProductView = { id: -101, sku: 'MOCK-T40', model: 'T40', productCategory: '洗碗机', status: 'active', brandId: -1, brandName: '预览品牌', productSizeId: -2, productSizeName: '洗碗机', defaultAppearanceId: -3, defaultAppearanceName: '白色', referenceProductId: null, referenceProductModel: null };
  let batches: MaterialBatchView[] = ['03.20261001', '02.20260901', '01.20260801', '待识别目录'].map((name, i) => ({ id: -301 - i, name, relativePath: `MOCK_ONLY/MOCK-T40-T40/${name}`, productDirectory: 'MOCK_ONLY/MOCK-T40-T40', productId: product.id, productCategory: product.productCategory, sku: product.sku, model: product.model, sequenceNumber: i < 3 ? 3 - i : null, businessDate: null, recognitionStatus: i === 3 ? 'pending' : 'recognized', classificationWarning: i === 3 ? '批次目录待确认' : null, isPresent: true, currentState: i === 0 ? 'current' : i < 3 ? 'historical' : 'indeterminate', fileCount: 0 }));
  if (scenario === 'anomalies') batches[2].isPresent = false;
  let rows: PdfFileView[] = Array.from({ length: scenario === 'empty' ? 0 : 150 }, (_, i) => {
    const batch = batches[i % 4];
    const long = scenario === 'long' && i % 7 === 2;
    const abnormal = scenario === 'anomalies' || i % 17 === 5;
    const matchStatus = abnormal ? (['pending', 'unmatched', 'conflict', 'matched'] as const)[i % 4] : 'matched';
    const conversionType = i % 2 ? 'outlined' : 'source';
    const fullCode = `02.0209.010.0501${String(Math.floor(i / 6) + 1).padStart(3, '0')}${long ? '-EXTENDED-APPEARANCE-PRODUCTION-QC' : ''}`;
    const fileName = long
      ? `02.0404.010.${String(401001 + i).padStart(7, '0')}-验收样例-F60白色-${i % 2 ? '包装箱' : '说明书'}${conversionType === 'outlined' ? '（转曲）' : '（源文件）'}.pdf`
      : `${i % 2 ? '包装箱' : '说明书'}-${String(i + 1).padStart(3, '0')}-${conversionType === 'source' ? '源文件' : '转曲后'}.pdf`;
    const relativePath = `${batch.relativePath}/${long ? '供应商交付/生产确认/多语言版本/包装资料/最终签样/归档副本/' : ''}${conversionType === 'source' ? '转曲前' : '转曲后'}/${fileName}`;
    return { id: -1001 - i, fileName, relativePath, pathKey: relativePath.toLowerCase(), drawingId: matchStatus === 'matched' && i % 5 ? -501 - Math.floor(i / 6) : null, historicalDrawingId: matchStatus === 'matched' && i % 5 === 0 ? -601 - Math.floor(i / 6) : null, historicalFullCode: matchStatus === 'matched' && i % 5 === 0 ? fullCode : null, fullCode: matchStatus === 'matched' ? fullCode : null, displayName: '开发预览，非业务记录', productId: matchStatus === 'matched' ? product.id : null, sku: matchStatus === 'matched' ? product.sku : null, model: matchStatus === 'matched' ? product.model : null, productCategory: matchStatus === 'matched' ? product.productCategory : null, brandName: '预览品牌', projectItemName: i % 2 ? '包装箱' : '说明书', colorName: '白色', matchStatus, detectedCodes: matchStatus === 'unmatched' ? [] : matchStatus === 'conflict' ? [fullCode, '02.0209.010.0501999'] : [fullCode], conversionType, classificationWarning: matchStatus === 'pending' ? '图号候选需要人工确认' : null, sizeBytes: 1048576 + i * 32000, modifiedAt: '2026-10-01T08:30:00Z', scannedAt: '2026-10-01T09:00:00Z', isPresent: scenario === 'anomalies' ? i % 3 !== 0 : i % 13 !== 7, materialBatchId: batch.id, materialBatchName: batch.name, materialBatchStatus: batch.recognitionStatus };
  });
  let root = 'MOCK_ONLY/资料库（内存样例，无磁盘目录）';
  let qrCount = 12;
  let scanCount = 1;
  let task: LocalTaskView | null = null;
  const counts = () => ({ pdfFiles: rows.length, qrCodeFiles: qrCount, materialBatches: batches.length, scanChanges: scanCount ? 3 : 0, scanRuns: scanCount });
  const filterRows = (filters: Record<string, any>) => {
      const keyword = String(filters.keyword ?? '').trim().toLowerCase();
    return scenario === 'no-results' ? [] : rows.filter(row => (!keyword || [row.fileName, row.relativePath, row.fullCode ?? row.historicalFullCode].some(value => value?.toLowerCase().includes(keyword)))
        && (!filters.productId || row.productId === filters.productId) && (!filters.materialBatchId || row.materialBatchId === filters.materialBatchId)
        && (!filters.productCategory || row.productCategory === filters.productCategory)
        && (filters.unassociatedProduct !== 'true' || row.productId === null)
        && (!filters.matchStatus || row.matchStatus === filters.matchStatus) && (!filters.conversionType || row.conversionType === filters.conversionType)
        && ((filters.presence ?? 'present') === 'all' || row.isPresent === ((filters.presence ?? 'present') === 'present')));
  };
  const methods: Record<string, (...args: any[]) => Promise<unknown>> = {
    getWorkspaceSettings: async () => ({ workspaceRoot: root, configured: true, available: true }),
    updateWorkspaceSettings: async (value: string) => { root = value; return { workspaceRoot: root, configured: true, available: true }; },
    listProducts: async () => clone([product]),
    listMaterialBatches: async () => clone(batches.map(batch => ({ ...batch, fileCount: rows.filter(row => row.materialBatchId === batch.id).length }))),
    getPdfFileNavigation: async (filters: Record<string, any> = {}) => {
      if (scenario === 'error') throw new Error('Mock：导航统计加载失败');
      const filtered = filterRows({ keyword: filters.keyword, matchStatus: filters.matchStatus, conversionType: filters.conversionType, presence: filters.presence });
      const associated = filtered.filter(row => row.productId === product.id);
      return {total:filtered.length,unassociatedProducts:filtered.filter(row => row.productId === null).length,
        categories:associated.length ? [{name:product.productCategory,count:associated.length}] : [],
        products:associated.length ? [{productId:product.id,count:associated.length}] : [],
        batches:batches.flatMap(batch => [product.id,null].map(productId => ({materialBatchId:batch.id,productId,count:filtered.filter(row => row.materialBatchId === batch.id && row.productId === productId).length})).filter(item => item.count > 0))};
    },
    getDrawingNavigation: async () => ({batches:[]}),
    searchPdfFiles: async (filters: Record<string, any> = {}) => {
      if (scenario === 'loading') return new Promise(() => {});
      if (scenario === 'error') throw new Error('Mock：PDF 文件加载失败，切换场景可重试。');
      const filtered = filterRows(filters);
      const page = filters.page ?? 1; const pageSize = filters.pageSize ?? 50;
      return clone({ items: filtered.slice((page - 1) * pageSize, page * pageSize), total: filtered.length, page, pageSize });
    },
    scanPdfFiles: async () => {
      task = { id: 'mock-files-scan', kind: 'workspace_scan', status: 'running', cancelRequested: false, createdAt: '2026-10-01T09:00:00Z', progress: { processed: 0, total: rows.length, phase: 'scanning', message: '仅模拟内存扫描，不访问磁盘' } };
      await new Promise(resolve => setTimeout(resolve, 600));
      if (task.cancelRequested) { task.status = 'cancelled'; throw new Error('Mock：扫描已取消，原内存索引保留'); }
      if (scenario === 'scan-error') { task.status = 'failed'; throw new Error('Mock：扫描失败，原内存索引未更改'); }
      task.status = 'completed'; task.progress.processed = rows.length; scanCount++;
      const present = rows.filter(row => row.isPresent);
      const summary: PdfScanSummaryView = { total: present.length, currentTotal: present.length + qrCount, matched: present.filter(row => row.matchStatus === 'matched').length, pending: present.filter(row => row.matchStatus === 'pending').length, unmatched: present.filter(row => row.matchStatus === 'unmatched').length, conflict: present.filter(row => row.matchStatus === 'conflict').length, historicalRegistered: 0, source: present.filter(row => row.conversionType === 'source').length, outlined: present.filter(row => row.conversionType === 'outlined').length, missing: rows.filter(row => !row.isPresent).length, scanId: -901, scannedAt: '2026-10-01T09:00:00Z', comparison: { added: 1, missing: 1, moved: 0, changed: 1, unchanged: Math.max(0, present.length + qrCount - 2) } };
      return clone(summary);
    },
    listLocalTasks: async () => clone(task ? [task] : []),
    cancelLocalTask: async (id: string) => { if (!task || id !== task.id || task.status !== 'running') throw new Error('Mock：没有可取消的内存任务'); task.cancelRequested = true; return clone(task); },
    getFileScanChanges: async () => ({ scan: { id: -901, completedAt: '2026-10-01T09:00:00Z', currentTotal: rows.filter(row => row.isPresent).length + qrCount, added: 1, missing: 1, moved: 0, changed: 1, unchanged: Math.max(0, rows.filter(row => row.isPresent).length + qrCount - 2) }, changes: { added: [{ id: -1, type: 'added', indexKind: 'qr', fileName: '二维码-预览.png', relativePath: 'MOCK_ONLY/二维码-预览.png', previousRelativePath: null, fullCode: null }], missing: [{ id: -2, type: 'missing', indexKind: 'pdf', fileName: '旧文件-预览.pdf', relativePath: 'MOCK_ONLY/旧文件-预览.pdf', previousRelativePath: null, fullCode: null }], changed: [{ id: -3, type: 'changed', indexKind: 'pdf', fileName: '修改文件-预览.pdf', relativePath: 'MOCK_ONLY/修改文件-预览.pdf', previousRelativePath: null, fullCode: null }] } }),
    getFileIndexClearPreview: async () => ({ workspaceRoot: root, counts: counts() }),
    cleanupPdfFiles: async (ids: number[]) => { if (!ids.length || new Set(ids).size !== ids.length || ids.some(id => !rows.some(row => row.id === id && !row.isPresent))) throw new Error('Mock：只能清理已缺失的内存索引'); rows = rows.filter(row => !ids.includes(row.id)); return { cleaned: ids.length }; },
    clearFileIndex: async (confirmation: string) => { if (confirmation !== '清空资料库索引') throw new Error('Mock：确认短语不正确'); const result = counts(); rows = []; batches = []; qrCount = 0; scanCount = 0; return result; },
  };
  return new Proxy(Object.create(null), { get: (_, name) => methods[String(name)] ?? (async () => { throw new Error(`Mock 已隔离：${String(name)} 未启用，不会调用真实服务。`); }) }) as PlannerApi;
}
