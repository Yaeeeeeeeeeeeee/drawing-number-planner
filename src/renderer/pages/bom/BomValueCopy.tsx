import { useState } from 'react';
import { CopyButton } from '../../components/CopyButton';

export function HistoryCopy({ value, label }: { value: string; label: string }) {
  const [message, setMessage] = useState('');
  return <span className="bom-copy-action"><CopyButton label={label} title={message || label} onClick={() => {
    if (!navigator.clipboard) { setMessage('复制不可用，请手动选择文本'); return; }
    void navigator.clipboard.writeText(value).then(() => setMessage('已复制')).catch(() => setMessage('复制失败，请手动选择文本'));
  }} />{message && <span className="bom-copy-feedback" role="status">{message}</span>}</span>;
}
/** The value can wrap; the copy action remains in the same flex row. */
export function BomValueCopy({ value, label, code = false }: { value: string; label: string; code?: boolean }) {
  return <span className="bom-value-copy"><span className={code ? 'bom-value-text code-cell' : 'bom-value-text'}>{value}</span><HistoryCopy value={value} label={label}/></span>;
}
