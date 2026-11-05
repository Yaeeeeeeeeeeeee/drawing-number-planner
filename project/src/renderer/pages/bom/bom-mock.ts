import { ApiError, type BomCandidateView, type BomItemAssetView, type BomItemView, type BomVersionView, type DictionaryItemView, type MaterialBatchView, type PlannerApi, type ProductView } from '../../data/client';

export const bomScenarios = {
  normal: '正常密集 BOM', long: '长内容', attachments: '附件组合 / 预览失败', references: '异常引用 / 空候选',
  unselected: '未选择产品', empty: '产品无 BOM', 'no-results': '查询无结果', loading: '加载中', error: '加载失败', conflict: '保存冲突',
} as const;
export type BomScenario = keyof typeof bomScenarios;
export const isBomMockEnabled = () => import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mock') === 'bom';
export const initialBomScenario = (): BomScenario => {
  const value = typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('bom-scenario');
  return value && Object.hasOwn(bomScenarios, value) ? value as BomScenario : 'normal';
};
const product: ProductView = { id: -101, sku: 'MOCK-SKU-T40', brandId: -1, brandName: '预览示例品牌', productSizeId: -2, productSizeName: '洗碗机', defaultAppearanceId: -3, defaultAppearanceName: '白色', model: 'MOCK-T40', productCategory: '洗碗机', referenceProductId: null, referenceProductModel: null, status: 'active' };
const category: DictionaryItemView = { id: -10, code: '05', name: '包装资料', status: 'active', parentId: null };
const projects: DictionaryItemView[] = ['说明书', '包装箱', '保修卡', '铭牌', '警示贴', '能效标识', '安装指南', '附件清单', '无候选预览项目'].map((name, i) => ({ id: -20 - i, code: String(i + 1).padStart(2, '0'), name, parentId: -10, status: 'active' }));
const batches: MaterialBatchView[] = ['20261001', '20260901', '20260801'].map((name, i) => ({ id: -301 - i, name, relativePath: `MOCK_ONLY/${name}/MOCK-SKU-T40`, productDirectory: 'MOCK_ONLY/MOCK-SKU-T40', productId: -101, productCategory: '洗碗机', sku: product.sku, model: product.model, sequenceNumber: i + 1, businessDate: null, recognitionStatus: 'recognized', classificationWarning: null, isPresent: i !== 2, currentState: i === 0 ? 'current' : 'historical', fileCount: 8 }));
const asset = (i: number, role: 'image' | 'diagram'): BomItemAssetView => ({ id: -401 - i * 2 - (role === 'diagram' ? 1 : 0), assetId: -401 - i * 2 - (role === 'diagram' ? 1 : 0), role, relativePath: `MOCK_ONLY/附件预览/${projects[i].name}/${role}.png`, originalFileName: `${projects[i].name}-${role === 'image' ? '图片' : '位置示意图'}.png`, mimeType: 'image/png', sizeBytes: 256, contentSha256: 'renderer-only-no-disk-file', createdAt: '2026-10-01T00:00:00Z', inheritedFromBomItemAssetId: i === 4 ? -800 : null, inherited: i === 4 });
function version(scenario: BomScenario, old = false): BomVersionView {
  const items: BomItemView[] = projects.slice(0, 8).map((project, i) => {
    const batch = batches[i % 3];
    const long = scenario === 'long' && i === 1;
    return {
      ...(old && i === 1 ? { origin: 'historical' as const, historicalDrawingId: -601 - i } : { origin: 'planned' as const, drawingId: -501 - i }),
      bomItemId: -701 - i, fullCode: `02.0209.010.050100${i + 1}${long ? '-EXTENDED-APPEARANCE-PRODUCTION-QC-CODE' : ''}`, displayName: `${project.name}（开发预览，非业务数据）`, projectItemId: project.id, projectItemName: project.name,
      status: scenario === 'references' && i === 0 ? 'voided' : old && i === 1 ? 'inactive' : 'active',
      effectiveMaterialBatchId: batch.id, effectiveBatchRelativePath: batch.relativePath, effectiveBatchName: batch.name,
      material: long ? '350g 白卡纸覆哑膜，局部耐磨涂层；双面四色印刷，按供应商签样执行' : ['128g 铜版纸', '五层瓦楞纸', '250g 白卡纸', 'PET 哑银'][i % 4],
      dimensions: long ? '展开 720 × 480 mm；成品 180 × 120 mm；裁切公差 ±1.0 mm' : `${180 + i * 10} × ${120 + i * 5} mm`,
      position: long ? '包装内侧上部靠右，距离折线 25 mm，避开封箱胶带与条码区域' : i % 2 ? '包装箱右侧' : '随产品附件袋', notes: null, usesWhiteMaterial: false,
      changeDetails: long ? '1. 更新警示语与供应商校对内容。\n2. 调整安装步骤编号，保留原引用。\n3. 位置示意图按最终签样确认。' : i % 2 ? '调整文字位置；尺寸不变。' : '沿用版式，更新资料批次。',
      assets: i % 4 === 3 ? [] : i % 4 === 1 ? [asset(i, 'image')] : i % 4 === 2 ? [asset(i, 'diagram')] : [asset(i, 'image'), asset(i, 'diagram')], qrCodes: [],
    };
  });
  return { id: old ? -202 : -201, productId: -101, model: product.model, versionNumber: old ? 1 : 2, previousVersionId: old ? null : -202, businessChangeDate: old ? '2026-09-01' : '2026-10-01', businessChangeDateLabel: old ? '2026-09-01' : '2026-10-01', createdAt: '2026-10-01T08:00:00Z', updatedAt: '2026-10-01T08:00:00Z', editRevision: 1, notes: '仅开发预览', items };
}

