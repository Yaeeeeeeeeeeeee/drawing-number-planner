import { useState, type ReactNode } from 'react';
import type { DrawingNavigationBatchView, MaterialBatchView, ProductView } from '../data/client';
import { materialBatchLabel } from '../../core/files/material-batch-label';
export type DrawingNavigationScope = { kind: 'all' | 'product' | 'batch' | 'pending' | 'recycle'; productId?: number; batchId?: number; title: string };
export function ProductBatchNavigation({ products, batches, scope, onSelect, mode = 'drawings', footer }: {products: ProductView[]; batches: Array<MaterialBatchView & Partial<Pick<DrawingNavigationBatchView,'usageProducts'>>>; mode?: 'drawings'|'files'; footer?: ReactNode; scope: DrawingNavigationScope; onSelect(scope: DrawingNavigationScope): void}) {
  const [keyword, setKeyword] = useState('');
  const visible = products.filter(product => `${product.sku ?? ''} ${product.model}`.toLowerCase().includes(keyword.toLowerCase()));
  const categories = [...new Set(visible.map(product => product.productCategory || '未分类'))];
  return <nav className="product-batch-navigation" aria-label={mode === 'files' ? '资料导航' : '图号产品与批次'}>
    <input aria-label="搜索产品 SKU 或型号" placeholder="搜索 SKU / 型号" value={keyword} onChange={event => setKeyword(event.target.value)} />
    <button type="button" aria-current={scope.kind === 'all' ? 'page' : undefined} onClick={() => onSelect({kind:'all',title:'全部图号'})}>{mode === 'files' ? '全部产品／批次' : '全部产品 / 批次'}</button>
    {categories.map(category => <details key={category} open><summary>{category}</summary>{visible.filter(product => (product.productCategory || '未分类') === category).map(product => <details key={product.id}>
      <summary>{product.sku ?? '待补录'} · {product.model}</summary>
      <button type="button" aria-label={`${mode === 'files' ? '产品' : '产品全部图号'} ${product.sku ?? '待补录'} · ${product.model}`} aria-current={scope.kind === 'product' && scope.productId === product.id ? 'page' : undefined} onClick={() => onSelect({kind:'product',productId:product.id,title:`${product.sku ?? '待补录'} · ${product.model}`})}>产品全部图号</button>
      {batches.filter(batch => batch.productId === product.id || batch.usageProducts?.some(usage => usage.productId === product.id)).map(batch => { const usage = mode === 'files' ? {state:batch.recognitionStatus === 'pending' ? 'pending' : batch.currentState} : batch.usageProducts?.find(usage => usage.productId === product.id); return <button type="button" className="product-batch-leaf" key={batch.id} aria-current={scope.kind === 'batch' && scope.batchId === batch.id && scope.productId === product.id ? 'page' : undefined} onClick={() => onSelect({kind:'batch',productId:product.id,batchId:batch.id,title:`${product.model} / ${materialBatchLabel(batch.name)}`})}>{materialBatchLabel(batch.name)} <small>{usage?.state === 'current' ? '当前使用' : usage?.state === 'historical' ? '历史使用' : usage?.state === 'pending' ? '待确认' : '未确定'}</small></button>; })}
    </details>)}</details>)}
    {mode === 'drawings' && <><button type="button" aria-current={scope.kind === 'pending' ? 'page' : undefined} onClick={() => onSelect({kind:'pending',title:'待关联 / 未归批次'})}>待关联 / 未归批次</button>
    <button type="button" aria-current={scope.kind === 'recycle' ? 'page' : undefined} onClick={() => onSelect({kind:'recycle',title:'回收站'})}>回收站</button></>}{footer}
  </nav>;
}
