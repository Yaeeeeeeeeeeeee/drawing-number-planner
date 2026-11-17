/** Existing purpose configuration controls which products may receive new QR records. */
export function isQrPurposeApplicable(purpose: { key: string; defaultForAll: boolean; productCategories: string[] }, productCategory: string): boolean {
  if (purpose.key === 'recipe') return productCategory === '空气炸锅';
  return purpose.defaultForAll || purpose.productCategories.includes(productCategory);
}
