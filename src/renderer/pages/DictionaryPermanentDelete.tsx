import { useEffect, useState } from 'react';
import type { DictionaryDeletionPreview, DictionaryItemView, PlannerApi } from '../data/client';

export function DictionaryPermanentDelete({api,item,onCancel,onDeleted,onBusy}:{api:PlannerApi;item:DictionaryItemView;onCancel:()=>void;onDeleted:()=>void;onBusy:(busy:boolean)=>void}) {
  const [preview,setPreview] = useState<DictionaryDeletionPreview|null>(null);
  const [error,setError] = useState('');
  const [attempt,setAttempt] = useState(0);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [confirmation,setConfirmation] = useState('');
  useEffect(()=>{
    let active = true;
    setLoading(true);setPreview(null);setError('');setConfirmation('');
    api.previewPermanentDictionaryDeletion(item.id).then(result=>{
      if (!active) return;
      if (result.item.id !== item.id || result.item.code !== item.code) { setError('记录已变化，请刷新列表重新核对');return; }
      setPreview(result);
    }).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:'引用核查失败，不能永久删除');})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[api,item.id,item.code,attempt]);
  const allowed = preview?.allowed === true && preview.blockers.length === 0 && Boolean(preview.item.deletedAt);
  const submit = async () => {
    if (!allowed || !preview?.item.deletedAt || busy || confirmation !== preview.item.code) return;
    setBusy(true);onBusy(true);setError('');
    try {
      await api.permanentlyDeleteDictionary(item.id,{confirmationCode:confirmation,expectedName:preview.item.name,expectedDeletedAt:preview.item.deletedAt});
      onDeleted();
    } catch(reason) {
      setError(reason instanceof Error?reason.message:'永久删除失败');setPreview(null);
    } finally {setBusy(false);onBusy(false);}
  };
  return <section className="inline-confirm dictionary-permanent-delete" aria-label={`永久删除核对 ${item.name}`}>
    <strong>永久删除字典记录：{preview?.item.code ?? item.code} · {preview?.item.name ?? item.name}</strong>
    <p>此操作无法恢复。仅删除这条字典记录，不删除文件，不解除或删除关联业务记录。</p>
    {loading && <p role="status">正在核查业务及历史引用…</p>}
    {preview && !allowed && <div role="alert"><p>当前不能永久删除：</p><ul>{preview.blockers.map(reason=><li key={reason}>{reason}</li>)}</ul></div>}
    {allowed && <><p>当前未发现业务引用，确认时仍会再次核查。</p><label>输入完整编码以确认<input aria-label="永久删除确认编码" autoComplete="off" value={confirmation} disabled={busy} onChange={e=>setConfirmation(e.target.value)}/></label></>}
    {error && <p className="error-banner" role="alert">{error}</p>}
    <div className="form-actions"><button type="button" disabled={busy} onClick={onCancel}>取消永久删除</button>
      {!loading && !preview && <button type="button" disabled={busy} onClick={()=>setAttempt(value=>value+1)}>重新核查</button>}
      <button className="primary-button danger" type="button" disabled={!allowed || confirmation !== preview?.item.code || busy} onClick={()=>void submit()}>{busy?'永久删除中…':'确认永久删除'}</button>
    </div>
  </section>;
}
