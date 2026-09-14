import type { OutboundMaterialType } from './outbound-reference-repository.js';

export interface OutboundPackageNameInput {
  brand: string;
  model: string;
  productCategory: string;
  materialType: OutboundMaterialType;
  createdAt: Date;
}

export function buildOutboundPackageName(input: OutboundPackageNameInput): string {
  const createdDate = `${input.createdAt.getFullYear()}年${input.createdAt.getMonth() + 1}月${input.createdAt.getDate()}日`;
  const label = input.materialType === 'initial' ? '包材资料' : '更新包材资料';
  return `D&D - ${input.brand} ${input.model}${input.productCategory} 【${label}-${createdDate}】`;
}
