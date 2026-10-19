import { useEffect, useState, type ReactNode } from 'react';
import type { MaterialBatchView, ProductView, PdfNavigationCounts, DrawingNavigationBatchView } from '../data/client';
import { materialBatchLabel } from '../../core/files/material-batch-label';
import './pdf-product-batch-navigation.css';

export type PdfNavigationScope = { kind: 'all' | 'category' | 'product' | 'batch' | 'unassociated'; category?: string; productId?: number; batchId?: number };
export type { PdfNavigationCounts } from '../data/client';
function NavigationIcon({kind}:{kind:PdfNavigationScope['kind']}) {
  const path=kind==='category'?'M2 5h6l2 2h12v13H2z':kind==='product'?'M12 2l9 5v10l-9 5-9-5V7z M3 7l9 5 9-5 M12 12v10':kind==='unassociated'?'M10 14l4-4 M8 16l-1 1a4 4 0 01-6-6l4-4a4 4 0 016 0 M16 8l1-1a4 4 0 016 6l-4 4a4 4 0 01-6 0':'M5 2h9l5 5v15H5z M14 2v6h5 M8 12h8 M8 16h8';
  return <svg className="pdf-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true"><path d={path}/></svg>;
}
export function PdfProductBatchNavigation({ products, batches, counts, scope, onSelect, filters, usageBatches = [] }: {
  products: ProductView[]; batches: MaterialBatchView[]; counts: PdfNavigationCounts | null;
  usageBatches?: DrawingNavigationBatchView[]; scope: PdfNavigationScope; onSelect(scope: PdfNavigationScope): void; filters: ReactNode;
}) {
  const [keyword, setKeyword] = useState('');
  const [closedCategories, setClosedCategories] = useState<string[]>([]);
  const [openProducts, setOpenProducts] = useState<number[]>([]);
  useEffect(() => { if (scope.productId) setOpenProducts(current => current.includes(scope.productId!) ? current : [...current, scope.productId!]); }, [scope.productId, scope.batchId]);
  const query = keyword.trim().toLocaleLowerCase();
  const visible = products.filter(product => `${product.productCategory} ${product.sku ?? ''} ${product.model}`.toLocaleLowerCase().includes(query));
  const categories = [...new Set(visible.map(product => product.productCategory || '未分类'))];
  const count = (value?: number) => <span className="pdf-nav-count" aria-label={value == null && !counts ? '数量暂不可用' : `${value ?? 0} 个文件`}>{value ?? (counts ? 0 : '—')}</span>;
  const select = (label: string, selected: boolean, next: PdfNavigationScope, value?: number, title = label, extra?: ReactNode) => <button type="button" data-navigation-select aria-label={label} title={title} aria-current={selected ? 'page' : undefined} onClick={() => onSelect(next)}><NavigationIcon kind={next.kind}/><span className="pdf-nav-label">{title}</span>{extra}{count(value)}</button>;
  return <nav className="pdf-product-navigation" aria-label="资料导航">
    <header className="pdf-nav-header"><h2>产品与批次</h2><input aria-label="搜索产品 SKU 或型号" placeholder="搜索 SKU / 型号" value={keyword} onChange={event => setKeyword(event.target.value)} /></header>
    <div className="pdf-nav-scroll">
      {select('全部文件', scope.kind === 'all', { kind: 'all' }, counts?.total)}
      <small className="pdf-nav-note">按当前文件筛选统计 · 包含待关联产品及未归批次文件</small>
      {categories.map(category => {
        const expanded = Boolean(query) || !closedCategories.includes(category);
        return <section className="pdf-nav-category" key={category}>
          <div className="pdf-nav-branch"><button type="button" className="pdf-nav-expand" aria-label={`${expanded ? '收起' : '展开'}分类 ${category}`} aria-expanded={expanded} onClick={() => setClosedCategories(current => current.includes(category) ? current.filter(value => value !== category) : [...current, category])}>{expanded ? '▾' : '▸'}</button>{select(`分类 ${category}`, scope.kind === 'category' && scope.category === category, { kind: 'category', category }, counts?.categories.find(item => item.name === category)?.count, category)}</div>
          {expanded && visible.filter(product => (product.productCategory || '未分类') === category).map(product => {
            const title = `${product.sku ?? '待补录'} · ${product.model}`;
            const opened = Boolean(query) || openProducts.includes(product.id);
            return <div className="pdf-nav-product" key={product.id}><div className="pdf-nav-branch"><button type="button" className="pdf-nav-expand" aria-label={`${opened ? '收起' : '展开'}产品 ${title}`} aria-expanded={opened} onClick={() => setOpenProducts(current => current.includes(product.id) ? current.filter(id => id !== product.id) : [...current, product.id])}>{opened ? '▾' : '▸'}</button>{select(`产品 ${title}`, scope.kind === 'product' && scope.productId === product.id, { kind: 'product', productId: product.id }, counts?.products.find(item => item.productId === product.id)?.count, title)}</div>
              {opened && batches.filter(batch => batch.productId === product.id || counts?.batches.some(item => item.materialBatchId === batch.id && item.productId === product.id && item.count > 0)).map(batch => {
                const state = usageBatches.find(item => item.id === batch.id)?.usageProducts.find(item => item.productId === product.id)?.state ?? (batch.recognitionStatus === 'pending' ? 'pending' : undefined);
                const label = state === 'current' ? '当前使用' : state === 'historical' ? '历史使用' : state === 'pending' ? '待确认' : '使用未确定';
                return <div className="pdf-nav-batch" key={batch.id}>{select(`批次 ${materialBatchLabel(batch.name)}`, scope.kind === 'batch' && scope.batchId === batch.id && scope.productId === product.id, { kind: 'batch', productId: product.id, batchId: batch.id }, counts?.batches.find(item => item.materialBatchId === batch.id && item.productId === product.id)?.count, materialBatchLabel(batch.name), <small className={`pdf-nav-state ${state}`}>{label}</small>)}</div>;
              })}</div>;
          })}
        </section>;
      })}
      {query && visible.length === 0 && <p className="pdf-nav-note">没有匹配的产品</p>}
      <details className="pdf-nav-filters" open><summary>文件筛选</summary>{filters}</details>
    </div>
    <footer className="pdf-nav-footer">{select('待关联产品', scope.kind === 'unassociated', { kind: 'unassociated' }, counts?.unassociatedProducts)}{!counts && <small className="pdf-nav-note">数量暂不可用</small>}</footer>
  </nav>;
}
