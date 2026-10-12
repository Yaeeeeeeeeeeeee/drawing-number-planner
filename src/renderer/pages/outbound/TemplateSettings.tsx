import { useEffect, useState } from 'react';
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
  ['signature', '邮件签名', '样例项目组'],
] as const;
const samplePreview = (text: string) => text.replace(/\{\{\s*(\w+)\s*\}\}/g, (token, key: string) => previewFields.find(field => field[0] === key)?.[2] ?? token);

export function TemplateSettings({ api, fieldHelper = false }: { api: PlannerApi; fieldHelper?: boolean }) {
  const [insertTarget, setInsertTarget] = useState<'subjectTemplate' | 'bodyTemplate'>('bodyTemplate');
  const [templates, setTemplates] = useState<OutboundEmailTemplateView[]>([]);
  const [signatures, setSignatures] = useState<OutboundSignatureView[]>([]);
  const [message, setMessage] = useState('');
  const [editTemplate, setEditTemplate] = useState<OutboundEmailTemplateInputView & { id?: number } | null>(null);
  const [blockEditor, setBlockEditor] = useState<{ templateId: number; id?: number; form: OutboundTemplateBlockInputView } | null>(null);
  const [editSignature, setEditSignature] = useState<OutboundSignatureInputView & { id?: number } | null>(null);

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
      await operation();
      await load();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '操作失败');
      return false;
    }
  };

  const templateForm = (value: OutboundEmailTemplateInputView & { id?: number }) => (
    <form
      aria-label="邮件模板编辑"
      onSubmit={(event) => {
        event.preventDefault();
        void (async () => {
          const input = { key: value.key, name: value.name, materialType: value.materialType, subjectTemplate: value.subjectTemplate, bodyTemplate: value.bodyTemplate };
          const ok = await run(() => value.id ? api.updateOutboundTemplate(value.id, input) : api.createOutboundTemplate(input));
          if (ok) setEditTemplate(null);
        })();
      }}
    >
      <label><span>模板编码</span><input aria-label="模板编码" required value={value.key} onChange={(event) => setEditTemplate({ ...value, key: event.target.value })} /></label>
      <label><span>模板名称</span><input aria-label="模板名称" required value={value.name} onChange={(event) => setEditTemplate({ ...value, name: event.target.value })} /></label>
      <label>
        <span>资料类型</span>
        <select aria-label="模板资料类型" value={value.materialType} onChange={(event) => setEditTemplate({ ...value, materialType: event.target.value as 'initial' | 'update' })}>
          <option value="initial">首批资料</option><option value="update">更新资料</option>
        </select>
      </label>
      <label><span>主题模板</span><input aria-label="主题模板" required value={value.subjectTemplate} onChange={(event) => setEditTemplate({ ...value, subjectTemplate: event.target.value })} /></label>
      <label><span>正文模板</span><textarea aria-label="正文模板" rows={6} required value={value.bodyTemplate} onChange={(event) => setEditTemplate({ ...value, bodyTemplate: event.target.value })} /></label>
      {fieldHelper && <div className="ob-template-helper">
        <div className="ob-template-insert"><label>插入到<select aria-label="字段插入位置" value={insertTarget} onChange={event => setInsertTarget(event.target.value as 'subjectTemplate' | 'bodyTemplate')}><option value="subjectTemplate">主题</option><option value="bodyTemplate">正文</option></select></label>{previewFields.map(([key, label]) => { const pattern = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g'); const present = new RegExp(pattern.source).test(value[insertTarget]); return <button className={`text-button ${present ? 'is-inserted' : ''}`} aria-pressed={present} type="button" key={key} onClick={() => setEditTemplate({ ...value, [insertTarget]: present ? value[insertTarget].replace(pattern, '') : `${value[insertTarget]}${insertTarget === 'bodyTemplate' && value[insertTarget] ? '\n' : ''}{{${key}}}` })}>{label} · {present ? '移除' : '添加'}</button>; })}</div>
        <details className="ob-template-preview" open><summary>样例效果预览</summary><div className="ob-template-preview-content"><strong>{samplePreview(value.subjectTemplate) || '（主题未填写）'}</strong><pre>{samplePreview(value.bodyTemplate) || '（正文未填写）'}</pre></div></details>
      </div>}
      <button className="primary-button" type="submit">保存模板</button>
      <button className="text-button" type="button" onClick={() => setEditTemplate(null)}>取消</button>
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
          if (ok) setBlockEditor(null);
        })();
      }}
    >
      {!editor.id && <label><span>段落编码</span><input aria-label="段落编码" required value={editor.form.key} onChange={(event) => setBlockEditor({ ...editor, form: { ...editor.form, key: event.target.value } })} /></label>}
      <label><span>段落名称</span><input aria-label="段落名称" required value={editor.form.name} onChange={(event) => setBlockEditor({ ...editor, form: { ...editor.form, name: event.target.value } })} /></label>
      <label><span>邮件中插入的内容</span><textarea aria-label="段落内容" rows={3} required value={editor.form.bodyTemplate} onChange={(event) => setBlockEditor({ ...editor, form: { ...editor.form, bodyTemplate: event.target.value } })} /></label>
      <label><span>排列顺序</span><input aria-label="显示顺序" type="number" value={editor.form.displayOrder} onChange={(event) => setBlockEditor({ ...editor, form: { ...editor.form, displayOrder: Number(event.target.value) } })} /></label>
      <button className="primary-button" type="submit">保存附加段落</button>
      <button className="text-button" type="button" onClick={() => setBlockEditor(null)}>取消</button>
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
          if (ok) setEditSignature(null);
        })();
      }}
    >
      <label><span>签名名称</span><input aria-label="签名名称" required value={value.name} onChange={(event) => setEditSignature({ ...value, name: event.target.value })} /></label>
      <label><span>签名内容</span><textarea aria-label="签名内容" required value={value.content} onChange={(event) => setEditSignature({ ...value, content: event.target.value })} /></label>
      <label><input type="checkbox" checked={value.isDefault} onChange={(event) => setEditSignature({ ...value, isDefault: event.target.checked })} />设为默认</label>
      <button className="primary-button" type="submit">保存签名</button>
      <button className="text-button" type="button" onClick={() => setEditSignature(null)}>取消</button>
    </form>
  );

  const beginBlockEdit = (templateId: number, block: OutboundTemplateBlockView) => {
    setBlockEditor({ templateId, id: block.id, form: { key: block.key, name: block.name, bodyTemplate: block.bodyTemplate, displayOrder: block.displayOrder } });
  };

  return (
    <section className="template-settings">
      <h3>邮件模板与签名</h3>
      <p className="muted-text">模板中的可变字段由系统校验，特殊说明使用附加段落管理。</p>
      {message && <p className="error-banner">{message}</p>}
      <div className="settings-columns">
        <section>
          <h4>邮件模板</h4>
          <button className="primary-button" type="button" onClick={() => setEditTemplate({ ...blankTemplate })}>新增邮件模板</button>
          {editTemplate && !editTemplate.id && templateForm(editTemplate)}
          {templates.map((item) => (
            <article key={item.id}>
              <strong>{item.name}</strong>
              <small><span className={`ob-template-status ${item.status}`}>{item.status === 'active' ? '启用中' : '已停用'}</span></small>
              <div>
                <button className="text-button" type="button" aria-label={`编辑模板 ${item.name}`} onClick={() => setEditTemplate({ id: item.id, key: item.key, name: item.name, materialType: item.materialType, subjectTemplate: item.subjectTemplate, bodyTemplate: item.bodyTemplate })}>编辑</button>
                <button className="text-button" type="button" onClick={() => void run(() => item.status === 'active' ? api.deactivateOutboundTemplate(item.id) : api.activateOutboundTemplate(item.id))}>{item.status === 'active' ? '停用' : '启用'}</button>
                <button className="text-button danger" type="button" onClick={() => window.confirm(`确认删除模板 ${item.name}？`) && void run(() => api.deleteOutboundTemplate(item.id))}>删除</button>
              </div>
              {editTemplate?.id === item.id && templateForm(editTemplate)}
              <details>
                <summary>附加段落</summary>
                {item.blocks.map((block) => (
                  <div key={block.id}>
                    <span>{block.name} · {block.status === 'active' ? '启用中' : '已停用'}</span>
                    <button className="text-button" type="button" aria-label={`编辑附加段落 ${block.name}`} onClick={() => beginBlockEdit(item.id, block)}>编辑</button>
                    <button className="text-button" type="button" aria-label={`${block.status === 'active' ? '停用' : '启用'}附加段落 ${block.name}`} onClick={() => void run(() => block.status === 'active' ? api.deactivateOutboundTemplateBlock(block.id) : api.activateOutboundTemplateBlock(block.id))}>{block.status === 'active' ? '停用' : '启用'}</button>
                    <button className="text-button danger" type="button" onClick={() => window.confirm(`确认删除附加段落 ${block.name}？`) && void run(() => api.deleteOutboundTemplateBlock(block.id))}>删除</button>
                    {blockEditor?.id === block.id && blockForm(blockEditor)}
                  </div>
                ))}
                <button className="text-button" type="button" aria-label={`新增附加段落到 ${item.name}`} onClick={() => setBlockEditor({ templateId: item.id, form: { ...blankBlock, displayOrder: item.blocks.length } })}>新增附加段落</button>
                {blockEditor?.templateId === item.id && !blockEditor.id && blockForm(blockEditor)}
              </details>
            </article>
          ))}
        </section>
        <section>
          <h4>邮件签名</h4>
          <button className="primary-button" type="button" onClick={() => setEditSignature({ ...blankSignature })}>新增邮件签名</button>
          {editSignature && !editSignature.id && signatureForm(editSignature)}
          {signatures.map((item) => (
            <article key={item.id}>
              <strong>{item.name}{item.isDefault ? ' · 默认' : ''}</strong>
              <pre>{item.content}</pre>
              <div>
                <button className="text-button" type="button" aria-label={`编辑签名 ${item.name}`} onClick={() => setEditSignature({ id: item.id, name: item.name, content: item.content, isDefault: item.isDefault })}>编辑</button>
                <button className="text-button" type="button" onClick={() => void run(() => item.status === 'active' ? api.deactivateOutboundSignature(item.id) : api.activateOutboundSignature(item.id))}>{item.status === 'active' ? '停用' : '启用'}</button>
                <button className="text-button danger" type="button" onClick={() => window.confirm(`确认删除签名 ${item.name}？`) && void run(() => api.deleteOutboundSignature(item.id))}>删除</button>
              </div>
              {editSignature?.id === item.id && signatureForm(editSignature)}
            </article>
          ))}
        </section>
      </div>
    </section>
  );
}
