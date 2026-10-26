import { createPortal } from 'react-dom';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { MaterialBatchView, ProductView, DrawingNavigationBatchView, AppearanceVersionView } from '../data/client';
import { materialBatchLabel } from '../../core/files/material-batch-label';
import { FileText, Folder, Package, Link2, Link2Off, Trash2, ChevronDown, ChevronRight, Search, Pencil } from 'lucide-react';
import './pdf-product-batch-navigation.css';

export type CatalogNavigationScope = { kind: 'all' | 'category' | 'product' | 'main-category' | 'appearance' | 'source' | 'batch' | 'unassociated' | 'recycle'; category?: string; productId?: number; batchId?: number; mainCategoryId?:number;appearanceVersionId?: number };
export interface CatalogNavigationCounts {
  sources?: Array<{productId:number;count:number}>;
  mainCategories?: Array<{productId:number;mainCategoryId:number;name:string;code:string;count:number}>;
  batchProducts?: Array<{materialBatchId:number;productId:number|null}>;
  appearances?: Array<{appearanceVersionId:number;count:number}>;
  appearanceBatches?: Array<{appearanceVersionId:number;materialBatchId:number;productId:number|null;count:number}>;
  total: number; categories: Array<{name: string; count: number}>; products: Array<{productId: number; count: number}>;
  batches: Array<{materialBatchId: number; productId: number | null; count: number}>; unassociated: number; recycle?: number;
}
export interface ProductCatalogNavigationProps {
  mainCategories?: NonNullable<CatalogNavigationCounts['mainCategories']>;
  appearances?: AppearanceVersionView[]; onRenameBatch?(batch: MaterialBatchView): void; onDeleteBatch?(batch: MaterialBatchView): void;
  products: ProductView[]; batches: MaterialBatchView[]; counts: CatalogNavigationCounts | null;
  usageBatches?: DrawingNavigationBatchView[]; scope: CatalogNavigationScope; onSelect(scope: CatalogNavigationScope): void;
  mode: 'files' | 'drawings'; filters?: ReactNode; collapseControl?: ReactNode;
}
function NavigationIcon({kind, mode}:{kind:CatalogNavigationScope['kind']; mode: ProductCatalogNavigationProps['mode']}) {
  const Icon = kind === 'category' ? Folder : kind === 'product' ? Package : kind === 'unassociated' ? (mode === 'files' ? Link2 : Link2Off) : kind === 'recycle' ? Trash2 : FileText;
  return <Icon className="pdf-nav-icon" size={18} strokeWidth={1.8} aria-hidden="true"/>;
}
export function ProductCatalogNavigation({ products, batches, counts, scope, onSelect, filters, usageBatches = [], mode, collapseControl, onRenameBatch, onDeleteBatch,mainCategories=[] }: ProductCatalogNavigationProps) {
  const [batchMenu,setBatchMenu] = useState<{batch:MaterialBatchView;x:number;y:number;trigger:HTMLElement}|null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!batchMenu || !menuRef.current) return;
    const rect=menuRef.current.getBoundingClientRect();
    const x=Math.max(8,Math.min(batchMenu.x,window.innerWidth-rect.width-8));
    const y=Math.max(8,Math.min(batchMenu.y,window.innerHeight-rect.height-8));
    if (x!==batchMenu.x || y!==batchMenu.y) setBatchMenu(current=>current?{...current,x,y}:null);
    menuRef.current.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  },[batchMenu]);
  useEffect(() => {
    if (!batchMenu) return;
    const outside=(event:PointerEvent|MouseEvent)=>{if(!menuRef.current?.contains(event.target as Node))setBatchMenu(null);};
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();batchMenu.trigger.focus();setBatchMenu(null);}};
    const close=()=>setBatchMenu(null);
    document.addEventListener('pointerdown',outside);document.addEventListener('click',outside);document.addEventListener('keydown',key);
    window.addEventListener('resize',close);
    return ()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('click',outside);document.removeEventListener('keydown',key);window.removeEventListener('resize',close);};
  },[batchMenu]);
  const [keyword, setKeyword] = useState('');
  const [closedCategories, setClosedCategories] = useState<string[]>([]);
  const [openProducts, setOpenProducts] = useState<number[]>([]);
  useEffect(() => { if (scope.productId) setOpenProducts(current => current.includes(scope.productId!) ? current : [...current, scope.productId!]); }, [scope.productId, scope.batchId]);
  const query = keyword.trim().toLocaleLowerCase();
  const visible = products.filter(product => `${product.productCategory} ${product.sku ?? ''} ${product.model}`.toLocaleLowerCase().includes(query));
  const categories = [...new Set(visible.map(product => product.productCategory || '未分类'))];
  const belongsToProduct=(batch:MaterialBatchView,productId:number)=>{
    // Filtering changes counts, never membership. PDF provides a separate unfiltered map.
    if(counts?.batchProducts)return counts.batchProducts.some(item=>item.materialBatchId===batch.id&&item.productId===productId);
    const usage=usageBatches.find(item=>item.id===batch.id);
    if(mode==='drawings'&&usage)return usage.usageProducts.some(item=>item.productId===productId);
    return batch.productId===productId || Boolean(counts?.batches.some(item=>item.materialBatchId===batch.id&&item.productId===productId&&item.count>0));
  };
  const orphanBatches=batches.filter(batch=>!products.some(product=>belongsToProduct(batch,product.id)));

  const count = (value?: number) => <span className="pdf-nav-count" aria-label={value == null && !counts ? '数量暂不可用' : `${value ?? 0} 个${mode === 'files' ? '文件' : '图号'}`}>{value ?? (counts ? 0 : '—')}</span>;
  const select = (label: string, selected: boolean, next: CatalogNavigationScope, value?: number, title = label, extra?: ReactNode) => <button type="button" data-navigation-select aria-label={label} title={title} aria-current={selected ? 'page' : undefined} onClick={() => onSelect(next)}><NavigationIcon kind={next.kind} mode={mode}/><span className="pdf-nav-label">{title}</span>{extra}{count(value)}</button>;
  const renderBatch = (batch:MaterialBatchView, productId?:number) => {
    const state=batch.currentState;
    const title=batch.displayName||materialBatchLabel(batch.name);
    const amount=counts?.batches.find(item=>item.materialBatchId===batch.id&&(item.productId??undefined)===productId)?.count;
    const badge=state==='current'||state==='historical'?<small className={`pdf-nav-state ${state}`}>{state==='current'?'当前批次':'历史批次'}</small>:undefined;
    return <div className="pdf-nav-batch" key={batch.id} onContextMenu={mode==='files'&&(onRenameBatch||onDeleteBatch)?event=>{
      event.preventDefault();event.stopPropagation();
      setBatchMenu({batch,x:event.clientX,y:event.clientY,trigger:event.currentTarget.querySelector('button')!});
    }:undefined}>{select(`批次 ${title}`,scope.kind==='batch'&&scope.batchId===batch.id&&scope.productId===productId,{kind:'batch',...(productId?{productId}:{}),batchId:batch.id},amount,title,badge)}</div>;
  };
  return <nav className="pdf-product-navigation product-catalog-navigation" aria-label={mode === 'files' ? '资料导航' : '图号导航'}>
    <header className="pdf-nav-header"><div className="catalog-nav-heading"><h2>产品与批次</h2>{collapseControl}</div><label className="catalog-nav-search"><Search size={18} strokeWidth={1.8} aria-hidden="true"/><input aria-label="搜索产品 SKU 或型号" placeholder="搜索 SKU / 型号 / 产品名称" value={keyword} onChange={event => setKeyword(event.target.value)} /></label></header>
    <div className="pdf-nav-scroll">
      {select(mode === 'files' ? '全部文件' : '全部图号', scope.kind === 'all', { kind: 'all' }, counts?.total)}
      {categories.map(category => {
        const expanded = Boolean(query) || !closedCategories.includes(category);
        return <section className="pdf-nav-category" key={category}>
          <div className="pdf-nav-branch"><button type="button" className="pdf-nav-expand" aria-label={`${expanded ? '收起' : '展开'}分类 ${category}`} aria-expanded={expanded} onClick={() => setClosedCategories(current => current.includes(category) ? current.filter(value => value !== category) : [...current, category])}>{expanded ? <ChevronDown size={18} strokeWidth={1.8}/> : <ChevronRight size={18} strokeWidth={1.8}/>}</button>{select(`分类 ${category}`, scope.kind === 'category' && scope.category === category, { kind: 'category', category }, counts?.categories.find(item => item.name === category)?.count, category)}</div>
          {expanded && visible.filter(product => (product.productCategory || '未分类') === category).map(product => {
            const title = mode === 'drawings' ? product.model : `${product.sku ?? '待补录'} · ${product.model}`;
            const opened = Boolean(query) || openProducts.includes(product.id);
            return <div className="pdf-nav-product" data-product-id={product.id} key={product.id}><div className="pdf-nav-branch"><button type="button" className="pdf-nav-expand" aria-label={`${opened ? '收起' : '展开'}产品 ${title}`} aria-expanded={opened} onClick={() => setOpenProducts(current => current.includes(product.id) ? current.filter(id => id !== product.id) : [...current, product.id])}>{opened ? <ChevronDown size={18} strokeWidth={1.8}/> : <ChevronRight size={18} strokeWidth={1.8}/>}</button>{select(`产品 ${title}`, scope.kind === 'product' && scope.productId === product.id, { kind: 'product', productId: product.id }, counts?.products.find(item => item.productId === product.id)?.count, title)}</div>
              {opened&&mode==='files'&&<div className="pdf-nav-batch">{select('未转曲源文件',scope.kind==='source'&&scope.productId===product.id,{kind:'source',productId:product.id},counts?.sources?.find(item=>item.productId===product.id)?.count ?? 0,'未转曲源文件')}</div>}
              {opened&&(mode==='drawings'?mainCategories.filter(item=>item.productId===product.id&&item.count>0).map(item=><div className="pdf-nav-batch" key={item.mainCategoryId}>{select(`主类别 ${item.name}`,scope.kind==='main-category'&&scope.productId===product.id&&scope.mainCategoryId===item.mainCategoryId,{kind:'main-category',productId:product.id,mainCategoryId:item.mainCategoryId},counts?.mainCategories?.find(value=>value.productId===product.id&&value.mainCategoryId===item.mainCategoryId)?.count,item.name)}</div>):batches.filter(batch=>belongsToProduct(batch,product.id)).map(batch=>renderBatch(batch,product.id)))}</div>;
          })}
        </section>;
      })}
      {query && visible.length === 0 && <p className="pdf-nav-note">没有匹配的产品</p>}
      {mode === 'files' && orphanBatches.length > 0 && <details className="catalog-nav-orphans"><summary>未关联产品批次（{orphanBatches.length}）</summary>
        {orphanBatches.map(batch=>renderBatch(batch))}
      </details>}
      <div className="catalog-nav-special">{select(mode === 'files' ? '待关联产品' : '未关联图号', scope.kind === 'unassociated', { kind: 'unassociated' }, counts?.unassociated)}
        {mode === 'drawings' && select('回收站', scope.kind === 'recycle', {kind:'recycle'}, counts?.recycle)}
        {!counts && <small className="pdf-nav-note">数量暂不可用</small>}
      </div>
      {filters && <details className="pdf-nav-filters"><summary>{mode === 'files' ? '文件筛选' : '图号筛选'}</summary>{filters}</details>}
    </div>
    {batchMenu && createPortal(<div ref={menuRef} role="menu" aria-label="批次操作" className="pdf-batch-context-menu" style={{left:batchMenu.x,top:batchMenu.y}}
      onContextMenu={event=>event.preventDefault()} onKeyDown={event=>{
        if(event.key!=='ArrowDown'&&event.key!=='ArrowUp')return;
        event.preventDefault();const buttons=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        const index=buttons.indexOf(document.activeElement as HTMLButtonElement);buttons[(index+(event.key==='ArrowDown'?1:buttons.length-1))%buttons.length]?.focus();
      }}>
      <button type="button" role="menuitem" disabled={!onRenameBatch} onClick={()=>{const batch=batchMenu.batch;setBatchMenu(null);onRenameBatch?.(batch);}}><Pencil size={15} aria-hidden="true"/>重命名批次</button>
      <div role="separator"/>
      <button type="button" role="menuitem" className="pdf-batch-delete" disabled={!onDeleteBatch} onClick={()=>{const batch=batchMenu.batch;setBatchMenu(null);onDeleteBatch?.(batch);}}><Trash2 size={15} aria-hidden="true"/>删除批次</button>
    </div>,document.body)}
  </nav>;
}
