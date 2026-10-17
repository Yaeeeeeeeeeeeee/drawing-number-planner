import { useEffect, useState } from 'react';
import { useConfigurationEditor, type RegisterLeaveGuard } from './useConfigurationEditor';
import type { OutboundContactInputView, OutboundContactView, PlannerApi } from '../../data/client';

type ContactForm = Omit<OutboundContactInputView, 'notes'> & { notes: string };
const blank: ContactForm = { company: '', contactName: '', email: '', defaultRecipientType: 'to', notes: '' };

export function ContactsManager({ api, hideDefaultType = false, registerLeaveGuard }: { api: PlannerApi; hideDefaultType?: boolean; registerLeaveGuard?: RegisterLeaveGuard }) {
  const [items, setItems] = useState<OutboundContactView[]>([]);
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState(blank);
  const [error, setError] = useState('');

  const guard = useConfigurationEditor(editing === null ? null : { editing, form }, registerLeaveGuard);
  const begin = (next: number | 'new', value: ContactForm) => guard.begin({ editing: next, form: value }, () => { setEditing(next); setForm(value); });
  const cancel = () => { if (guard.canLeave()) { guard.reset(); setEditing(null); } };
  const load = async () => {
    try {
      setItems(await api.listOutboundContacts('all'));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '联系人加载失败');
    }
  };

  useEffect(() => { void load(); }, [api]);

  const save = async () => {
    setError('');
    try {
      await guard.run(async () => {
      const input = { ...form, notes: form.notes || null };
      if (editing === 'new') await api.createOutboundContact(input);
      else if (typeof editing === 'number') await api.updateOutboundContact(editing, input);
      guard.reset();
      setEditing(null);
      setForm(blank);
      await load();
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '联系人保存失败');
    }
  };

  const changeStatus = async (item: OutboundContactView) => {
    setError('');
    try {
      await guard.run(async () => {
      if (item.status === 'active') await api.deactivateOutboundContact(item.id);
      else await api.activateOutboundContact(item.id);
      await load();
      });
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : '联系人状态更新失败');
    }
  };

  const remove = async (item: OutboundContactView) => {
    if (editing === item.id && !guard.canLeave()) return;
    if (!window.confirm(`确认删除联系人 ${item.contactName}？`)) return;
    setError('');
    try {
      await guard.run(async () => {
      await api.deleteOutboundContact(item.id);
      if (editing === item.id) { guard.reset(); setEditing(null); }
      await load();
      });
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : '联系人删除失败');
    }
  };

  const editor = (
    <form aria-label="联系人编辑" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <fieldset disabled={guard.busy}>
      <label><span>公司</span><input aria-label="公司" required value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} /></label>
      <label><span>称呼</span><input aria-label="称呼" required value={form.contactName} onChange={(event) => setForm({ ...form, contactName: event.target.value })} /></label>
      <label><span>邮箱</span><input aria-label="邮箱" type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
      {!hideDefaultType && <label>
        <span>默认类型</span>
        <select aria-label="默认类型" value={form.defaultRecipientType} onChange={(event) => setForm({ ...form, defaultRecipientType: event.target.value as 'to' | 'cc' })}>
          <option value="to">收件人</option><option value="cc">抄送</option>
        </select>
      </label>}
      <label><span>备注</span><input aria-label="备注" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
      <button className="primary-button" type="submit">保存联系人</button>
      <button className="text-button" type="button" onClick={cancel}>取消</button>
      </fieldset>
    </form>
  );

  return (
    <section className="outbound-panel contacts-manager">
      <div className="ob-config-toolbar"><h3>联系人 · {items.length} 位</h3><button className="primary-button" type="button" disabled={guard.busy} onClick={() => begin('new', { ...blank })}>新增联系人</button></div>
      {error && <p role="alert" className="error-banner">{error}</p>}
      {editing !== null && <div className="ob-config-editor">{editor}</div>}
      <fieldset disabled={guard.busy} className="ob-config-list-fieldset">
      <div className="ob-contacts-table-scroll"><table aria-label="联系人列表" className="ob-contacts-table">
        <thead><tr><th>公司</th><th>称呼</th><th>邮箱</th><th>默认类型</th><th>状态</th><th>操作</th></tr></thead>
        <tbody>{items.map(item => <tr key={item.id}>
          <td>{item.company}</td><td>{item.contactName}</td><td>{item.email}</td>
          <td>{item.defaultRecipientType === 'to' ? '收件人' : '抄送'}</td><td>{item.status === 'active' ? '启用中' : '已停用'}</td>
          <td><div className="ob-config-row-actions">
            <button className="text-button" type="button" onClick={() => begin(item.id, { company: item.company, contactName: item.contactName, email: item.email, defaultRecipientType: item.defaultRecipientType, notes: item.notes ?? '' })}>编辑</button>
            <button className="text-button" type="button" aria-label={`${item.status === 'active' ? '停用' : '启用'} ${item.contactName}`} onClick={() => void changeStatus(item)}>{item.status === 'active' ? '停用' : '启用'}</button>
            <button className="text-button danger" type="button" onClick={() => void remove(item)}>删除</button>
          </div></td>
        </tr>)}</tbody>
      </table>{items.length === 0 && <p className="muted-text">暂无联系人</p>}</div>
      </fieldset>
    </section>
  );
}
