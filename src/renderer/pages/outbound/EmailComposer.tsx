import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  OutboundContactView,
  OutboundEmailTemplateView,
  OutboundMaterialTypeView,
  OutboundSignatureView,
  PlannerApi,
} from '../../data/client';
import type { OutboundMailContext } from './PackageBuilder';

async function copy(text: string, setMessage: (text: string) => void) {
  try {
    await navigator.clipboard.writeText(text);
    setMessage('已复制');
  } catch {
    setMessage('复制失败，请手动选择文本');
  }
}

interface EmailComposerProps {
  api: PlannerApi;
  mailContext: OutboundMailContext | null;
}

export function EmailComposer({ api, mailContext: incomingContext }: EmailComposerProps) {
  const [mailContext, setMailContext] = useState(incomingContext);
  const [pendingContext, setPendingContext] = useState<OutboundMailContext | null>(null);
  const lastIncoming = useRef(incomingContext);
  const [contacts, setContacts] = useState<OutboundContactView[]>([]);
  const [templates, setTemplates] = useState<OutboundEmailTemplateView[]>([]);
  const [signatures, setSignatures] = useState<OutboundSignatureView[]>([]);
  const [to, setTo] = useState<number[]>([]);
  const [cc, setCc] = useState<number[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [signatureId, setSignatureId] = useState('');
  const [blocks, setBlocks] = useState<number[]>([]);
  const [subject, setSubject] = useState(mailContext?.packageName ?? '');
  const [body, setBody] = useState('');
  const [manuallyEdited, setManuallyEdited] = useState(false);
  const [changeEdited, setChangeEdited] = useState(false);
  const [materialType, setMaterialType] = useState<OutboundMaterialTypeView>(mailContext?.materialType ?? 'update');
  const [changeDescription, setChangeDescription] = useState(() => mailContext?.items
    .filter((item) => item.changeDetails?.trim()).map((item, index) => `${index + 1}. ${item.projectItemName}：${item.changeDetails}`).join('\n') ?? '');
  const [message, setMessage] = useState('');

  const adoptContext = (context: OutboundMailContext) => {
    setMailContext(context);
    setSubject(context.packageName);
    setBody('');
    setChangeDescription(context.items.filter((item) => item.changeDetails?.trim())
      .map((item, index) => `${index + 1}. ${item.projectItemName}：${item.changeDetails}`).join('\n'));
    setManuallyEdited(false);
    setChangeEdited(false);
    setPendingContext(null);
  };

  useEffect(() => {
    if (incomingContext === lastIncoming.current) return;
    lastIncoming.current = incomingContext;
    if (!incomingContext) return;
    if (manuallyEdited || changeEdited || body.trim()) setPendingContext(incomingContext);
    else adoptContext(incomingContext);
  }, [incomingContext]);

  useEffect(() => {
    void Promise.all([
      api.listOutboundContacts('active'),
      api.listOutboundTemplates('active'),
      api.listOutboundSignatures('active'),
    ]).then(([nextContacts, nextTemplates, nextSignatures]) => {
      setContacts(nextContacts);
      setTemplates(nextTemplates);
      setSignatures(nextSignatures);
      const desiredType = mailContext?.materialType ?? 'update';
      const preferred = nextTemplates.find((item) => item.materialType === desiredType) ?? nextTemplates[0];
      if (preferred) {
        setTemplateId(String(preferred.id));
        setMaterialType(preferred.materialType);
      }
      const preferredSignature = nextSignatures.find((item) => item.isDefault) ?? nextSignatures[0];
      if (preferredSignature) setSignatureId(String(preferredSignature.id));
    }).catch((error) => setMessage(error instanceof Error ? error.message : '邮件资料加载失败'));
  }, [api, mailContext?.materialType]);

  const template = templates.find((item) => item.id === Number(templateId));
  const signature = signatures.find((item) => item.id === Number(signatureId));
  const toText = contacts.filter((item) => to.includes(item.id)).map((item) => item.email).join('; ');
  const ccText = contacts.filter((item) => cc.includes(item.id)).map((item) => item.email).join('; ');
  const selectedContacts = contacts.filter((item) => to.includes(item.id));
  const optionalText = useMemo(
    () => template?.blocks.filter((item) => blocks.includes(item.id)).map((item) => item.bodyTemplate).join('\n') ?? '',
    [template, blocks],
  );
  const fileList = useMemo(
    () => mailContext?.items.map((item) => `  ${item.fileName.split(/[\\/]/).at(-1)?.replace(/\.pdf$/i, '') ?? item.projectItemName}`).join('\n') ?? '',
    [mailContext],
  );

  const generate = async () => {
    if (!template) return;
    if (manuallyEdited && !window.confirm('重新生成将替换您已修改的主题和正文，是否继续？')) return;
    setMessage('');
    const primary = selectedContacts[0];
    try {
      const rendered = await api.renderOutboundTemplate(template.id, {
        package_name: mailContext?.packageName ?? subject,
        company_name: primary?.company ?? '',
        contact_salutation: primary?.contactName ?? '',
        model: mailContext?.product.model ?? '',
        product_category: mailContext?.product.productCategory ?? '',
        change_description: changeDescription,
        file_list: fileList,
        optional_blocks: optionalText,
        signature: signature?.content ?? '',
      });
      setSubject(rendered.subject);
      setBody(rendered.body);
      setManuallyEdited(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '邮件内容生成失败');
    }
  };

  const toggle = (list: number[], id: number, setter: (value: number[]) => void) => {
    setter(list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);
  };

  return (
    <section className="outbound-panel email-composer">
      {pendingContext && <div className="info-banner">
        新压缩包已生成：{pendingContext.packageName}。当前邮件仍保留原资料和已编辑内容。
        <button type="button" className="text-button" onClick={() => {
          if (window.confirm('使用新压缩包将替换当前邮件主题和修改明细，并清空正文。是否继续？')) adoptContext(pendingContext);
        }}>使用新压缩包资料</button>
      </div>}
      <div className="email-settings-row">
        <label>
          <span>资料类型</span>
          <select
            aria-label="邮件资料类型"
            value={materialType}
            onChange={(event) => {
              const value = event.target.value as OutboundMaterialTypeView;
              setMaterialType(value);
              const next = templates.find((item) => item.materialType === value);
              if (next) {
                setTemplateId(String(next.id));
                setBlocks([]);
              }
            }}
          >
            <option value="initial">首批资料</option>
            <option value="update">更新资料</option>
          </select>
        </label>
        <label>
          <span>邮件模板</span>
          <select aria-label="邮件模板" value={templateId} onChange={(event) => { setTemplateId(event.target.value); setBlocks([]); }}>
            <option value="">请选择</option>
            {templates.filter((item) => item.materialType === materialType).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label>
          <span>签名</span>
          <select aria-label="邮件签名" value={signatureId} onChange={(event) => setSignatureId(event.target.value)}>
            <option value="">不使用</option>
            {signatures.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
          </select>
        </label>
      </div>
      {materialType === 'update' && (
        <label>
          <span>本次变更内容</span>
          <textarea aria-label="本次变更内容" rows={3} value={changeDescription} onChange={(event) => { setChangeDescription(event.target.value); setChangeEdited(true); }} />
        </label>
      )}
      {fileList && <p className="muted-text">邮件文件清单将使用当前打包预览中已勾选的文件。</p>}
      <fieldset>
        <legend>收件人</legend>
        {contacts.map((item) => <label key={`to-${item.id}`}><input type="checkbox" aria-label={`收件人 ${item.contactName}`} checked={to.includes(item.id)} onChange={() => toggle(to, item.id, setTo)} />{item.company} · {item.contactName} · {item.email}</label>)}
      </fieldset>
      <fieldset>
        <legend>抄送</legend>
        {contacts.map((item) => <label key={`cc-${item.id}`}><input type="checkbox" aria-label={`抄送 ${item.contactName}`} checked={cc.includes(item.id)} onChange={() => toggle(cc, item.id, setCc)} />{item.company} · {item.contactName} · {item.email}</label>)}
      </fieldset>
      {template?.blocks.length ? (
        <fieldset>
          <legend>可选附加段落</legend>
          {template.blocks.filter((item) => item.status === 'active').map((item) => <label key={item.id}><input type="checkbox" aria-label={`附加段落 ${item.name}`} checked={blocks.includes(item.id)} onChange={() => toggle(blocks, item.id, setBlocks)} />{item.name}</label>)}
        </fieldset>
      ) : null}
      <button className="secondary-button" type="button" disabled={!templateId} onClick={() => void generate()}>生成邮件内容</button>
      <label><span>收件人</span><input aria-label="收件人文本" readOnly value={toText} /></label>
      <button className="text-button" type="button" onClick={() => void copy(toText, setMessage)}>复制收件人</button>
      <label><span>抄送</span><input aria-label="抄送文本" readOnly value={ccText} /></label>
      <button className="text-button" type="button" onClick={() => void copy(ccText, setMessage)}>复制抄送</button>
      <label><span>主题</span><input aria-label="主题" value={subject} onChange={(event) => { setSubject(event.target.value); setManuallyEdited(true); }} /></label>
      <button className="text-button" type="button" onClick={() => void copy(subject, setMessage)}>复制主题</button>
      <label><span>正文</span><textarea aria-label="正文" rows={14} value={body} onChange={(event) => { setBody(event.target.value); setManuallyEdited(true); }} /></label>
      <button className="text-button" type="button" onClick={() => void copy(body, setMessage)}>复制正文</button>
      <button className="primary-button" type="button" onClick={() => void copy(`收件人：${toText}\n抄送：${ccText}\n主题：${subject}\n正文：\n${body}`, setMessage)}>全部复制</button>
      {message && <p className={message === '已复制' ? 'muted-text' : 'error-banner'}>{message}</p>}
    </section>
  );
}
