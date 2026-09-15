import { useEffect, useState } from 'react';
import type { OutboundContactInputView, OutboundContactView, PlannerApi } from '../../data/client';

type ContactForm = Omit<OutboundContactInputView, 'notes'> & { notes: string };
const blank: ContactForm = { company: '', contactName: '', email: '', defaultRecipientType: 'to', notes: '' };

export function ContactsManager({ api }: { api: PlannerApi }) {
  const [items, setItems] = useState<OutboundContactView[]>([]);
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState(blank);
  const [error, setError] = useState('');

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
      const input = { ...form, notes: form.notes || null };
      if (editing === 'new') await api.createOutboundContact(input);
      else if (typeof editing === 'number') await api.updateOutboundContact(editing, input);
      setEditing(null);
      setForm(blank);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '联系人保存失败');
    }
  };

  const changeStatus = async (item: OutboundContactView) => {
    setError('');
    try {
      if (item.status === 'active') await api.deactivateOutboundContact(item.id);
      else await api.activateOutboundContact(item.id);
      await load();
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : '联系人状态更新失败');
    }
  };

  const remove = async (item: OutboundContactView) => {
    if (!window.confirm(`确认删除联系人 ${item.contactName}？`)) return;
    setError('');
    try {
      await api.deleteOutboundContact(item.id);
      await load();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : '联系人删除失败');
    }
  };

  const editor = (
    <form aria-label="联系人编辑" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <label><span>公司</span><input aria-label="公司" required value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} /></label>
      <label><span>称呼</span><input aria-label="称呼" required value={form.contactName} onChange={(event) => setForm({ ...form, contactName: event.target.value })} /></label>
      <label><span>邮箱</span><input aria-label="邮箱" type="email" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
      <label>
        <span>默认类型</span>
        <select aria-label="默认类型" value={form.defaultRecipientType} onChange={(event) => setForm({ ...form, defaultRecipientType: event.target.value as 'to' | 'cc' })}>
          <option value="to">收件人</option><option value="cc">抄送</option>
        </select>
      </label>
      <label><span>备注</span><input aria-label="备注" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
      <button className="primary-button" type="submit">保存联系人</button>
      <button className="text-button" type="button" onClick={() => setEditing(null)}>取消</button>
    </form>
  );

  return (
    <section className="outbound-panel contacts-manager">
      <button className="primary-button" type="button" onClick={() => { setEditing('new'); setForm(blank); }}>新增联系人</button>
      {editing === 'new' && editor}
      {error && <p className="error-banner">{error}</p>}
      <div className="contact-list">
        {items.map((item) => (
          <article key={item.id}>
            <div>
              <strong>{item.company} · {item.contactName}</strong>
              <span>{item.email}</span>
              <small>{item.defaultRecipientType === 'to' ? '默认收件人' : '默认抄送'} · {item.status === 'active' ? '启用中' : '已停用'}</small>
            </div>
            <div>
              <button className="text-button" type="button" onClick={() => { setEditing(item.id); setForm({ company: item.company, contactName: item.contactName, email: item.email, defaultRecipientType: item.defaultRecipientType, notes: item.notes ?? '' }); }}>编辑</button>
              <button className="text-button" type="button" aria-label={`${item.status === 'active' ? '停用' : '启用'} ${item.contactName}`} onClick={() => void changeStatus(item)}>{item.status === 'active' ? '停用' : '启用'}</button>
              <button className="text-button danger" type="button" onClick={() => void remove(item)}>删除</button>
            </div>
            {editing === item.id && editor}
          </article>
        ))}
      </div>
    </section>
  );
}
