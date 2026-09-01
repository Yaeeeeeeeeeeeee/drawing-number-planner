import type { PlannerDatabase } from '../../db/database.js';
import { QrRepository } from '../qr/qr-repository.js';
import { ProductRepository } from './product-repository.js';
import type { ConfirmHistoricalProductCandidateInput, HistoricalProductCandidate, Product, ProductFilters, ProductInput } from './product-types.js';

export type ProductErrorCode = 'DUPLICATE_MODEL' | 'DUPLICATE_SKU' | 'INVALID_SKU' | 'INVALID_DICTIONARY_REFERENCE' | 'INVALID_REFERENCE_PRODUCT' | 'PRODUCT_REFERENCED' | 'NOT_FOUND'
  | 'INVALID_HISTORICAL_CANDIDATE' | 'AMBIGUOUS_HISTORICAL_CANDIDATE' | 'STALE_HISTORICAL_CANDIDATE';

export class ProductError extends Error {
  constructor(public readonly code: ProductErrorCode, message: string) { super(message); }
}

export class ProductService {
  private readonly repository: ProductRepository;
  constructor(private readonly database: PlannerDatabase) { this.repository = new ProductRepository(database); }

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
    return this.database.transaction(() => {
      try {
        const product = this.repository.create(normalized);
        new QrRepository(this.database).ensureForProduct(product.id);
        return product;
      } catch (error) { return this.mapDatabaseError(error); }
    })();
  }

  update(id: number, input: ProductInput): Product {
    const current = this.get(id);
    const normalized = this.validateAndNormalize(input, id);
    if (this.repository.hasDrawingReferences(id) && this.changesReferencedMeaning(current, normalized)) {
      throw new ProductError('PRODUCT_REFERENCED', '该产品已有图号记录，不能修改编码含义');
    }
    try { return this.repository.update(id, normalized); }
    catch (error) { return this.mapDatabaseError(error); }
  }

  deactivate(id: number): Product {
    this.get(id);
    return this.repository.deactivate(id);
  }

  listHistoricalCandidates(): { items: HistoricalProductCandidate[] } {
    const rows = this.repository.listHistoricalCandidateRows();
    const skuCounts = new Map<string, number>();
    for (const row of rows) {
      const sku = row.sku.toLocaleLowerCase('en-US');
      skuCounts.set(sku, (skuCounts.get(sku) ?? 0) + 1);
    }
    return { items: rows.map((row) => ({
      ...row,
      ambiguous: (skuCounts.get(row.sku.toLocaleLowerCase('en-US')) ?? 0) > 1,
    })) };
  }

  confirmHistoricalCandidate(input: ConfirmHistoricalProductCandidateInput): { product: Product; linkedHistoricalCount: number } {
    if (![input.productCategory, input.sku, input.model].every((value) => value.trim().length > 0)) {
      throw new ProductError('INVALID_HISTORICAL_CANDIDATE', '历史产品候选信息不完整');
    }
    return this.database.transaction(() => {
      if (this.repository.hasSku(input.sku)) throw new ProductError('DUPLICATE_SKU', 'SKU 已存在');
      const candidate = this.listHistoricalCandidates().items.find((item) => item.productCategory === input.productCategory
        && item.sku === input.sku && item.model === input.model);
      if (!candidate) throw new ProductError('STALE_HISTORICAL_CANDIDATE', '历史产品候选已变化，请刷新后重试');
      if (candidate.ambiguous) {
        throw new ProductError('AMBIGUOUS_HISTORICAL_CANDIDATE', '同一 SKU 对应多个历史目录，不能自动确认');
      }
      const product = this.create({
        sku: input.sku,
        model: input.model,
        productCategory: input.productCategory,
        brandId: input.brandId,
        productSizeId: input.productSizeId,
        defaultAppearanceId: input.defaultAppearanceId,
        referenceProductId: null,
      });
      const linkedHistoricalCount = this.repository.linkHistoricalCandidate(input, product.id);
      if (linkedHistoricalCount !== candidate.historicalDrawingCount) {
        throw new ProductError('STALE_HISTORICAL_CANDIDATE', '历史产品候选已变化，请刷新后重试');
      }
      return { product, linkedHistoricalCount };
    })();
  }

  private validateAndNormalize(input: ProductInput, currentId?: number): ProductInput {
    const sku = input.sku?.trim();
    if (!sku) throw new ProductError('INVALID_SKU', '新建产品必须填写 SKU');
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
      sku,
      model: input.model.trim(),
      productCategory: input.productCategory.trim(),
      defaultAppearanceId: input.defaultAppearanceId ?? null,
      referenceProductId: input.referenceProductId ?? null,
    };
  }

  private mapDatabaseError(error: unknown): never {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed: products.sku')) {
      throw new ProductError('DUPLICATE_SKU', 'SKU 已存在');
    }
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed: products.brand_id, products.model')) {
      throw new ProductError('DUPLICATE_MODEL', '同一品牌下型号已存在');
    }
    throw error;
  }

  private changesReferencedMeaning(current: Product, next: ProductInput): boolean {
    return current.brandId !== next.brandId
      || current.productSizeId !== next.productSizeId
      || current.defaultAppearanceId !== next.defaultAppearanceId
      || current.model !== next.model
      || current.productCategory !== next.productCategory
      || current.referenceProductId !== next.referenceProductId;
  }
}
