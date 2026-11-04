import { useEffect, useState, type ReactNode } from 'react';
import type { MaterialBatchView, ProductView, DrawingNavigationBatchView } from '../data/client';
import { materialBatchLabel } from '../../core/files/material-batch-label';
import { FileText, Folder, Package, Link2, Link2Off, Trash2, ChevronDown, ChevronRight, Search } from 'lucide-react';
import './pdf-product-batch-navigation.css';

export type CatalogNavigationScope = { kind: 'all' | 'category' | 'product' | 'batch' | 'unassociated' | 'recycle'; category?: string; productId?: number; batchId?: number };
export interface CatalogNavigationCounts {
  total: number; categories: Array<{name: string; count: number}>; products: Array<{productId: number; count: number}>;
  batches: Array<{materialBatchId: number; productId: number | null; count: number}>; unassociated: number; recycle?: number;
}
export interface ProductCatalogNavigationProps {
  products: ProductView[]; batches: MaterialBatchView[]; counts: CatalogNavigationCounts | null;
  usageBatches?: DrawingNavigationBatchView[]; scope: CatalogNavigationScope; onSelect(scope: CatalogNavigationScope): void;
  mode: 'files' | 'drawings'; filters?: ReactNode; collapseControl?: ReactNode;
}
function NavigationIcon({kind, mode}:{kind:CatalogNavigationScope['kind']; mode: ProductCatalogNavigationProps['mode']}) {
  const Icon = kind === 'category' ? Folder : kind === 'product' ? Package : kind === 'unassociated' ? (mode === 'files' ? Link2 : Link2Off) : kind === 'recycle' ? Trash2 : FileText;
  return <Icon className="pdf-nav-icon" size={18} strokeWidth={1.8} aria-hidden="true"/>;
}
export function ProductCatalogNavigation({ products, batches, counts, scope, onSelect, filters, usageBatches = [], mode, collapseControl }: ProductCatalogNavigationProps) {
  const [keyword, setKeyword] = useState('');
  const [closedCategories, setClosedCategories] = useState<string[]>([]);
  const [openProducts, setOpenProducts] = useState<number[]>([]);
  useEffect(() => { if (scope.productId) setOpenProducts(current => current.includes(scope.productId!) ? current : [...current, scope.productId!]); }, [scope.productId, scope.batchId]);
  const query = keyword.trim().toLocaleLowerCase();
  const visible = products.filter(product => `${product.productCategory} ${product.sku ?? ''} ${product.model}`.toLocaleLowerCase().includes(query));
  const categories = [...new Set(visible.map(product => product.productCategory || '未分类'))];
  const orphanBatches = batches.filter(batch => !products.some(product => batch.productId === product.id || usageBatches.find(item => item.id === batch.id)?.usageProducts.some(item => item.productId === product.id) || counts?.batches.some(item => item.materialBatchId === batch.id && item.productId === product.id && item.count > 0)));

  const count = (value?: number) => <span className="pdf-nav-count" aria-label={value == null && !counts ? '数量暂不可用' : `${value ?? 0} 个${mode === 'files' ? '文件' : '图号'}`}>{value ?? (counts ? 0 : '—')}</span>;
  const select = (label: string, selected: boolean, next: CatalogNavigationScope, value?: number, title = label, extra?: ReactNode) => <button type="button" data-navigation-select aria-label={label} title={title} aria-current={selected ? 'page' : undefined} onClick={() => onSelect(next)}><NavigationIcon kind={next.kind} mode={mode}/><span className="pdf-nav-label">{title}</span>{extra}{count(value)}</button>;
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
            const title = `${product.sku ?? '待补录'} · ${product.model}`;
            const opened = Boolean(query) || openProducts.includes(product.id);
            return <div className="pdf-nav-product" key={product.id}><div className="pdf-nav-branch"><button type="button" className="pdf-nav-expand" aria-label={`${opened ? '收起' : '展开'}产品 ${title}`} aria-expanded={opened} onClick={() => setOpenProducts(current => current.includes(product.id) ? current.filter(id => id !== product.id) : [...current, product.id])}>{opened ? <ChevronDown size={18} strokeWidth={1.8}/> : <ChevronRight size={18} strokeWidth={1.8}/>}</button>{select(`产品 ${title}`, scope.kind === 'product' && scope.productId === product.id, { kind: 'product', productId: product.id }, counts?.products.find(item => item.productId === product.id)?.count, title)}</div>
              {opened && batches.filter(batch => batch.productId === product.id || usageBatches.find(item => item.id === batch.id)?.usageProducts.some(item => item.productId === product.id) || counts?.batches.some(item => item.materialBatchId === batch.id && item.productId === product.id && item.count > 0)).map(batch => {
                const state = usageBatches.find(item => item.id === batch.id)?.usageProducts.find(item => item.productId === product.id)?.state ?? (batch.recognitionStatus === 'pending' ? 'pending' : undefined);
                const label = state === 'current' ? '当前使用' : state === 'historical' ? '历史使用' : state === 'pending' ? '待确认' : '使用未确定';
                return <div className="pdf-nav-batch" key={batch.id}>{select(`批次 ${materialBatchLabel(batch.name)}`, scope.kind === 'batch' && scope.batchId === batch.id && scope.productId === product.id, { kind: 'batch', productId: product.id, batchId: batch.id }, counts?.batches.find(item => item.materialBatchId === batch.id && item.productId === product.id)?.count, materialBatchLabel(batch.name), <small className={`pdf-nav-state ${state}`}>{label}</small>)}</div>;
              })}</div>;
          })}
        </section>;
      })}
      {query && visible.length === 0 && <p className="pdf-nav-note">没有匹配的产品</p>}
      {orphanBatches.length > 0 && <details className="catalog-nav-orphans"><summary>未关联产品批次（{orphanBatches.length}）</summary>
        {orphanBatches.map(batch => <div className="pdf-nav-batch" key={batch.id}>{select(`批次 ${materialBatchLabel(batch.name)}`, scope.kind === 'batch' && scope.batchId === batch.id && scope.productId == null, {kind:'batch',batchId:batch.id}, counts?.batches.find(item => item.materialBatchId === batch.id && item.productId == null)?.count, materialBatchLabel(batch.name), <small className={`pdf-nav-state ${batch.recognitionStatus === 'pending' ? 'pending' : ''}`}>{batch.recognitionStatus === 'pending' ? '待确认' : '使用未确定'}</small>)}</div>)}
      </details>}
      <div className="catalog-nav-special">{select(mode === 'files' ? '待关联产品' : '未关联图号', scope.kind === 'unassociated', { kind: 'unassociated' }, counts?.unassociated)}
        {mode === 'drawings' && select('回收站', scope.kind === 'recycle', {kind:'recycle'}, counts?.recycle)}
        {!counts && <small className="pdf-nav-note">数量暂不可用</small>}
      </div>
      {filters && <details className="pdf-nav-filters"><summary>{mode === 'files' ? '文件筛选' : '图号筛选'}</summary>{filters}</details>}
    </div>
  </nav>;
}
