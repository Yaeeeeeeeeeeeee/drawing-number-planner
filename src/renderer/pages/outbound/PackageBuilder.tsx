import { useEffect, useMemo, useState } from 'react';
import type { CreatedOutboundPackageView, DictionaryItemView, MaterialBatchView, OutboundMaterialTypeView, OutboundPackageModeView,
  OutboundPackagePreviewView, PlannerApi, ProductView } from '../../data/client';
import { chooseOutboundDirectory, openOutboundPackageLocation } from '../../desktop-files';

const statusLabel = { normal: '正常', carried_forward: '沿用', needs_confirmation: '待确认', conflict: '冲突', missing: '缺失' } as const;

export function PackageBuilder({ api, onPackage }: { api: PlannerApi; onPackage(value: CreatedOutboundPackageView, product: ProductView): void }) {
  const [products, setProducts] = useState<ProductView[]>([]); const [batches, setBatches] = useState<MaterialBatchView[]>([]);
  const [brands, setBrands] = useState<DictionaryItemView[]>([]); const [brandId, setBrandId] = useState('');
  const [productId, setProductId] = useState(''); const [batchId, setBatchId] = useState('');
  const [materialType, setMaterialType] = useState<OutboundMaterialTypeView>('initial');
  const [mode, setMode] = useState<OutboundPackageModeView>('change_only');
  const [preview, setPreview] = useState<OutboundPackagePreviewView | null>(null); const [selected, setSelected] = useState<number[]>([]);
  const [created, setCreated] = useState<CreatedOutboundPackageView | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { void Promise.all([api.listProducts({ status: 'active' }), api.listDictionaries('brand', false)]).then(([nextProducts, nextBrands]) => { setProducts(nextProducts); setBrands(nextBrands); if (nextBrands.length === 1) setBrandId(String(nextBrands[0].id)); }).catch((e) => setError(e instanceof Error ? e.message : '产品加载失败')); }, [api]);
  useEffect(() => { setBatchId(''); setPreview(null); if (!productId) { setBatches([]); return; }
    void api.listMaterialBatches({ productId: Number(productId) }).then((items) => setBatches(items.filter((item) => item.recognitionStatus === 'recognized' && item.isPresent))).catch((e) => setError(e instanceof Error ? e.message : '资料批次加载失败'));
  }, [api, productId]);
  const chosenProduct = products.find((item) => item.id === Number(productId));
  const visibleProducts = brandId ? products.filter((item) => item.brandId === Number(brandId)) : [];
  const blockers = preview?.items.some((item) => !item.selectable) ?? false;
  const selectableIds = useMemo(() => preview?.items.filter((item) => item.selectable && item.pdfFileId).map((item) => item.pdfFileId!) ?? [], [preview]);
  const request = () => ({ productId: Number(productId), selectedMaterialBatchId: Number(batchId), materialType, packageMode: mode });
  const loadPreview = async () => { setBusy(true); setError(''); setCreated(null); try { const value = await api.previewOutboundPackage(request()); setPreview(value); setSelected(value.items.filter((i) => i.selectable && i.pdfFileId).map((i) => i.pdfFileId!)); } catch (e) { setError(e instanceof Error ? e.message : '外发预览失败'); } finally { setBusy(false); } };
  const generate = async () => {
    if (!preview) return; setError('');
    if (!window.plannerDesktop?.chooseOutboundDirectory) { setError('生成 ZIP 仅支持 Windows 桌面版，请在桌面版选择输出目录。'); return; }
    setBusy(true);
    try { const picked = await chooseOutboundDirectory(); if (!picked.ok) { if (!picked.cancelled) setError(picked.error?.message ?? '选择输出目录失败'); return; }
      const value = await api.createOutboundPackage({ ...request(), previewToken: preview.previewToken, selectedPdfFileIds: selected }); setCreated(value); if (chosenProduct) onPackage(value, chosenProduct);
    } catch (e) { setError(e instanceof Error ? e.message : '生成压缩包失败'); } finally { setBusy(false); }
  };
  return <section className="outbound-panel package-builder">
    <div className="choice-row" role="group" aria-label="打包模式"><label><input type="radio" aria-label="本次变更资料" checked={mode === 'change_only'} onChange={() => { setMode('change_only'); setPreview(null); }} />本次变更资料</label><label><input type="radio" aria-label="当前完整包材资料" checked={mode === 'current_complete'} onChange={() => { setMode('current_complete'); setPreview(null); }} />当前完整包材资料</label></div>
    <div className="choice-row" role="group" aria-label="资料类型"><label><input type="radio" aria-label="首批资料" checked={materialType === 'initial'} onChange={() => { setMaterialType('initial'); setPreview(null); }} />首批资料</label><label><input type="radio" aria-label="更新资料" checked={materialType === 'update'} onChange={() => { setMaterialType('update'); setPreview(null); }} />更新资料</label></div>
    <div className="outbound-selection-grid"><label><span>品牌</span><select aria-label="品牌" value={brandId} onChange={(e) => { setBrandId(e.target.value); setProductId(''); setBatchId(''); setPreview(null); }}><option value="">请选择</option>{brands.map((b) => <option value={b.id} key={b.id}>{b.name}</option>)}</select></label><label><span>产品</span><select aria-label="产品" value={productId} disabled={!brandId} onChange={(e) => setProductId(e.target.value)}><option value="">请选择</option>{visibleProducts.map((p) => <option key={p.id} value={p.id}>{p.sku ?? 'SKU待补录'} · {p.model} · {p.productCategory}</option>)}</select></label><label><span>资料批次</span><select aria-label="资料批次" value={batchId} disabled={!productId} onChange={(e) => { setBatchId(e.target.value); setPreview(null); }}><option value="">请选择</option>{batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label><button className="primary-button" type="button" disabled={busy || !productId || !batchId} onClick={() => void loadPreview()}>预览文件</button></div>
    {chosenProduct && <p className="info-banner">SKU：{chosenProduct.sku ?? '待补录'}　型号：{chosenProduct.model}　产品类别：{chosenProduct.productCategory}</p>}
    {error && <p className="error-banner">{error}</p>}
    {preview && <><div className="outbound-preview-head"><strong>{preview.packageName}</strong><div><button className="text-button" type="button" onClick={() => setSelected(selectableIds)}>全选可用文件</button><button className="text-button" type="button" onClick={() => setSelected([])}>取消全选</button></div></div>
      <div className="outbound-file-list" role="table" aria-label="外发文件预览">{preview.items.map((item, index) => <div className={`outbound-file-row ${!item.selectable ? 'blocked' : ''}`} role="row" key={`${item.slotKey}-${index}`}><input type="checkbox" aria-label={`选择 ${item.projectItemName}`} disabled={!item.selectable || !item.pdfFileId} checked={item.pdfFileId ? selected.includes(item.pdfFileId) : false} onChange={() => item.pdfFileId && setSelected((v) => v.includes(item.pdfFileId!) ? v.filter((id) => id !== item.pdfFileId) : [...v, item.pdfFileId!])} /><strong>{item.projectItemName}</strong><span className="mono">{item.fullCode ?? '图号待确认'}</span><span>{item.sourceBatchName}</span><span className="file-primary">{item.fileName ?? '转曲后文件已缺失'}</span><span className={`outbound-status ${item.status}`}>{statusLabel[item.status]}</span></div>)}</div>
      {blockers && <p className="error-banner">存在缺失、冲突或待确认资料，处理后才能打包。</p>}
      <button className="primary-button" type="button" disabled={busy || blockers || selected.length === 0} onClick={() => void generate()}>生成压缩包</button></>}
    {created && <section className="success-banner outbound-result"><strong>压缩包已生成</strong><span>{created.packageName}.zip</span><span>保存位置：{created.zipRelativePath}</span><span>文件数量：{created.fileCount}</span><button className="text-button" type="button" onClick={async () => { const r = await openOutboundPackageLocation(created.id); if (!r.ok) setError(r.error?.message ?? '打开位置失败'); }}>打开位置</button></section>}
  </section>;
}
