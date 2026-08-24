export const dictionaryTypes = [
  'brand',
  'product_size',
  'appearance',
  'color',
  'main_category',
  'project_item',
  'layer_count',
] as const;

export type DictionaryType = (typeof dictionaryTypes)[number];

export interface DictionaryItem {
  id: number;
  type: DictionaryType;
  code: string;
  name: string;
  parentId: number | null;
  status: 'active' | 'inactive';
}

export interface CreateDictionaryItem {
  type: DictionaryType;
  code: string;
  name: string;
  parentId?: number;
}
