/** Read-only BOM values remain selectable without copy controls. */
export function BomValue({ value, code = false }: { value: string; code?: boolean }) {
  return <span className={code ? 'bom-value-text code-cell' : 'bom-value-text'}>{value}</span>;
}
