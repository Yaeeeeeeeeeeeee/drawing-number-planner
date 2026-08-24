import type { PlannerDatabase } from '../../db/database.js';
import { ProductRepository } from './product-repository.js';
import type { Product, ProductFilters, ProductInput } from './product-types.js';

export type ProductErrorCode = 'DUPLICATE_MODEL' | 'INVALID_DICTIONARY_REFERENCE' | 'INVALID_REFERENCE_PRODUCT' | 'PRODUCT_REFERENCED' | 'NOT_FOUND';

export class ProductError extends Error {
  constructor(public readonly code: ProductErrorCode, message: string) { super(message); }
}

export class ProductService {
  private readonly repository: ProductRepository;
  constructor(database: PlannerDatabase) { this.repository = new ProductRepository(database); }

  list(filters: ProductFilters = {}): { items: Product[] } {
    return { items: this.repository.list(filters) };
  }

  get(id: number): Product {
    const product = this.repository.get(id);
    if (!product) throw new ProductError('NOT_FOUND', '产品档案不存在');
    return product;
  }

  create(input: ProductInput): Product {
    const normalized = this.validateAndNormalize(input);
    try { return this.repository.create(normalized); }
    catch (error) { return this.mapDatabaseError(error); }
  }

  update(id: number, input: ProductInput): Product {
    this.get(id);
    if (this.repository.hasDrawingReferences(id)) {
      throw new ProductError('PRODUCT_REFERENCED', '该产品已有图号记录，不能修改编码含义');
    }
    const normalized = this.validateAndNormalize(input, id);
    try { return this.repository.update(id, normalized); }
    catch (error) { return this.mapDatabaseError(error); }
  }

  deactivate(id: number): Product {
    this.get(id);
    return this.repository.deactivate(id);
  }

  private validateAndNormalize(input: ProductInput, currentId?: number): ProductInput {
    const valid = this.repository.isActiveDictionary(input.brandId, 'brand')
      && this.repository.isActiveDictionary(input.productSizeId, 'product_size')
      && (input.defaultAppearanceId == null
        || this.repository.isActiveDictionary(input.defaultAppearanceId, 'appearance'));
    if (!valid) {
      throw new ProductError('INVALID_DICTIONARY_REFERENCE', '产品引用了无效或已停用的编码字典');
    }
    if (input.referenceProductId != null) {
      if (input.referenceProductId === currentId || !this.repository.get(input.referenceProductId)) {
        throw new ProductError('INVALID_REFERENCE_PRODUCT', '参考来源型号无效');
      }
    }
    return {
      ...input,
      model: input.model.trim(),
      productCategory: input.productCategory.trim(),
      defaultAppearanceId: input.defaultAppearanceId ?? null,
      referenceProductId: input.referenceProductId ?? null,
    };
  }

  private mapDatabaseError(error: unknown): never {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed: products.brand_id, products.model')) {
      throw new ProductError('DUPLICATE_MODEL', '同一品牌下型号已存在');
    }
    throw error;
  }
}
