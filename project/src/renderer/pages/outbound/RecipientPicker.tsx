import { useState } from 'react';
import type { OutboundContactView } from '../../data/client';

export function RecipientPicker({label,contacts,selected,onChange}:{label:string;contacts:OutboundContactView[];selected:number[];onChange:(ids:number[])=>void}) {
  const [company,setCompany]=useState('');
  const companies=[...new Set(contacts.map(item=>item.company))];
  const visible=contacts.filter(item=>!company||item.company===company);
  const chosen=contacts.filter(item=>selected.includes(item.id));
  const toggle=(id:number)=>onChange(selected.includes(id)?selected.filter(value=>value!==id):[...selected,id]);
  return <fieldset className="ob-recipient-picker"><legend>{label}</legend>
    <div className="ob-recipient-filter"><label><span>筛选公司</span><select aria-label={`${label}筛选公司`} value={company} onChange={event=>setCompany(event.target.value)}><option value="">全部公司</option>{companies.map(value=><option key={value}>{value}</option>)}</select></label><span className="ob-muted">{visible.length} 位人员 · 已选 {chosen.length} 位</span></div>
    <div className="ob-recipient-options-branch"><div className="ob-recipient-options">{visible.map(item=><label key={item.id}><input type="checkbox" aria-label={`${label} ${item.contactName}`} checked={selected.includes(item.id)} onChange={()=>toggle(item.id)}/><span><strong>{item.contactName}</strong><small>{item.company} · {item.email}</small></span></label>)}{!visible.length&&<p className="ob-muted">该公司暂无可选人员，请更换公司。</p>}</div></div>
  </fieldset>;
}
