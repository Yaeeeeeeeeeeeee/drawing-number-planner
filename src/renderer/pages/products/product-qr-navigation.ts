export const productQrPurposes = [
  { key: 'user_manual', label: '说明书', englishName: 'User Manual' },
  { key: 'warranty', label: '售后卡', englishName: 'Warranty' },
  { key: 'recipe', label: '菜谱', englishName: 'Recipe' },
] as const;
export interface ProductQrTarget {
  productId: number;
  sku: string | null;
  model: string;
  productCategory: string;
  purposeKey: typeof productQrPurposes[number]['key'];
  purposeLabel: string;
  purposeEnglishName: string;
}
