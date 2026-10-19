import { ProductExitWorksheet } from './ProductExitWorksheet';
import { useEffect, useRef, useState } from 'react';
import type { PlannerApi, ProductCleanupPreviewView, ProductCleanupSelection } from '../data/client';

export function ProductCleanupPanel({ api, productId, onCancel, onComplete, confirmLabel = '确认退出当前业务' }: {
  api: PlannerApi; productId: number; onCancel: () => void; onComplete: () => void; confirmLabel?: string;
}) {
  const [preview, setPreview] = useState<ProductCleanupPreviewView | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const [occupancy,setOccupancy]=useState<ProductCleanupSelection['occupancy']|''>('');
  const [history,setHistory]=useState<ProductCleanupSelection['history']|''>('');
  const [codes,setCodes]=useState<Record<number,string>>({});
  const [historyConfirmation,setHistoryConfirmation]=useState('');
  const [reviewing,setReviewing]=useState(false);
  const [reload,setReload] = useState(0);
  useEffect(() => {
    let current = true;
    setPreview(null); setConfirmation(''); setError('');setOccupancy('');setHistory('');setCodes({});setHistoryConfirmation('');setReviewing(false);
    void api.previewProductCleanup(productId).then((value) => { if (current) setPreview(value); })
      .catch((reason) => { if (current) setError(reason instanceof Error ? reason.message : '清理预检失败'); });
    return () => { current = false; };
  }, [api, productId, reload]);
  const choices=preview?.choices;
  const ready=!!(preview && choices && occupancy && history && !preview.blockers.length && confirmation===preview.model
    && (history!=='purge' || historyConfirmation==='永久清除历史' && !choices.purgeBlockers.length)
    && (occupancy!=='release' || choices.occupiedDrawings.every(row=>codes[row.signedId]===row.fullCode)));
  const execute = async () => {
    if (sending.current || !ready || !reviewing || !preview || !choices || !occupancy || !history) return;
    sending.current = true; setBusy(true); setError('');
    try { await api.cleanupProduct(productId, confirmation,{occupancy,history,expectedFingerprint:choices.fingerprint,
      confirmedCodes:occupancy==='release'?choices.occupiedDrawings.map(row=>({signedId:row.signedId,confirmedCode:codes[row.signedId]})):[],
      ...(history==='purge'?{confirmedHistory:historyConfirmation}:{})}); onComplete(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '集中清理失败');setReviewing(false); }
    finally { sending.current = false; setBusy(false); }
  };
  return <section className="editor-panel product-cleanup-panel" aria-label="产品删除检查与清理">
    <div className="product-cleanup-heading"><h3>产品删除检查与清理</h3>
      <button type="button" className="secondary-button" disabled={busy} onClick={() => setReload(value=>value+1)}>重新检查</button></div>
    <p>分别选择图号占用及业务历史的处理方式，再核对影响范围。不会删除任何磁盘文件。</p>
    {!preview && !error && <p>正在检查关联…</p>}
    {preview && <>
      <details className="product-cleanup-details"><summary>查看关联检查明细</summary><ProductExitWorksheet preview={preview} selectable/></details>
      {preview.blockers.map((blocker) => <p className="error-banner" key={blocker}>{blocker}</p>)}
      {!choices && <p role="alert">处理选项预检信息不可用，请重新检查；禁止直接执行。</p>}
      {choices && <fieldset className="product-cleanup-options" disabled={busy || reviewing}>
        <legend>选择处理方式</legend>
        <div><strong>图号占用 · {choices.occupiedDrawings.length} 条</strong>
          <label><input type="radio" name={`occupancy-${productId}`} checked={occupancy==='retain_occupied'} onChange={()=>{setOccupancy('retain_occupied');setCodes({});}}/>继续保留占号</label>
          <label><input type="radio" name={`occupancy-${productId}`} checked={occupancy==='release'} onChange={()=>setOccupancy('release')}/>释放占号</label>
          <p>释放后号码可被重新使用，已有释放号码不重复处理。</p>
          {occupancy==='release' && choices.occupiedDrawings.map(row=><label className="product-cleanup-confirmation" key={row.signedId}>确认释放图号 {row.fullCode}<input value={codes[row.signedId]??''} onChange={event=>setCodes(current=>({...current,[row.signedId]:event.target.value}))} placeholder="逐条输入完整图号" autoComplete="off"/></label>)}
        </div>
        <div><strong>业务历史</strong>
          <label><input type="radio" name={`history-${productId}`} checked={history==='retain'} onChange={()=>{setHistory('retain');setHistoryConfirmation('');}}/>保留业务历史</label>
          <label><input type="radio" name={`history-${productId}`} checked={history==='purge'} onChange={()=>setHistory('purge')}/>永久清除业务历史</label>
          <p>BOM {choices.purgeCounts.bomRecords} 条 · 二维码 {choices.purgeCounts.qrCodes} 条 · 资料批次 {choices.purgeCounts.batches} 条 · 外发 {choices.purgeCounts.outboundPackages} 条 · 邮件草稿 {choices.purgeCounts.emailDrafts} 条</p>
          {history==='purge' && <><p className="danger-text">上述本产品业务记录将永久清除，无法从回收站恢复。共享文件索引、附件文件、图号记录和产品退出审计保留。</p>
            {choices.purgeBlockers.map(message=><p key={message} role="alert" className="error-banner">{message}</p>)}
            <label className="product-cleanup-confirmation">输入“永久清除历史”确认<input value={historyConfirmation} onChange={event=>setHistoryConfirmation(event.target.value)} autoComplete="off"/></label></>}
        </div>
        <label className="product-cleanup-confirmation">输入型号确认<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder={preview.model} autoComplete="off"/></label>
      </fieldset>}
    </>}
    {error && <p className="error-banner" role="alert">{error}{!preview && ' · 检查失败，禁止继续退出。'}</p>}
    {reviewing && <section className="product-cleanup-review" aria-label="最后确认处理范围"><h4>最后确认处理范围</h4>
      <p>{preview?.model}：{occupancy==='release'?'释放占号':'继续保留占号'}；{history==='purge'?'永久清除业务历史':'保留业务历史'}。</p>
      <p>所有磁盘文件保留。提交时会再次检查引用和资料变化。</p>
      <div className="product-cleanup-actions"><button className="primary-button danger" type="button" disabled={busy||!ready} onClick={()=>void execute()}>{busy?'正在处理…':'确认执行'}</button>
        <button className="secondary-button" type="button" disabled={busy} onClick={()=>setReviewing(false)}>返回调整</button>
        <button className="secondary-button" type="button" disabled={busy} onClick={onCancel}>取消</button></div>
    </section>}
    {!reviewing && <div className="product-cleanup-actions">
      {preview && <button type="button" className="primary-button danger" disabled={busy || !ready}
        title={confirmLabel} onClick={() => setReviewing(true)}>核对处理结果</button>}
      <button type="button" className="secondary-button" disabled={busy} onClick={onCancel}>取消</button>
    </div>}
  </section>;
}
