export interface Product {
  id: number;
  sku: string | null;
  brandId: number;
  brandName: string;
  productSizeId: number;
  productSizeName: string;
  defaultAppearanceId: number | null;
  defaultAppearanceName: string | null;
  model: string;
  productCategory: string;
  referenceProductId: number | null;
  referenceProductModel: string | null;
  status: 'active' | 'inactive';
}

export interface ProductInput {
  sku: string | null;
  brandId: number;
  productSizeId: number;
  defaultAppearanceId?: number | null;
  model: string;
  productCategory: string;
  referenceProductId?: number | null;
}

export interface ProductFilters {
  search?: string;
  brandId?: number;
  productCategory?: string;
  status?: 'active' | 'inactive' | 'all';
}

export interface HistoricalProductCandidate {
  productCategory: string;
  sku: string;
  model: string;
  historicalDrawingCount: number;
  ambiguous: boolean;
}

export interface HistoricalProductCandidateIdentity {
  productCategory: string;
  sku: string;
  model: string;
}

export interface ConfirmHistoricalProductCandidateInput extends HistoricalProductCandidateIdentity {
  brandId: number;
  productSizeId: number;
  defaultAppearanceId: number;
}
