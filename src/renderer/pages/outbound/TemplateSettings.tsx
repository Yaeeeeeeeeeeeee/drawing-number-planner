import { useEffect, useRef, useState } from 'react';
import { useConfigurationEditor, type RegisterLeaveGuard } from './useConfigurationEditor';
import type {
  OutboundEmailTemplateInputView,
  OutboundEmailTemplateView,
  OutboundSignatureInputView,
  OutboundSignatureView,
  OutboundTemplateBlockInputView,
  OutboundTemplateBlockView,
  PlannerApi,
} from '../../data/client';

const blankTemplate: OutboundEmailTemplateInputView = {
  key: '', name: '', materialType: 'initial', subjectTemplate: '', bodyTemplate: '',
};
const blankBlock: OutboundTemplateBlockInputView = { key: '', name: '', bodyTemplate: '', displayOrder: 0 };
const blankSignature: OutboundSignatureInputView = { name: '', content: '', isDefault: false };

const previewFields = [
  ['package_name', '外发包名称', 'F60-包材资料-1001'],
  ['contact_salutation', '联系人称呼', '张工'],
  ['change_files', '资料与修改明细', '1. 包装箱：更新文字与排版。\n　新文件：F60白色-包装箱（转曲）'],
  ['package_files', '分包附件', '分包附件：\nF60-包材资料-1001-part01\nF60-包材资料-1001-part02'],
  ['optional_blocks', '附加段落', '请核对资料后安排生产。'],
  ['brand', '品牌', 'SAMKYO'], ['model', '产品型号', 'F60'], ['category', '产品类别', '空气炸锅'],
  ['date', '日期', '2026-10-26'], ['batch', '资料批次', '首批资料'], ['count', '压缩包数量', '2'],
] as const;
const legacySamples: Record<string, string> = { brand_name: 'SAMKYO', product_category: '空气炸锅', company_name: '厂家A', file_list: '包装箱.pdf', change_description: '更新包装箱', signature: '样例项目组' };
const samplePreview = (text: string) => text.replace(/\{\{\s*(\w+)\s*\}\}/g, (token, key: string) => previewFields.find(field => field[0] === key)?.[2] ?? legacySamples[key] ?? token);

