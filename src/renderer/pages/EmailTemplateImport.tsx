import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useModalFocus } from '../components/useModalFocus';
import type { PlannerApi } from '../data/client';
import type { EmailTemplateImportReport, EmailTemplateImportSelection, EmailImportSignatureChoice } from '../../core/import/email-template-import-types';
import './EmailTemplateImport.css';

const matchLabels = { new: '新增', identical: '相同', update: '可能更新', conflict: '冲突' };
export function EmailTemplateImport({ api, onClose }: { api: PlannerApi; onClose(): void }) {
  const [file, setFile] = useState<File>(); const [previewId, setPreviewId] = useState('');
  const [report, setReport] = useState<EmailTemplateImportReport>(); const [rows, setRows] = useState<EmailTemplateImportSelection[]>([]);
  const [signatureChoices, setSignatureChoices] = useState<EmailImportSignatureChoice[]>([]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  const [consumed, setConsumed] = useState(false);
  const panel = useRef<HTMLElement>(null);
  useModalFocus({panel,open:true,onClose:()=>{if(!busy)onClose();}});
  const preview = async () => {
    if (!file || !api.previewEmailTemplateImport) return;
    setBusy(true); setError(''); setMessage(''); setReport(undefined); setRows([]); setSignatureChoices([]); setConsumed(false);
    try {
      const result = await api.previewEmailTemplateImport(file); setPreviewId(result.previewId); setReport(result.report);
      setSignatureChoices((result.report.signatures ?? []).map(signature => ({ id: signature.id, action: 'skip', confirmed: false, name: '', content: signature.content })));
      setRows(result.report.candidates.map(row => ({ ...row, action: 'skip', confirmed: false, contactsConfirmed: false, historyReviewed: false })));
    } catch (reason) { setError(reason instanceof Error ? reason.message : '邮件模板识别失败'); }
    finally { setBusy(false); }
  };
  const edit = (index: number, patch: Partial<EmailTemplateImportSelection>, reset = true) => {
    setRows(current => current.map((row, position) => position === index ? { ...row,
      ...(reset ? { contactsConfirmed: false, historyReviewed: false } : {}), ...patch } : row));
  };
  const selected = rows.filter(row => row.action !== 'skip');
  const selectedSignatures = signatureChoices.filter(choice => choice.action !== 'skip');
  const ready = (selected.length > 0 || selectedSignatures.length > 0) && selectedSignatures.every(choice => choice.confirmed && (choice.action === 'reuse' ? !!choice.existingId : !!choice.name?.trim() && !!choice.content?.trim())) && selected.every(row => row.confirmed && row.contactsConfirmed && row.historyReviewed
    && row.manufacturer.trim() && row.scenario.trim() && row.name.trim() && row.subjectTemplate.trim() && row.bodyTemplate.trim());
  const confirm = async () => {
    if (!api.confirmEmailTemplateImport || !ready) return;
    setBusy(true); setError('');
    try {
      const result = await api.confirmEmailTemplateImport(previewId, selected, signatureChoices.length ? signatureChoices : undefined);
      setMessage(`新增 ${result.created} 条，更新 ${result.updated} 条，跳过 ${result.skipped} 条；新增联系人 ${result.contactsCreated} 条`);
      if (signatureChoices.length) setMessage(current => `${current}；新增签名 ${result.signaturesCreated ?? 0} 条，复用 ${result.signaturesReused ?? 0} 条`);
      setConsumed(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '邮件模板导入失败'); }
    finally { setBusy(false); }
  };
  return createPortal(<div className="email-import-overlay"><section ref={panel} role="dialog" aria-modal="true" aria-labelledby="email-import-title" className="email-import-dialog">
    <header><h2 id="email-import-title">导入邮件模板</h2><button className="text-button" type="button" onClick={onClose} disabled={busy}>关闭</button></header>
    <div className="email-import-source"><input aria-label="邮件模板 Excel" type="file" accept=".xlsx" disabled={busy}
      onChange={event => { setFile(event.target.files?.[0]); setReport(undefined); setRows([]); setPreviewId(''); setMessage(''); }}/>
      <button className="primary-button" type="button" disabled={!file || busy || !api.previewEmailTemplateImport} onClick={() => void preview()}>{busy ? '处理中…' : '识别并预览'}</button></div>
    <p>支持 .xlsx；旧版 .xls 请先另存为 .xlsx。仅导入首批和更新包材资料。</p>
    {error && <p role="alert" className="error-banner">{error}</p>}{message && <p role="status" className="success-banner">{message}</p>}
    {report && <><div className="email-import-sheets">{report.sheets.map(sheet => <span key={sheet.name}>{sheet.name}：{sheet.supported ? `${sheet.candidates} 条${sheet.candidates ? '' : '，无法识别，请核对源表标签'}` : '未支持，不导入'}</span>)}</div>
      {!!report.signatures?.length && <section className="email-import-signatures"><strong>来源签名（独立保存，不设为默认）</strong>{report.signatures.map((signature, index) => {
        const choice = signatureChoices[index]; if (!choice) return null;
        const update = (patch: Partial<EmailImportSignatureChoice>) => setSignatureChoices(current => current.map((item, position) => position === index ? { ...item, confirmed: false, ...patch } : item));
        return <fieldset key={signature.id} disabled={busy || consumed}><legend>签名 {index + 1} · {signature.sources.length} 处来源</legend><details><summary>查看来源和签名原文</summary><p>{signature.sources.join(' / ')}</p><pre>{signature.content}</pre></details>
          <select aria-label={`签名处理 ${index + 1}`} value={choice.action} onChange={event => update({action:event.target.value as EmailImportSignatureChoice['action'],existingId:undefined,expectedFingerprint:undefined})}><option value="skip">跳过签名</option><option value="create">新增独立签名</option><option value="reuse" disabled={!signature.matches?.length}>复用内容相同的已有签名</option></select>
          {choice.action === 'reuse' && <select aria-label={`复用签名 ${index + 1}`} value={choice.existingId ?? ''} onChange={event => { const match = signature.matches?.find(item => item.id === Number(event.target.value)); update({existingId:match?.id,expectedFingerprint:match?.expectedFingerprint}); }}><option value="">请选择已有签名</option>{signature.matches?.map(match => <option key={match.id} value={match.id}>{match.name}</option>)}</select>}
          {choice.action === 'create' && <><label>签名名称<input aria-label={`签名名称 ${index + 1}`} value={choice.name ?? ''} onChange={event => update({name:event.target.value})}/></label><label>签名内容<textarea aria-label={`签名内容 ${index + 1}`} value={choice.content ?? ''} onChange={event => update({content:event.target.value})}/></label></>}
          {choice.action !== 'skip' && <label><input type="checkbox" aria-label={`已确认签名 ${index + 1}`} checked={choice.confirmed} onChange={event => update({confirmed:event.target.checked})}/>已确认独立签名，不覆盖已有签名及默认设置</label>}
        </fieldset>;
      })}</section>}
      <div className="email-import-candidates">{rows.map((row, index) => <fieldset key={row.id} disabled={busy || consumed}>
        <legend>{row.sheet} · {row.source} · {matchLabels[row.match ?? 'new']} · 待确认</legend>
        <div className="email-import-row"><label className="email-import-check"><input aria-label={`选择模板 ${index + 1}`} type="checkbox" checked={row.action !== 'skip'}
          onChange={event => edit(index, { confirmed: event.target.checked, action: event.target.checked ? (row.match === 'update' ? 'update' : 'create') : 'skip' }, false)}/>导入此模板</label>
          {row.action !== 'skip' && <select aria-label={`导入操作 ${index + 1}`} value={row.action} onChange={event => edit(index, { action: event.target.value as 'create' | 'update' }, false)}><option value="create">新增 / 相同跳过</option><option value="update">明确更新已有模板</option></select>}</div>
        <div className="email-import-fields">{([['manufacturer', '厂家'], ['scenario', '场景'], ['name', '名称'], ['subjectTemplate', '主题']] as const).map(([key, title]) => <label key={key}>{title}<input aria-label={`${title} ${index + 1}`} value={row[key]} onChange={event => edit(index, { [key]: event.target.value })}/></label>)}</div>
        <label>正文<textarea aria-label={`正文 ${index + 1}`} rows={6} value={row.bodyTemplate} onChange={event => edit(index, { bodyTemplate: event.target.value })}/></label>
        <details><summary>查看原始参考与待确认内容</summary><pre>{row.rawReference}</pre><ul>{row.warnings.map((warning, position) => <li key={position}>{warning}</li>)}</ul></details>
        {row.existing && <details><summary>查看系统当前模板（更新将覆盖这些文字）</summary><strong>{row.existing.name}</strong><pre>{row.existing.subjectTemplate}{'\n\n'}{row.existing.bodyTemplate}</pre></details>}
        <div className="email-import-contacts"><strong>联系人</strong>{!row.contacts.length && <span>未识别邮箱，可不关联联系人或手动添加。</span>}
          <span>复用保留已有联系人字段；收件/抄送仅记录到本模板。全部跳过表示本模板明确无联系人。</span>{row.contacts.map((contact, position) => <div key={position} className="email-import-contact">
            <select aria-label={`联系人处理 ${index + 1}-${position + 1}`} value={contact.resolution ?? 'import'} onChange={event => edit(index, { contacts: row.contacts.map((item, pos) => pos === position ? { ...item, resolution: event.target.value as 'import' | 'reuse' | 'skip' } : item) })}><option value="import">新增联系人</option>{contact.existingId && <option value="reuse">复用已有联系人 #{contact.existingId}</option>}<option value="skip">跳过联系人</option></select>
            {(['company', 'contactName', 'email'] as const).map((key, field) => <input key={key} aria-label={`${['联系人厂家', '联系人称呼', '联系人邮箱'][field]} ${index + 1}-${position + 1}`} value={contact[key]} placeholder={['厂家', '称呼', '邮箱'][field]} onChange={event => edit(index, { contacts: row.contacts.map((item, pos) => pos === position ? { ...item, [key]: event.target.value } : item) })}/>)}
            <select aria-label={`收件类型 ${index + 1}-${position + 1}`} value={contact.defaultRecipientType} onChange={event => edit(index, { contacts: row.contacts.map((item, pos) => pos === position ? { ...item, defaultRecipientType: event.target.value as 'to' | 'cc' } : item) })}><option value="to">收件人</option><option value="cc">抄送人</option></select>
            {contact.rawSource && <small>来源：{contact.rawSource}</small>}{contact.existingId && <small>已有联系人 #{contact.existingId}，复用不会改写厂家、称呼或默认角色</small>}
            {contact.conflict && <p className="error-banner">{contact.conflict}</p>}
          </div>)}<button className="text-button" type="button" onClick={() => edit(index, { contacts: [...row.contacts, { company: row.manufacturer, contactName: '', email: '', defaultRecipientType: 'to', resolution: 'import' }] })}>添加联系人</button></div>
        <div className="email-import-review"><label><input aria-label={`已确认联系人关联 ${index + 1}`} type="checkbox" checked={row.contactsConfirmed} onChange={event => edit(index, { contactsConfirmed: event.target.checked }, false)}/>已确认联系人关联</label>
          <label><input aria-label={`已核对固定话术、动态信息及历史示例 ${index + 1}`} type="checkbox" checked={row.historyReviewed} onChange={event => edit(index, { historyReviewed: event.target.checked }, false)}/>已核对固定话术、动态信息及历史示例，排除不适用的旧型号、日期和修改原因</label></div>
      </fieldset>)}</div>
      <footer><span>已选择 {selected.length} 条</span><button type="button" className="primary-button" disabled={busy || consumed || !ready} onClick={() => void confirm()}>确认导入所选模板</button></footer></>}
  </section></div>,document.body);
}
