import { useState } from 'react';
import { resolvePackagingDimensions } from '../../../core/packaging/packaging-matcher';
import type { PackagingCatalog, PackagingTaskItemInput } from '../../../core/packaging/packaging-types';
import type { PackagingApi } from '../../data/packaging-client';
import { modeLabels, ParameterValues } from './PackagingEditors';
import './PlanningDimensions.css';

export function planningItemSettings(catalog:PackagingCatalog,productId:number,projectItemId:number):PackagingTaskItemInput {
  const profile=resolvePackagingDimensions(catalog,productId,projectItemId).defaultProfile;
  return {mode:catalog.configs.find(c=>c.projectItemId===projectItemId)?.mode??'manual',dimensionProfileId:profile?.id,parameters:{...profile?.parameters},ratioLocked:Boolean(profile?.ratioKeys)};
}

export function PlanningDimensions({api,catalog,productId,projectItemId,index,value,disabled,onChange,onSaved}:{api:PackagingApi;catalog:PackagingCatalog;productId:number;projectItemId:number;index:number;value:PackagingTaskItemInput;disabled:boolean;onChange(value:PackagingTaskItemInput):void;onSaved():Promise<void>}) {
  const {profiles}=resolvePackagingDimensions(catalog,productId,projectItemId);
  const profile=profiles.find(p=>p.id===value.dimensionProfileId);
  const definitions=catalog.configs.find(c=>c.projectItemId===projectItemId)?.parameters??[];
  const [name,setName]=useState('');const [makeDefault,setMakeDefault]=useState(false);const [saving,setSaving]=useState(false);const [message,setMessage]=useState('');
  return <fieldset className="planning-dimensions" aria-label={`第 ${index+1} 行本次尺寸`} disabled={disabled||saving}>
    <legend>本次尺寸 · {modeLabels[value.mode??'manual']}</legend>
    <label>尺寸规格<select value={value.dimensionProfileId??''} onChange={event=>{const next=profiles.find(p=>p.id===Number(event.target.value));onChange({...value,dimensionProfileId:next?.id,parameters:next?{...next.parameters}:{...value.parameters},ratioLocked:Boolean(next?.ratioKeys)});}}><option value="">本次临时参数</option>{profiles.map(p=><option key={p.id} value={p.id}>{p.name} · {p.scope==='specific'?'指定':'通用'}{p.isDefault&&(p.defaultProductIds?.includes(productId)??true)?' · 默认':''}</option>)}</select></label>
    <ParameterValues definitions={definitions} value={value.parameters??{}} onChange={parameters=>onChange({...value,parameters})} ratioKeys={value.ratioLocked?profile?.ratioKeys:undefined} ratio={profile?.ratio}/>
    {profile?.ratioKeys&&<label className="pkg-check"><input type="checkbox" checked={Boolean(value.ratioLocked)} onChange={event=>onChange({...value,ratioLocked:event.target.checked})}/>锁定比例 {profile.ratioKeys.join(' / ')} = {profile.ratio}</label>}
    <p className="pkg-muted">临时修改只用于本次制图，不会自动覆盖尺寸档案。</p>
    <details><summary>将本次尺寸另存为规格</summary><div className="pkg-fields"><label>新规格名称<input value={name} onChange={event=>setName(event.target.value)}/></label><label className="pkg-check"><input type="checkbox" checked={makeDefault} onChange={event=>setMakeDefault(event.target.checked)}/>设为此产品默认</label></div>
      <button type="button" disabled={!name.trim()} onClick={async()=>{setSaving(true);setMessage('');onChange(value);try{await api.saveDimension({name:name.trim(),projectItemId,scope:'specific',productIds:[productId],parameters:{...value.parameters},isDefault:makeDefault,status:'active',...(value.ratioLocked&&profile?.ratioKeys?{ratioKeys:profile.ratioKeys,ratio:profile.ratio}:{})});await onSaved();setMessage('已另存尺寸档案；本次参数保持不变');}catch(reason){setMessage(reason instanceof Error?reason.message:'尺寸保存失败');}finally{setSaving(false);}}}>另存尺寸规格</button>
    </details>{message&&<p role="status">{message}</p>}
  </fieldset>;
}