export function TemplateSettings({ api, fieldHelper = true, mode, registerLeaveGuard }: { api: PlannerApi; fieldHelper?: boolean; mode?: 'templates' | 'signatures'; registerLeaveGuard?: RegisterLeaveGuard }) {
  const templateFormRef = useRef<HTMLFormElement>(null);
  const [insertTarget, setInsertTarget] = useState<'subjectTemplate' | 'bodyTemplate'>('bodyTemplate');
  const [templates, setTemplates] = useState<OutboundEmailTemplateView[]>([]);
  const [signatures, setSignatures] = useState<OutboundSignatureView[]>([]);
  const [message, setMessage] = useState('');
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [editTemplate, setEditTemplate] = useState<OutboundEmailTemplateInputView & { id?: number } | null>(null);
  const [blockEditor, setBlockEditor] = useState<{ templateId: number; id?: number; form: OutboundTemplateBlockInputView } | null>(null);
  const [editSignature, setEditSignature] = useState<OutboundSignatureInputView & { id?: number } | null>(null);

  const editorValue = editTemplate ? { template: editTemplate } : blockEditor ? { block: blockEditor } : editSignature ? { signature: editSignature } : null;
  const guard = useConfigurationEditor(editorValue, registerLeaveGuard);
  const beginTemplate = (value: NonNullable<typeof editTemplate>) => guard.begin({ template: value }, () => { setBlockEditor(null); setEditSignature(null); setEditTemplate(value); });
  const beginSignature = (value: NonNullable<typeof editSignature>) => guard.begin({ signature: value }, () => { setEditTemplate(null); setBlockEditor(null); setEditSignature(value); });
  const beginBlock = (value: NonNullable<typeof blockEditor>) => guard.begin({ block: value }, () => { setEditTemplate(null); setEditSignature(null); setBlockEditor(value); });
  const cancel = () => { if (guard.canLeave()) { guard.reset(); setEditTemplate(null); setBlockEditor(null); setEditSignature(null); } };
  const load = async () => {
    const [nextTemplates, nextSignatures] = await Promise.all([
      api.listOutboundTemplates('all'),
      api.listOutboundSignatures('all'),
    ]);
    setTemplates(nextTemplates);
    setSignatures(nextSignatures);
  };

  useEffect(() => {
    void load().catch((error) => setMessage(error instanceof Error ? error.message : '模板设置加载失败'));
  }, [api]);

  const run = async (operation: () => Promise<unknown>): Promise<boolean> => {
    setMessage('');
    try {
      return await guard.run(async () => {
        await operation();
        // Persistence succeeded: a failed read must never invite replaying the write.
        try { await load(); setRefreshFailed(false); }
        catch (error) {
          setRefreshFailed(true);
          setMessage(`已保存，但列表刷新失败：${error instanceof Error ? error.message : '请重新加载列表'}`);
        }
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : '操作失败';
      setMessage(reason);
      const field = ['模板编码', '模板名称', '模板资料类型', '主题模板', '正文模板'].find(label => reason.includes(label)) ?? (reason.includes('变量') ? '正文模板' : null);
      if (field) templateFormRef.current?.querySelector<HTMLElement>(`[aria-label="${field}"]`)?.focus();
      return false;
    }
  };

  const reload = async () => {
    try {
      await guard.run(async () => { await load(); setRefreshFailed(false); setMessage(''); });
    } catch (error) {
      setMessage(`列表刷新失败：${error instanceof Error ? error.message : '请稍后重试'}`);
    }
  };

  const remove = async (label: string, operation: () => Promise<unknown>, editsDeletedRecord: boolean) => {
    if (editsDeletedRecord && !guard.canLeave()) return;
    if (!window.confirm(`确认删除${label}？`)) return;
    const ok = await run(operation);
    if (ok && editsDeletedRecord) { guard.reset(); setEditTemplate(null); setBlockEditor(null); setEditSignature(null); }
  };

  const fieldError = (label: string) => message.includes(label) ? <span className="ob-field-error" role="alert">{message}</span> : null;
  const templateForm = (value: OutboundEmailTemplateInputView & { id?: number }) => (
    <form
      ref={templateFormRef}
      aria-label="邮件模板编辑"
      onSubmit={(event) => {
        event.preventDefault();
        void (async () => {
          const input = { manufacturer: value.manufacturer, scenario: value.scenario, key: value.key, name: value.name, materialType: value.materialType, subjectTemplate: value.subjectTemplate, bodyTemplate: value.bodyTemplate };
          const ok = await run(() => value.id ? api.updateOutboundTemplate(value.id, input) : api.createOutboundTemplate(input));
          if (ok) { guard.reset(); setEditTemplate(null); }
        })();
      }}
    >
      <fieldset disabled={guard.busy}>
      <label><span>模板编码</span>{fieldError('模板编码')}<input aria-label="模板编码" required value={value.key} onChange={(event) => setEditTemplate({ ...value, key: event.target.value })} /></label>
      <label><span>模板名称</span>{fieldError('模板名称')}<input aria-label="模板名称" required value={value.name} onChange={(event) => setEditTemplate({ ...value, name: event.target.value })} /></label>
      <label>
        <span>资料类型</span>
        <select aria-label="模板资料类型" value={value.materialType} onChange={(event) => setEditTemplate({ ...value, materialType: event.target.value as 'initial' | 'update' })}>
          <option value="initial">首批资料</option><option value="update">更新资料</option>
        </select>
      </label>
      <label><span>适用厂家</span><input aria-label="适用厂家" value={value.manufacturer ?? ''} onChange={event => setEditTemplate({ ...value, manufacturer: event.target.value })} /></label>
      <label><span>邮件场景</span><input aria-label="邮件场景" list="mail-scenarios" value={value.scenario ?? ''} onChange={event => setEditTemplate({ ...value, scenario: event.target.value })} /><datalist id="mail-scenarios">{['首批资料', '铭牌待更新', '补充铭牌', '正式铭牌', '完整资料交付', '更新资料'].map(name => <option key={name} value={name} />)}</datalist></label>
      <label><span>主题模板</span>{fieldError('主题模板')}<input aria-label="主题模板" required value={value.subjectTemplate} onChange={(event) => setEditTemplate({ ...value, subjectTemplate: event.target.value })} /></label>
      <label><span>正文模板</span>{fieldError('正文模板')}<textarea aria-label="正文模板" rows={6} required value={value.bodyTemplate} onChange={(event) => setEditTemplate({ ...value, bodyTemplate: event.target.value })} /></label>
      {(fieldHelper || mode === 'templates') && <div className="ob-template-helper">
        <div className="ob-template-insert"><label>插入到<select aria-label="字段插入位置" value={insertTarget} onChange={event => setInsertTarget(event.target.value as 'subjectTemplate' | 'bodyTemplate')}><option value="subjectTemplate">主题</option><option value="bodyTemplate">正文</option></select></label>{previewFields.map(([key, label]) => { const pattern = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g'); const present = new RegExp(pattern.source).test(value[insertTarget]); return <button className={`text-button ${present ? 'is-inserted' : ''}`} aria-pressed={present} type="button" key={key} onClick={() => setEditTemplate({ ...value, [insertTarget]: present ? value[insertTarget].replace(pattern, '') : `${value[insertTarget]}${insertTarget === 'bodyTemplate' && value[insertTarget] ? '\n' : ''}{{${key}}}` })}>{label} · {present ? '移除' : '添加'}</button>; })}</div>
        <details className="ob-template-preview" open><summary>样例效果预览</summary><div className="ob-template-preview-content"><strong>{samplePreview(value.subjectTemplate) || '（主题未填写）'}</strong><pre>{samplePreview(value.bodyTemplate) || '（正文未填写）'}</pre></div></details>
      </div>}
      <button className="primary-button" type="submit">保存模板</button>
      <button className="text-button" type="button" onClick={cancel}>取消</button>
      </fieldset>
    </form>
  );

  const blockForm = (editor: NonNullable<typeof blockEditor>) => (
    <form
      aria-label="附加段落编辑"
      onSubmit={(event) => {
        event.preventDefault();
        void (async () => {
          const ok = await run(() => editor.id
            ? api.updateOutboundTemplateBlock(editor.id, { name: editor.form.name, bodyTemplate: editor.form.bodyTemplate, displayOrder: editor.form.displayOrder })
            : api.createOutboundTemplateBlock(editor.templateId, editor.form));
          if (ok) { guard.reset(); setBlockEditor(null); }
        })();
      }}
    >
      <fieldset disabled={guard.busy}>
      {!editor.id && <label><span>段落编码</span><input aria-label="段落编码" required value={editor.form.key} onChange={(event) => setBlockEditor({ ...editor, form: { ...editor.form, key: event.target.value } })} /></label>}
      <label><span>段落名称</span><input aria-label="段落名称" required value={editor.form.name} onChange={(event) => setBlockEditor({ ...editor, form: { ...editor.form, name: event.target.value } })} /></label>
      <label><span>邮件中插入的内容</span><textarea aria-label="段落内容" rows={3} required value={editor.form.bodyTemplate} onChange={(event) => setBlockEditor({ ...editor, form: { ...editor.form, bodyTemplate: event.target.value } })} /></label>
      <label><span>排列顺序</span><input aria-label="显示顺序" type="number" value={editor.form.displayOrder} onChange={(event) => setBlockEditor({ ...editor, form: { ...editor.form, displayOrder: Number(event.target.value) } })} /></label>
      <button className="primary-button" type="submit">保存附加段落</button>
      <button className="text-button" type="button" onClick={cancel}>取消</button>
      </fieldset>
    </form>
  );

  const signatureForm = (value: OutboundSignatureInputView & { id?: number }) => (
    <form
      aria-label="签名编辑"
      onSubmit={(event) => {
        event.preventDefault();
        void (async () => {
          const input = { name: value.name, content: value.content, isDefault: value.isDefault };
          const ok = await run(() => value.id ? api.updateOutboundSignature(value.id, input) : api.createOutboundSignature(input));
          if (ok) { guard.reset(); setEditSignature(null); }
        })();
      }}
    >
      <fieldset disabled={guard.busy}>
      <label><span>签名名称</span><input aria-label="签名名称" required value={value.name} onChange={(event) => setEditSignature({ ...value, name: event.target.value })} /></label>
      <label><span>签名内容</span><textarea aria-label="签名内容" required value={value.content} onChange={(event) => setEditSignature({ ...value, content: event.target.value })} /></label>
      <label><input type="checkbox" checked={value.isDefault} onChange={(event) => setEditSignature({ ...value, isDefault: event.target.checked })} />设为默认</label>
      <button className="primary-button" type="submit">保存签名</button>
      <button className="text-button" type="button" onClick={cancel}>取消</button>
      </fieldset>
    </form>
  );

  const beginBlockEdit = (templateId: number, block: OutboundTemplateBlockView) => {
    beginBlock({ templateId, id: block.id, form: { key: block.key, name: block.name, bodyTemplate: block.bodyTemplate, displayOrder: block.displayOrder } });
  };

  return (
    <section className="template-settings">
      <h3>{mode === 'signatures' ? '邮件签名' : '邮件模板'}</h3>

      {message && !(editTemplate && ['模板编码', '模板名称', '主题模板', '正文模板'].some(label => message.includes(label))) && <p role="alert" className="error-banner">{message}</p>}
      {refreshFailed && <button type="button" className="text-button" disabled={guard.busy} onClick={() => void reload()}>重新加载列表</button>}
      {(editTemplate || blockEditor || editSignature) && <div className="ob-config-editor">{editTemplate && templateForm(editTemplate)}{blockEditor && blockForm(blockEditor)}{editSignature && signatureForm(editSignature)}</div>}
      <fieldset disabled={guard.busy} className="ob-config-list-fieldset">
      <div className="settings-columns">
        {mode !== 'signatures' && <section>
          <h4>邮件模板</h4>
          <button className="primary-button" type="button" onClick={() => beginTemplate({ ...blankTemplate })}>新增邮件模板</button>
          {templates.length === 0 && <p className="muted-text">暂无邮件模板</p>}
          {templates.map((item) => (
            <article key={item.id}>
              <strong>{item.name}</strong><small className="ob-template-classification">{[item.manufacturer, item.scenario].filter(Boolean).join(" · ")}</small>
              <small><span className={`ob-template-status ${item.status}`}>{item.status === 'active' ? '启用中' : '已停用'}</span></small>
              <div>
                <button className="text-button" type="button" aria-label={`编辑模板 ${item.name}`} onClick={() => beginTemplate({ id: item.id, manufacturer: item.manufacturer, scenario: item.scenario, key: item.key, name: item.name, materialType: item.materialType, subjectTemplate: item.subjectTemplate, bodyTemplate: item.bodyTemplate })}>编辑</button>
                <button className="text-button" type="button" onClick={() => void run(() => item.status === 'active' ? api.deactivateOutboundTemplate(item.id) : api.activateOutboundTemplate(item.id))}>{item.status === 'active' ? '停用' : '启用'}</button>
                <button className="text-button danger" type="button" onClick={() => void remove(`模板 ${item.name}`, () => api.deleteOutboundTemplate(item.id), editTemplate?.id === item.id || blockEditor?.templateId === item.id)}>删除</button>
              </div>
              <details>
                <summary>附加段落</summary>
                {item.blocks.map((block) => (
                  <div key={block.id}>
                    <span>{block.name} · {block.status === 'active' ? '启用中' : '已停用'}</span>
                    <button className="text-button" type="button" aria-label={`编辑附加段落 ${block.name}`} onClick={() => beginBlockEdit(item.id, block)}>编辑</button>
                    <button className="text-button" type="button" aria-label={`${block.status === 'active' ? '停用' : '启用'}附加段落 ${block.name}`} onClick={() => void run(() => block.status === 'active' ? api.deactivateOutboundTemplateBlock(block.id) : api.activateOutboundTemplateBlock(block.id))}>{block.status === 'active' ? '停用' : '启用'}</button>
                    <button className="text-button danger" type="button" onClick={() => void remove(`附加段落 ${block.name}`, () => api.deleteOutboundTemplateBlock(block.id), blockEditor?.id === block.id)}>删除</button>
                  </div>
                ))}
                <button className="text-button" type="button" aria-label={`新增附加段落到 ${item.name}`} onClick={() => beginBlock({ templateId: item.id, form: { ...blankBlock, displayOrder: item.blocks.length } })}>新增附加段落</button>
              </details>
            </article>
          ))}
        </section>}
        {mode !== 'templates' && <section>
          <h4>邮件签名</h4>
          <button className="primary-button" type="button" onClick={() => beginSignature({ ...blankSignature })}>新增邮件签名</button>
          {signatures.length === 0 && <p className="muted-text">暂无邮件签名</p>}
          {signatures.map((item) => (
            <article key={item.id}>
              <strong>{item.name}{item.isDefault ? ' · 默认' : ''}</strong>
              <small>{item.status === 'active' ? '启用中' : '已停用'}</small>
              <div>
                <button className="text-button" type="button" aria-label={`编辑签名 ${item.name}`} onClick={() => beginSignature({ id: item.id, name: item.name, content: item.content, isDefault: item.isDefault })}>编辑</button>
                <button className="text-button" type="button" onClick={() => void run(() => item.status === 'active' ? api.deactivateOutboundSignature(item.id) : api.activateOutboundSignature(item.id))}>{item.status === 'active' ? '停用' : '启用'}</button>
                <button className="text-button danger" type="button" onClick={() => void remove(`签名 ${item.name}`, () => api.deleteOutboundSignature(item.id), editSignature?.id === item.id)}>删除</button>
              </div>
              <details><summary>查看签名</summary><pre>{item.content}</pre></details>
            </article>
          ))}
        </section>}
      </div>
      </fieldset>
    </section>
  );
}
