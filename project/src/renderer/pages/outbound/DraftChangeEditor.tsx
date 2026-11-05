import { useState } from 'react';
import { mergeDraftChanges, type DraftChange } from './mail-draft';

export function DraftChangeEditor({ changes, onChange }: { changes: DraftChange[]; onChange: (changes: DraftChange[]) => void }) {
  const [selected, setSelected] = useState<number[]>([]);
  const update = (id: number, patch: Partial<DraftChange>) => onChange(changes.map(item => item.id === id ? { ...item, ...patch } : item));
  const move = (index: number, by: number) => { const next = [...changes]; [next[index], next[index + by]] = [next[index + by], next[index]]; onChange(next); };
  return <section className="mail-change-editor" aria-label="本次变更内容">
    <div className="ob-section-head"><h4>本次变更内容</h4><button className="text-button" type="button" disabled={changes.filter(item => selected.includes(item.id)).length < 2} onClick={() => { onChange(mergeDraftChanges(changes, selected)); setSelected([]); }}>合并所选说明</button></div>
    {changes.map((item, index) => <article className="mail-change-entry" key={item.id}>
      <div className="ob-section-head"><label><input type="checkbox" aria-label={`选择合并 ${item.itemName}`} checked={selected.includes(item.id)} onChange={() => setSelected(value => value.includes(item.id) ? value.filter(id => id !== item.id) : [...value, item.id])} />{index + 1}. {item.itemName}</label>
        <div className="ob-actions"><button className="text-button" type="button" aria-label={`上移 ${item.itemName}`} disabled={index === 0} onClick={() => move(index, -1)}>上移</button><button className="text-button" type="button" aria-label={`下移 ${item.itemName}`} disabled={index === changes.length - 1} onClick={() => move(index, 1)}>下移</button><button className="text-button" type="button" aria-label={`删除说明 ${item.itemName}`} onClick={() => onChange(changes.filter(value => value.id !== item.id))}>删除说明</button></div></div>
      <div className="mail-change-facts">{item.mainCategoryName && <span>主类别：{item.mainCategoryName}</span>}{item.fullCode && <span>图号：{item.fullCode}</span>}{item.files.map(file => <div key={file.fileName} title={file.fileName}>新文件：{file.fileName}{file.batchName && <span> · {file.batchName}</span>}</div>)}</div>
      <label><span>具体修改内容</span><textarea rows={2} aria-label={`修改原因 ${item.itemName}`} placeholder="请填写具体修改原因" value={item.reason} onChange={event => update(item.id, { reason: event.target.value })} /></label>
      <label><input type="checkbox" aria-label={`显示文件名 ${item.itemName}`} checked={item.showFileName} onChange={event => update(item.id, { showFileName: event.target.checked })} />在邮件中显示文件名</label>
    </article>)}
    {!changes.length && <p className="muted-text">本次没有需要写入邮件的变更说明。</p>}
  </section>;
}
