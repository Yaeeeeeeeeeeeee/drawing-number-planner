import type { ReactNode } from 'react';
import type { MaterialBatchView, ProductView, PdfNavigationCounts, DrawingNavigationBatchView } from '../data/client';
import { ProductCatalogNavigation, type CatalogNavigationScope } from './ProductCatalogNavigation';
export type PdfNavigationScope = Omit<CatalogNavigationScope, 'kind'> & {kind: Exclude<CatalogNavigationScope['kind'], 'recycle'>};
export type { PdfNavigationCounts } from '../data/client';
export function PdfProductBatchNavigation({counts, onSelect, ...props}: {
  products: ProductView[]; batches: MaterialBatchView[]; counts: PdfNavigationCounts | null;
  usageBatches?: DrawingNavigationBatchView[]; scope: PdfNavigationScope; onSelect(scope: PdfNavigationScope): void;
  filters: ReactNode; collapseControl?: ReactNode;
}) {
  return <ProductCatalogNavigation {...props} mode="files" counts={counts ? {...counts, unassociated: counts.unassociatedProducts} : null} onSelect={scope => {if(scope.kind !== 'recycle') onSelect(scope as PdfNavigationScope);}}/>;
}