// No real API is accepted or captured. Unknown methods fail closed, including future additions.
export function createBomMockApi(scenario: BomScenario): PlannerApi {
  const current = version(scenario);
  const old = version(scenario, true);
  const clone = <T,>(value: T) => structuredClone(value);
  const methods: Record<string, (...args: any[]) => Promise<unknown>> = {
    listProducts: async () => clone([product]),
    listDictionaries: async (type: string) => clone(type === 'main_category' ? [category] : type === 'project_item' ? projects : []),
    listMaterialBatches: async () => clone(batches),
    listBomQrCandidates: async () => [], // Preserve the existing loading dependency; do not fix the business TODO here.
    getCurrentBom: async () => {
      if (scenario === 'loading') return new Promise(() => {});
      if (scenario === 'error') throw new Error('Mock：BOM 加载失败，可切换场景重试。');
      return scenario === 'empty' ? null : clone(current);
    },
    getBomVersion: async (id: number) => {
      if (id !== current.id && id !== old.id) throw new Error('Mock：未定义的 BOM 记录');
      return clone(id === old.id ? old : current);
    },
    queryBomVersions: async (filters: Record<string, unknown> = {}) => scenario === 'no-results' ? [] : clone([current, old].filter((record) =>
      (!filters.model || record.model.includes(String(filters.model))) && (!filters.businessChangeDate || record.businessChangeDate === filters.businessChangeDate)
      && (!filters.projectItemId || record.items.some((item) => item.projectItemId === filters.projectItemId))
      && (!filters.fullCode || record.items.some((item) => item.fullCode.includes(String(filters.fullCode))))
      && (!filters.effectiveBatchRelativePath || record.items.some((item) => item.effectiveBatchRelativePath?.includes(String(filters.effectiveBatchRelativePath)))))),
    listBomCandidates: async (filters: { projectItemId: number; entryMode: string }) => {
      const item = current.items.find((row) => row.projectItemId === filters.projectItemId);
      if (!item) return [];
      const planned: BomCandidateView = { origin: 'planned', drawingId: -501 - current.items.indexOf(item), fullCode: item.fullCode, displayName: item.displayName, projectItemId: item.projectItemId, projectItemName: item.projectItemName, status: 'active' };
      // A voided original is deliberately absent from candidates, as in the real retained-reference path.
      const available = item.status === 'voided' ? [] : [planned];
      return clone(filters.entryMode === 'historical' ? [...available, { ...planned, origin: 'historical', historicalDrawingId: -601 - current.items.indexOf(item), status: 'inactive' }] : available);
    },
  };
  if (scenario === 'conflict') {
    const conflict = async () => { throw new ApiError('BOM_STALE', 'Mock：保存冲突，记录已被另一窗口修改。请刷新后核对。'); };
    methods.saveBomVersion = conflict;
    methods.updateBomVersion = conflict;
  }
  // Optional capabilities must stay absent: returning a rejecting function advertises
  // support to feature detection and prevents the existing read-only fallback.
  const unsupportedAppearanceReads = new Set(['listAppearanceVersions', 'getAppearanceBom', 'listAppearanceBoms',
    'listAppearanceBomCandidates', 'listAppearanceBomQrCandidates', 'queryAppearanceBoms']);
  return new Proxy(Object.create(null), { get: (_, method) => unsupportedAppearanceReads.has(String(method))
    ? undefined : methods[String(method)] ?? (async () => { throw new Error(`Mock 已隔离：${String(method)} 未启用，不会调用真实服务。`); }) }) as PlannerApi;
}

export function bomMockPreviewSource(assetId: number): string | null {
  if (assetId > -401 || assetId < -416 || assetId === -409) return null;
  const diagram = Math.abs(assetId) % 2 === 0;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100"><rect x="20" y="12" width="120" height="76" rx="2" fill="#f1f5f9" stroke="#64748b"/><rect x="${diagram ? '90' : '40'}" y="30" width="30" height="22" fill="#dbeafe" stroke="#285f98"/><path d="M30 70h100" stroke="#94a3b8"/><text x="80" y="84" text-anchor="middle" font-size="10" fill="#334155">MOCK ONLY</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
