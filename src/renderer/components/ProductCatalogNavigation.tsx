import { useEffect, useState, type ReactNode } from 'react';
import type { MaterialBatchView, ProductView, DrawingNavigationBatchView, AppearanceVersionView } from '../data/client';
import { materialBatchLabel } from '../../core/files/material-batch-label';
import { FileText, Folder, Package, Link2, Link2Off, Trash2, ChevronDown, ChevronRight, Search, Pencil } from 'lucide-react';
import './pdf-product-batch-navigation.css';

export type CatalogNavigationScope = { kind: 'all' | 'category' | 'product' | 'appearance' | 'batch' | 'unassociated' | 'recycle'; category?: string; productId?: number; batchId?: number; appearanceVersionId?: number };
export interface CatalogNavigationCounts {
  appearances?: Array<{appearanceVersionId:number;count:number}>;
  appearanceBatches?: Array<{appearanceVersionId:number;materialBatchId:number;productId:number|null;count:number}>;
  total: number; categories: Array<{name: string; count: number}>; products: Array<{productId: number; count: number}>;
  batches: Array<{materialBatchId: number; productId: number | null; count: number}>; unassociated: number; recycle?: number;
}
export interface ProductCatalogNavigationProps {
  appearances?: AppearanceVersionView[]; onRenameBatch?(batch: MaterialBatchView): void;
  products: ProductView[]; batches: MaterialBatchView[]; counts: CatalogNavigationCounts | null;
  usageBatches?: DrawingNavigationBatchView[]; scope: CatalogNavigationScope; onSelect(scope: CatalogNavigationScope): void;
  mode: 'files' | 'drawings'; filters?: ReactNode; collapseControl?: ReactNode;
}
function NavigationIcon({kind, mode}:{kind:CatalogNavigationScope['kind']; mode: ProductCatalogNavigationProps['mode']}) {
  const Icon = kind === 'category' ? Folder : kind === 'product' ? Package : kind === 'unassociated' ? (mode === 'files' ? Link2 : Link2Off) : kind === 'recycle' ? Trash2 : FileText;
  return <Icon className="pdf-nav-icon" size={18} strokeWidth={1.8} aria-hidden="true"/>;
}
export function ProductCatalogNavigation({ products, batches, counts, scope, onSelect, filters, usageBatches = [], mode, collapseControl, appearances = [], onRenameBatch }: ProductCatalogNavigationProps) {
  const [keyword, setKeyword] = useState('');
  const [closedCategories, setClosedCategories] = useState<string[]>([]);
  const [openProducts, setOpenProducts] = useState<number[]>([]);
  const [openAppearances,setOpenAppearances]=useState<number[]>([]);
  useEffect(()=>{if(scope.appearanceVersionId)setOpenAppearances(current=>current.includes(scope.appearanceVersionId!)?current:[...current,scope.appearanceVersionId!]);},[scope.appearanceVersionId]);
  useEffect(() => { if (scope.productId) setOpenProducts(current => current.includes(scope.productId!) ? current : [...current, scope.productId!]); }, [scope.productId, scope.batchId]);
  const query = keyword.trim().toLocaleLowerCase();
  const visible = products.filter(product => `${product.productCategory} ${product.sku ?? ''} ${product.model}`.toLocaleLowerCase().includes(query));
  const categories = [...new Set(visible.map(product => product.productCategory || '未分类'))];
  const orphanBatches = batches.filter(batch => !products.some(product => batch.productId === product.id || usageBatches.find(item => item.id === batch.id)?.usageProducts.some(item => item.productId === product.id) || counts?.batches.some(item => item.materialBatchId === batch.id && item.productId === product.id && item.count > 0)));

  const count = (value?: number) => <span className="pdf-nav-count" aria-label={value == null && !counts ? '数量暂不可用' : `${value ?? 0} 个${mode === 'files' ? '文件' : '图号'}`}>{value ?? (counts ? 0 : '—')}</span>;
  const select = (label: string, selected: boolean, next: CatalogNavigationScope, value?: number, title = label, extra?: ReactNode) => <button type="button" data-navigation-select aria-label={label} title={title} aria-current={selected ? 'page' : undefined} onClick={() => onSelect(next)}><NavigationIcon kind={next.kind} mode={mode}/><span className="pdf-nav-label">{title}</span>{extra}{count(value)}</button>;
  const renderBatch = (batch:MaterialBatchView, productId:number, appearanceVersionId?:number) => {
    const state=usageBatches.find(item=>item.id===batch.id)?.usageProducts.find(item=>item.productId===productId)?.state??(batch.recognitionStatus==='pending'?'pending':undefined);
    const label=state==='current'?'当前使用':state==='historical'?'历史使用':state==='pending'?'待确认':'使用未确定';
    const title=batch.displayName||materialBatchLabel(batch.name);
    const version=appearances.find(item=>item.id===appearanceVersionId);
    const amount=appearanceVersionId===undefined?counts?.batches.find(item=>item.materialBatchId===batch.id&&item.productId===productId)?.count:counts?.appearanceBatches?.find(item=>item.materialBatchId===batch.id&&item.productId===productId&&item.appearanceVersionId===appearanceVersionId)?.count;
    return <div className="pdf-nav-batch" key={batch.id}>{select(`${version?`外观 ${version.label} `:''}批次 ${title}`,scope.kind==='batch'&&scope.batchId===batch.id&&scope.productId===productId&&scope.appearanceVersionId===appearanceVersionId,{kind:'batch',productId,batchId:batch.id,...(appearanceVersionId===undefined?{}:{appearanceVersionId})},amount,title,<small className={`pdf-nav-state ${state}`}>{label}</small>)}{onRenameBatch&&<button type="button" className="pdf-nav-expand" title={`重命名资料批次 · ${batch.relativePath}`} aria-label={`重命名批次 ${title}`} onClick={()=>onRenameBatch(batch)}><Pencil size={14} strokeWidth={1.8}/></button>}</div>;
  };
  return <nav className="pdf-product-navigation product-catalog-navigation" aria-label={mode === 'files' ? '资料导航' : '图号导航'}>
    <header className="pdf-nav-header"><div className="catalog-nav-heading"><h2>产品与批次</h2>{collapseControl}</div><label className="catalog-nav-search"><Search size={18} strokeWidth={1.8} aria-hidden="true"/><input aria-label="搜索产品 SKU 或型号" placeholder="搜索 SKU / 型号" value={keyword} onChange={event => setKeyword(event.target.value)} /></label></header>
    <div className="pdf-nav-scroll">
      {select(mode === 'files' ? '全部文件' : '全部图号', scope.kind === 'all', { kind: 'all' }, counts?.total)}
      <small className="pdf-nav-note">{mode === 'files' ? '按当前文件筛选统计 · 包含待关联产品及未归批次文件' : '按当前图号筛选统计'}</small>
      {categories.map(category => {
        const expanded = Boolean(query) || !closedCategories.includes(category);
        return <section className="pdf-nav-category" key={category}>
          <div className="pdf-nav-branch"><button type="button" className="pdf-nav-expand" aria-label={`${expanded ? '收起' : '展开'}分类 ${category}`} aria-expanded={expanded} onClick={() => setClosedCategories(current => current.includes(category) ? current.filter(value => value !== category) : [...current, category])}>{expanded ? <ChevronDown size={18} strokeWidth={1.8}/> : <ChevronRight size={18} strokeWidth={1.8}/>}</button>{select(`分类 ${category}`, scope.kind === 'category' && scope.category === category, { kind: 'category', category }, counts?.categories.find(item => item.name === category)?.count, category)}</div>
          {expanded && visible.filter(product => (product.productCategory || '未分类') === category).map(product => {
            const title = mode === 'drawings' ? product.model : `${product.sku ?? '待补录'} · ${product.model}`;
            const opened = Boolean(query) || openProducts.includes(product.id);
            return <div className="pdf-nav-product" key={product.id}><div className="pdf-nav-branch"><button type="button" className="pdf-nav-expand" aria-label={`${opened ? '收起' : '展开'}产品 ${title}`} aria-expanded={opened} onClick={() => setOpenProducts(current => current.includes(product.id) ? current.filter(id => id !== product.id) : [...current, product.id])}>{opened ? <ChevronDown size={18} strokeWidth={1.8}/> : <ChevronRight size={18} strokeWidth={1.8}/>}</button>{select(`产品 ${title}`, scope.kind === 'product' && scope.productId === product.id, { kind: 'product', productId: product.id }, counts?.products.find(item => item.productId === product.id)?.count, title)}</div>
              {opened && appearances.filter(version=>version.productId===product.id).map(version=>{
                const mappings=mode==='files'?counts?.appearanceBatches?.filter(item=>item.appearanceVersionId===version.id&&item.productId===product.id)??[]:[];
                const nested=Boolean(query)||openAppearances.includes(version.id);
                return <div className="catalog-appearance-node" key={version.id}><div className="pdf-nav-branch pdf-nav-appearance">
                  {mappings.length>0&&<button type="button" className="pdf-nav-expand" aria-label={`${nested?'收起':'展开'}外观批次 ${version.label}`} aria-expanded={nested} onClick={()=>setOpenAppearances(current=>current.includes(version.id)?current.filter(id=>id!==version.id):[...current,version.id])}>{nested?<ChevronDown size={18} strokeWidth={1.8}/>:<ChevronRight size={18} strokeWidth={1.8}/>}</button>}
                  {select(`外观 ${version.label}`,scope.kind==='appearance'&&scope.appearanceVersionId===version.id,{kind:'appearance',productId:product.id,appearanceVersionId:version.id},counts?.appearances?.find(item=>item.appearanceVersionId===version.id)?.count,version.label,<small className={`pdf-nav-state ${version.status==='current'?'current':''}`}>{version.status==='current'?'当前使用':version.status==='historical'?'历史版本':'草稿'}</small>)}
                </div>{nested&&mode==='files'&&<div className="catalog-appearance-batches">{batches.filter(batch=>mappings.some(item=>item.materialBatchId===batch.id)).map(batch=>renderBatch(batch,product.id,version.id))}</div>}</div>;
              })}
              {opened&&mode==='files'&&batches.filter(batch=>(batch.productId===product.id||usageBatches.find(item=>item.id===batch.id)?.usageProducts.some(item=>item.productId===product.id)||counts?.batches.some(item=>item.materialBatchId===batch.id&&item.productId===product.id&&item.count>0))&&!counts?.appearanceBatches?.some(item=>item.materialBatchId===batch.id&&item.productId===product.id)).map(batch=>renderBatch(batch,product.id))}</div>;
          })}
        </section>;
      })}
      {query && visible.length === 0 && <p className="pdf-nav-note">没有匹配的产品</p>}
      {mode === 'files' && orphanBatches.length > 0 && <details className="catalog-nav-orphans"><summary>未关联产品批次（{orphanBatches.length}）</summary>
        {orphanBatches.map(batch => <div className="pdf-nav-batch" key={batch.id}>{onRenameBatch && <button type="button" className="pdf-nav-expand" title="重命名资料批次" aria-label={`重命名批次 ${batch.displayName || batch.name}`} onClick={() => onRenameBatch(batch)}><Pencil size={14} strokeWidth={1.8}/></button>}{select(`批次 ${(batch.displayName || materialBatchLabel(batch.name))}`, scope.kind === 'batch' && scope.batchId === batch.id && scope.productId == null, {kind:'batch',batchId:batch.id}, counts?.batches.find(item => item.materialBatchId === batch.id && item.productId == null)?.count, (batch.displayName || materialBatchLabel(batch.name)), <small className={`pdf-nav-state ${batch.recognitionStatus === 'pending' ? 'pending' : ''}`}>{batch.recognitionStatus === 'pending' ? '待确认' : '使用未确定'}</small>)}</div>)}
      </details>}
      <div className="catalog-nav-special">{select(mode === 'files' ? '待关联产品' : '未关联图号', scope.kind === 'unassociated', { kind: 'unassociated' }, counts?.unassociated)}
        {mode === 'drawings' && select('回收站', scope.kind === 'recycle', {kind:'recycle'}, counts?.recycle)}
        {!counts && <small className="pdf-nav-note">数量暂不可用</small>}
      </div>
      {filters && <details className="pdf-nav-filters"><summary>{mode === 'files' ? '文件筛选' : '图号筛选'}</summary>{filters}</details>}
    </div>
  </nav>;
}
