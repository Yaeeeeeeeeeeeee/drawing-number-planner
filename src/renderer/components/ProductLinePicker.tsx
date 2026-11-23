import { useId, useState } from 'react';

import './product-line-picker.css';

interface ProductLineItem {
  id: number;
  model: string;
  sku?: string | null;
  brandName?: string | null;
  productCategory: string;
}

interface ProductLinePickerProps {
  products: readonly ProductLineItem[];
  selectedIds: readonly number[];
  onChange(ids: number[]): void;
  mode?: 'single' | 'multiple';
  disabled?: boolean;
  label?: string;
}

export function ProductLinePicker({
  products, selectedIds, onChange, mode = 'multiple', disabled, label = '选择产品型号',
}: ProductLinePickerProps) {
  const radioGroup = useId();
  const [search, setSearch] = useState('');
  const selected = new Set(selectedIds);
  const query = search.trim().toLocaleLowerCase();
  const groups = new Map<string, ProductLineItem[]>();
  for (const product of products) {
    const category = product.productCategory || '未分类';
    const searchable = [product.model, product.sku, product.brandName, category].join(' ').toLocaleLowerCase();
    if (!searchable.includes(query)) continue;
    const group = groups.get(category);
    if (group) group.push(product);
    else groups.set(category, [product]);
  }
  const visible = [...groups.values()].flat();
  const multiple = mode === 'multiple';
  const toggle = (id: number, checked: boolean) => {
    if (!multiple) onChange([id]);
    else onChange(checked ? [...selected, id] : selectedIds.filter(value => value !== id));
  };

  return <fieldset className="product-line-picker" disabled={disabled}>
    <legend>{label}</legend>
    <div className="product-line-picker-toolbar">
      <input type="search" aria-label="搜索型号" placeholder="搜索型号、SKU 或品牌" value={search}
        onChange={event => setSearch(event.target.value)} />
      <span role="status">已选 {selected.size} 个型号</span>
      {multiple && <button type="button" disabled={visible.every(item => selected.has(item.id))}
        onClick={() => onChange([...new Set([...selected, ...visible.map(item => item.id)])])}>全选当前结果</button>}
      <button type="button" disabled={!selected.size} onClick={() => onChange([])}>清空选择</button>
    </div>
    {visible.length ? [...groups].map(([category, items]) => (
      <fieldset className="product-line-picker-group" key={category}>
        <legend>{category}</legend>
        <div className="product-line-picker-options">
          {items.map(product => (
            <label className="product-line-picker-option" key={product.id}>
              <input type={multiple ? 'checkbox' : 'radio'} name={multiple ? undefined : radioGroup} value={product.id}
                checked={selected.has(product.id)} onChange={event => toggle(product.id, event.target.checked)} />
              <strong title={product.model}>{product.model}</strong>
              {(product.sku || product.brandName) && <small>{[product.sku, product.brandName].filter(Boolean).join(' · ')}</small>}
            </label>
          ))}
        </div>
      </fieldset>
    )) : <p className="product-line-picker-empty">{search.trim() ? '没有符合搜索条件的型号' : '暂无可选型号'}</p>}
  </fieldset>;
}
