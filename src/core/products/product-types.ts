export interface Product {
  id: number;
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
  status?: 'active' | 'inactive' | 'all';
}
