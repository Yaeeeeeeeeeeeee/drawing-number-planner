import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useModalFocus } from '../../components/useModalFocus';
import type { DictionaryItemView, ProductView } from '../../data/client';
import type { PackagingApi } from '../../data/packaging-client';
import type { PackagingCatalog, PackagingMode, PackagingParameter, PackagingParameters, PackagingProjectConfig, PackagingTemplate, PackagingTemplateInput, TemplateCondition, TemplateRule, TemplateRuleInput } from '../../../core/packaging/packaging-types';

import { axisLabels, dimensionDefinitions, dimensionLabel, matchingBasis, resolveParameterAxis, type DimensionAxis, type MatchingBasis } from './packaging-dimensions';

export const modeLabels:Record<PackagingMode,string>={ait:'AIT 自动生成',manual:'人工制作',existing:'使用现成文件',none:'无需生成文件'};
export const productLabel=(product:ProductView)=>`${product.sku??'SKU待补录'} · ${product.model} · ${product.brandName}`;
export interface PackagingLookups {products:ProductView[];projects:DictionaryItemView[];mains:DictionaryItemView[];brands:DictionaryItemView[]}
export function ProductChecks({products,value,onChange,label='适用产品型号'}:{products:ProductView[];value:number[];onChange(value:number[]):void;label?:string}) {
  const [search,setSearch]=useState('');
  return <fieldset className="pkg-products"><legend>{label}</legend><input aria-label={`${label}搜索`} placeholder="搜索型号 / SKU / 品牌" value={search} onChange={event=>setSearch(event.target.value)}/><div>{products.filter(p=>productLabel(p).toLowerCase().includes(search.toLowerCase())).map(p=><label key={p.id}><input type="checkbox" checked={value.includes(p.id)} onChange={event=>onChange(event.target.checked?[...value,p.id]:value.filter(id=>id!==p.id))}/>{productLabel(p)}</label>)}</div></fieldset>;
}
export function ParameterValues({definitions,value,onChange,ratioKeys,ratio,disabled=false}:{definitions:PackagingParameter[];value:PackagingParameters;onChange(value:PackagingParameters):void;ratioKeys?:[string,string];ratio?:number;disabled?:boolean}) {
  const all:PackagingParameter[]=[...definitions,...Object.keys(value).filter(key=>!definitions.some(d=>d.key===key)).map(key=>({key,label:key,type:typeof value[key]==='number'?'number' as const:'text' as const,required:false}))];
  return <div className="pkg-fields">{all.map(parameter=><label key={parameter.key}><span>{parameter.label}{parameter.unit?` (${parameter.unit})`:''}{parameter.required?' *':''}</span><input aria-label={`${parameter.label}${parameter.unit?` (${parameter.unit})`:''}`} type={parameter.type==='number'?'number':'text'} step="any" required={parameter.required} disabled={disabled} value={value[parameter.key]??''} onChange={event=>{
    const next={...value};if(event.target.value==='')delete next[parameter.key];else next[parameter.key]=parameter.type==='number'?Number(event.target.value):event.target.value;
    if(ratioKeys&&ratio&&parameter.type==='number'&&event.target.value){if(parameter.key===ratioKeys[0])next[ratioKeys[1]]=Number(event.target.value)/ratio;else if(parameter.key===ratioKeys[1])next[ratioKeys[0]]=Number(event.target.value)*ratio;}
    onChange(next);
  }}/></label>)}</div>;
}
function Status({value,onChange}:{value:'active'|'inactive';onChange(value:'active'|'inactive'):void}) {return <label>启用状态<select value={value} onChange={event=>onChange(event.target.value as 'active'|'inactive')}><option value="active">启用</option><option value="inactive">停用</option></select></label>;}
function ProjectSelect({projects,value,onChange,label='项目明细'}:{projects:DictionaryItemView[];value:number;onChange(id:number):void;label?:string}){return <label>{label}<select required aria-label={label} value={value||''} onChange={event=>onChange(Number(event.target.value))}><option value="">请选择</option>{projects.map(item=><option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>;}

export function TemplateEditor({api,initial,catalog,lookups,onSaved,onCancel}:{api:PackagingApi;initial?:PackagingTemplate;catalog?:PackagingCatalog;lookups:PackagingLookups;onSaved():Promise<void>;onCancel():void}) {
  const [draft,setDraft]=useState<PackagingTemplateInput>(initial??{name:'',mainCategoryId:0,projectItemId:0,brandIds:[],productIds:[],fields:[],requiredFonts:[],status:'active'});
  const rules=(catalog?.rules??[]).filter(r=>r.templateId===initial?.id&&r.status==='active');
  const existingRule=rules.length===1?rules[0]:undefined;
  const [rangeEnabled,setRangeEnabled]=useState(false);
  const [rangeValues,setRangeValues]=useState<Record<string,{min:string;max:string}>>(()=>Object.fromEntries((existingRule?.conditions??[]).filter(c=>c.operator==='between').map(c=>[c.key,{min:String(c.value),max:String(c.max??'')}] )));
  const [swap,setSwap]=useState(existingRule?.allowLengthWidthSwap??true);
  const dimensions=dimensionDefinitions(catalog?.configs.find(c=>c.projectItemId===draft.projectItemId)?.parameters??[]);
  const unsupported=Boolean(existingRule&&(existingRule.conditions.some(c=>c.operator!=='between'||typeof c.value!=='number'||c.max===undefined||!dimensions.some(d=>d.key===c.key))||new Set(existingRule.conditions.map(c=>c.key)).size!==existingRule.conditions.length));
  const [file,setFile]=useState<{token:string;fileName:string;displayPath:string}>();const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const [objects,setObjects]=useState<string[]>([]);const [reading,setReading]=useState(false);const [readMessage,setReadMessage]=useState('');const [readError,setReadError]=useState('');const readSequence=useRef(0);
  const [drawingEvidence,setDrawingEvidence]=useState<{originalText:string;matches:number}|null>(null);
  const panel=useRef<HTMLElement>(null);
  const baseline=useRef(JSON.stringify(draft));const saving=useRef(false);
  const dirty=JSON.stringify(draft)!==baseline.current||Boolean(file)||rangeEnabled;
  const requestClose=()=>{if(saving.current)return;if(!dirty||window.confirm('有未保存的修改，确认放弃？'))onCancel();};
  useModalFocus({panel,open:true,onClose:requestClose});
  useEffect(()=>{
    const protect=(event:BeforeUnloadEvent)=>{if(dirty||saving.current){event.preventDefault();event.returnValue='';}};
    window.addEventListener('beforeunload',protect);return()=>window.removeEventListener('beforeunload',protect);
  },[dirty]);
  useEffect(()=>{let active=true;if(initial&&typeof api.templateStatus==='function')void api.templateStatus(initial.id).then(status=>{if(active&&!status.available)setReadError(status.message??'模板文件不可用，请重新定位');}).catch(()=>{if(active)setReadError('无法检查模板路径，请重新定位或稍后重试');});return()=>{active=false;};},[api,initial]);
  const change=(patch:Partial<PackagingTemplateInput>)=>setDraft(current=>({...current,...patch}));
  const inspect=async(selectedFile?:{token:string;fileName:string;displayPath:string})=>{
    const sequence=++readSequence.current;setReading(true);setReadMessage('');setReadError('');setDrawingEvidence(null);
    try{
      const result=selectedFile?await api.inspectTemplateReference(selectedFile.token,draft.fields.filter(field=>field.objectName.trim()),draft.requiredFonts):initial?await api.inspectTemplate(initial.id):undefined;
      if(sequence!==readSequence.current||!result)return;
      setDrawingEvidence(result.drawingNumber??null);
      const discovered=result.textObjects??result.fields;
      setObjects([...new Set(discovered.filter(object=>object.editable&&object.objectName).map(object=>object.objectName))]);
      setDraft(current=>({...current,requiredFonts:[...new Set([...current.requiredFonts,...result.fonts])]}));
      setReadMessage(`已读取 ${discovered.filter(object=>object.editable&&object.objectName).length} 个可编辑文字对象、${result.fonts.length} 种字体。${result.issues.map(issue=>issue.message).join('；')}`);
    }catch(e){if(sequence===readSequence.current)setReadError(`${e instanceof Error?e.message:'读取失败'}，可继续手动填写对象名称和字体。`);}
    finally{if(sequence===readSequence.current)setReading(false);}
  };
  return createPortal(<div className="packaging-page packaging-catalog pkg-template-overlay"><div className="module-backdrop" onClick={requestClose} aria-hidden="true"/><section className="pkg-template-drawer" ref={panel} role="dialog" aria-modal="true" aria-labelledby="pkg-template-title" tabIndex={-1}><header className="pkg-drawer-heading"><div><h2 id="pkg-template-title">{initial?'编辑 AIT 模板':'新增 AIT 模板'}</h2>{initial&&<span>{initial.name}</span>}</div><button className="secondary-button" type="button" aria-label="关闭 AIT 模板编辑" disabled={busy} onClick={requestClose}><X size={20} aria-hidden="true"/></button></header><form className="pkg-editor" aria-label="AIT 模板编辑" onSubmit={async event=>{event.preventDefault();if(saving.current)return;saving.current=true;setBusy(true);setError('');try{const conditions=dimensions.flatMap(d=>{const value=rangeValues[d.key];if(!value||(!value.min&&!value.max))return [];if(!value.min||!value.max||Number(value.min)>Number(value.max))throw new Error(`${d.label}尺寸范围不完整或上限小于下限`);return [{key:d.key,operator:'between' as const,value:Number(value.min),max:Number(value.max)}];});const range=rangeEnabled?{...(existingRule?{id:existingRule.id}:{}),name:existingRule?.name??`${draft.name}尺寸范围`,conditions,allowLengthWidthSwap:swap,status:'active' as const}:undefined;if(initial){if(file){if(range)await api.saveTemplateReference(draft,file.token,initial.id,range);else await api.saveTemplateReference(draft,file.token,initial.id);}else if(range)await api.updateTemplate(initial.id,draft,range);else await api.updateTemplate(initial.id,draft);}else{if(!file)throw new Error('请选择 AIT 文件');if(range)await api.saveTemplateReference(draft,file.token,undefined,range);else await api.saveTemplateReference(draft,file.token);}baseline.current=JSON.stringify(draft);setFile(undefined);setRangeEnabled(false);await onSaved();}catch(e){setError(e instanceof Error?e.message:'模板保存失败');}finally{saving.current=false;setBusy(false);}}}>
    <fieldset disabled={busy}><div className="pkg-fields"><label>模板名称<input required value={draft.name} onChange={event=>change({name:event.target.value})}/></label><label>资料类别<select required value={draft.mainCategoryId||''} onChange={event=>change({mainCategoryId:Number(event.target.value),projectItemId:0})}><option value="">请选择</option>{lookups.mains.map(m=><option key={m.id} value={m.id}>{m.code} · {m.name}</option>)}</select></label><ProjectSelect projects={lookups.projects.filter(p=>p.parentId===draft.mainCategoryId)} value={draft.projectItemId} onChange={projectItemId=>{change({projectItemId});setRangeEnabled(false);setRangeValues({});}}/><Status value={draft.status} onChange={status=>change({status})}/></div>
    <section aria-label="模板尺寸范围"><h4>模板尺寸范围</h4>{rules.length>1?<p>存在多条启用规则：{rules.map(r=>r.name).join('、')}。请到“模板匹配规则”中分别编辑；模板资料仍可保存。</p>:unsupported?<p>现有规则包含此处不支持的历史条件，请到“模板匹配规则”中编辑；模板资料仍可保存。</p>:<><label className="pkg-check"><input type="checkbox" checked={rangeEnabled} disabled={!draft.projectItemId||!dimensions.length} onChange={event=>setRangeEnabled(event.target.checked)}/>设置模板尺寸范围</label>{!dimensions.length&&<p>请先在项目生成设置中配置尺寸匹配依据。</p>}{rangeEnabled&&<><p>填写需要限制的尺寸，留空表示该尺寸不限制。</p><div className="pkg-fields">{dimensions.map(d=><div key={d.key}><label>{d.label}最小值<input aria-label={`${d.label}最小值`} type="number" step="any" value={rangeValues[d.key]?.min??''} onChange={event=>setRangeValues({...rangeValues,[d.key]:{min:event.target.value,max:rangeValues[d.key]?.max??''}})}/></label><label>{d.label}最大值<input aria-label={`${d.label}最大值`} type="number" step="any" value={rangeValues[d.key]?.max??''} onChange={event=>setRangeValues({...rangeValues,[d.key]:{min:rangeValues[d.key]?.min??'',max:event.target.value}})}/></label></div>)}</div><label className="pkg-check"><input type="checkbox" checked={swap} onChange={event=>setSwap(event.target.checked)}/>允许长宽互换（高度不参与）</label></>}</>}</section>
    <fieldset className="pkg-checks"><legend>适用品牌（不选为全部）</legend>{lookups.brands.map(b=><label key={b.id}><input type="checkbox" checked={draft.brandIds.includes(b.id)} onChange={event=>change({brandIds:event.target.checked?[...draft.brandIds,b.id]:draft.brandIds.filter(id=>id!==b.id)})}/>{b.code} · {b.name}</label>)}</fieldset>
    <ProductChecks products={lookups.products} value={draft.productIds} onChange={productIds=>change({productIds})}/>
    <div className="pkg-file-inspection"><div>AIT 原始文件<small>{file?.displayPath??initial?.assetRelativePath??'尚未选择'}</small></div><button className="secondary-button" type="button" disabled={reading} onClick={async()=>{try{const next=await api.selectTemplateReference();if(!next)return;setFile(next);setObjects([]);setReadMessage('');setReadError('');void inspect(next);}catch(e){setReadError(e instanceof Error?e.message:'选择失败');}}}>{initial?'重新定位 AIT':'选择 AIT 原始文件'}</button><button className="secondary-button" type="button" disabled={reading||(!file&&!initial)} onClick={()=>void inspect(file)}>{reading?'读取中…':'读取对象与字体'}</button></div>
    {drawingEvidence&&<p role="status">原完整图号：{drawingEvidence.originalText} · {drawingEvidence.matches} 处完全相同文字</p>}
    {readMessage&&<p className="pkg-muted" role="status">{readMessage}</p>}{readError&&<p className="pkg-error" role="alert">{readError}</p>}
    <h4>图号字段映射</h4><datalist id="packaging-ait-objects">{objects.map(name=><option key={name} value={name}/>)}</datalist>
    {draft.fields.map((field,index)=>field.sourceKey==='DRAWING_NO'&&<div className="pkg-field-row" key={index}><label>AIT 对象名称<input required list="packaging-ait-objects" aria-label={`AIT 对象名称 ${index+1}`} placeholder="选择已读取对象或手动填写" value={field.objectName} onChange={event=>change({fields:draft.fields.map((f,i)=>i===index?{...f,objectName:event.target.value}:f)})}/></label><label>填入内容<select aria-label={`填入内容 ${index+1}`} value="DRAWING_NO" onChange={()=>{}}><option value="DRAWING_NO">完整图号</option></select></label><label className="pkg-check"><input type="checkbox" aria-label={`必填 ${index+1}`} checked={field.required} onChange={event=>change({fields:draft.fields.map((f,i)=>i===index?{...f,required:event.target.checked}:f)})}/>必填</label><button className="secondary-button" type="button" aria-label={`移除图号映射 ${index+1}`} onClick={()=>change({fields:draft.fields.filter((_,i)=>i!==index)})}>移除</button></div>)}
    <button className="secondary-button" type="button" onClick={()=>change({fields:[...draft.fields,{objectName:'',sourceKey:'DRAWING_NO',required:true}]})}>添加图号映射</button>
    <label className="pkg-fonts">所需字体<input aria-label="所需字体" placeholder="自动读取，也可手动填写；多种字体用逗号分隔" value={draft.requiredFonts.join(', ')} onChange={event=>change({requiredFonts:event.target.value.split(/[,，]/).map(s=>s.trim()).filter(Boolean)})}/></label>
    </fieldset><div className="pkg-actions"><button className="primary-button" disabled={busy||reading} type="submit">{busy?'保存中…':'保存模板'}</button><button className="secondary-button" type="button" disabled={busy} onClick={requestClose}>取消</button>{error&&<span role="alert">{error}</span>}</div>
  </form></section></div>,document.body);
}

export function RuleEditor({api,initial,catalog,onSaved,onCancel}:{api:PackagingApi;initial?:TemplateRule;catalog:PackagingCatalog;onSaved():Promise<void>;onCancel():void}) {
  const [draft,setDraft]=useState<TemplateRuleInput>(initial??{name:'',templateId:0,conditions:[],allowLengthWidthSwap:true,status:'active'});const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const change=(patch:Partial<TemplateRuleInput>)=>setDraft({...draft,...patch});
  const template=catalog.templates.find(t=>t.id===draft.templateId);const parameters=catalog.configs.find(c=>c.projectItemId===template?.projectItemId)?.parameters??[];
  const definitions=dimensionDefinitions(parameters);
  const editCondition=(index:number,patch:Partial<TemplateCondition>)=>change({conditions:draft.conditions.map((condition,i)=>i===index?{...condition,...patch}:condition)});
  return <form className="pkg-editor" aria-label="模板匹配规则编辑" onSubmit={async event=>{event.preventDefault();setBusy(true);setError('');try{await api.saveRule({...draft,...(initial?{id:initial.id}:{})});await onSaved();}catch(e){setError(e instanceof Error?e.message:'规则保存失败');}finally{setBusy(false);}}}><h3>{initial?'编辑匹配规则':'新增匹配规则'}</h3><fieldset disabled={busy}><div className="pkg-fields"><label>规则名称<input required value={draft.name} onChange={event=>change({name:event.target.value})}/></label><label>目标模板<select required value={draft.templateId||''} onChange={event=>{const next=catalog.templates.find(t=>t.id===Number(event.target.value));change({templateId:Number(event.target.value),...(template?.projectItemId!==next?.projectItemId?{conditions:[],allowLengthWidthSwap:true}:{})});}}><option value="">请选择</option>{catalog.templates.map(t=><option key={t.id} value={t.id}>{t.name}{t.status==='inactive'?'（已停用）':''}</option>)}</select></label><Status value={draft.status} onChange={status=>change({status})}/></div>
    {!draft.conditions.length&&<p className="pkg-muted">固定模板（无需尺寸）</p>}
    {draft.conditions.map((condition,index)=>{
      const definition=parameters.find(d=>d.key===condition.key);const legacy=!definitions.some(d=>d.key===condition.key);const textValue=definition?.type==='text'||(!definition&&typeof condition.value==='string');
      return <div key={index} className="pkg-field-row"><label>尺寸<select required aria-label={`条件尺寸 ${index+1}`} value={condition.key} onChange={event=>editCondition(index,{key:event.target.value})}>{legacy&&<option value={condition.key}>{dimensionLabel(parameters,condition.key)}</option>}{definitions.map(d=><option key={d.key} value={d.key}>{d.label}</option>)}</select></label><label>比较方式<select aria-label={`比较方式 ${index+1}`} value={condition.operator} onChange={event=>editCondition(index,{operator:event.target.value as TemplateCondition['operator']})}>{[['lt','小于'],['lte','小于等于'],['gt','大于'],['gte','大于等于'],['between','范围（含最小和最大值）'],['eq','等于']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>{condition.operator==='between'?'最小值':'数值'}<input aria-label={`${condition.operator==='between'?'最小值':'数值'} ${index+1}`} required type={textValue?'text':'number'} step="any" value={condition.value} onChange={event=>editCondition(index,{value:textValue?event.target.value:Number(event.target.value)})}/></label>{condition.operator==='between'&&<label>最大值<input aria-label={`最大值 ${index+1}`} required type="number" min={Number(condition.value)} step="any" value={condition.max??''} onChange={event=>editCondition(index,{max:Number(event.target.value)})}/></label>}<button type="button" aria-label={`移除条件 ${index+1}`} onClick={()=>change({conditions:draft.conditions.filter((_,i)=>i!==index)})}>移除条件</button></div>;
    })}
    <div className="pkg-actions"><button type="button" disabled={!definitions.length} onClick={()=>change({conditions:[...draft.conditions,{key:definitions[0].key,operator:'lte',value:0}]})}>添加尺寸条件</button><label className="pkg-check"><input type="checkbox" checked={draft.allowLengthWidthSwap} disabled={!definitions.some(d=>resolveParameterAxis(d)==='length')||!definitions.some(d=>resolveParameterAxis(d)==='width')} onChange={event=>change({allowLengthWidthSwap:event.target.checked})}/>允许长宽互换（高度不参与）</label></div></fieldset><div className="pkg-actions"><button type="submit" className="primary-button" disabled={busy}>{busy?'保存中…':'保存匹配规则'}</button><button type="button" disabled={busy} onClick={onCancel}>取消</button>{error&&<span role="alert">{error}</span>}</div></form>;
}

export function ConfigEditor({api,catalog,projects,onSaved}:{api:PackagingApi;catalog:PackagingCatalog;projects:DictionaryItemView[];onSaved():Promise<void>}) {
  const [draft,setDraft]=useState<PackagingProjectConfig>({projectItemId:0,mode:'ait',parameters:[]});const [basis,setBasis]=useState<MatchingBasis>('0');const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [error,setError]=useState('');
  const selectBasis=(nextBasis:MatchingBasis)=>{
    const axes:DimensionAxis[]=nextBasis==='3'?['length','width','height']:nextBasis==='2'?['length','width']:[];
    const templates=catalog.templates.filter(t=>t.projectItemId===draft.projectItemId).map(t=>t.id);
    const usedKeys=new Set(catalog.rules.filter(rule=>templates.includes(rule.templateId)).flatMap(rule=>rule.conditions.map(condition=>condition.key)));
    const blocked=draft.parameters.find(parameter=>usedKeys.has(parameter.key)&&resolveParameterAxis(parameter)&&!axes.includes(resolveParameterAxis(parameter)!));
    if(blocked){setError(`现有匹配规则仍使用${axisLabels[resolveParameterAxis(blocked)!]}，请先调整规则，再更改匹配依据。`);return;}
    const original=catalog.configs.find(config=>config.projectItemId===draft.projectItemId)?.parameters??[];
    const source=[...draft.parameters,...original.filter(p=>!draft.parameters.some(current=>current.key===p.key))];
    const selected=axes.map(axis=>{
      const existing=source.find(parameter=>resolveParameterAxis(parameter)===axis);
      if(existing)return {...existing,axis,required:true};
      let key:string=axis;let suffix=2;while(source.some(parameter=>parameter.key===key))key=`${axis}_${suffix++}`;
      return {key,label:axisLabels[axis],type:'number' as const,axis,required:true,unit:'mm'};
    });
    const extra=source.filter(parameter=>!selected.some(p=>p.key===parameter.key)).map(parameter=>resolveParameterAxis(parameter)?{...parameter,axis:undefined,required:false}:parameter);
    setDraft({...draft,parameters:[...selected,...extra]});setBasis(nextBasis);setError('');setMessage('');
  };
  const hasLegacy=draft.parameters.some(parameter=>!resolveParameterAxis(parameter));
  return <form className="pkg-editor pkg-project-settings" aria-label="项目生成设置" onSubmit={async event=>{event.preventDefault();setBusy(true);setMessage('');setError('');try{await api.saveConfig(draft);await onSaved();setMessage('项目配置已保存');}catch(e){setError(e instanceof Error?e.message:'配置保存失败');}finally{setBusy(false);}}}><fieldset disabled={busy}><div className="pkg-fields"><ProjectSelect projects={projects} label="配置项目" value={draft.projectItemId} onChange={id=>{const next=catalog.configs.find(c=>c.projectItemId===id)??{projectItemId:id,mode:'ait' as const,parameters:[]};setDraft(next);setBasis(matchingBasis(next.parameters));setMessage('');setError('');}}/><label>生成方式<select disabled={!draft.projectItemId} value={draft.mode} onChange={event=>setDraft({...draft,mode:event.target.value as PackagingMode})}>{Object.entries(modeLabels).filter(([value])=>value!=='none'||draft.mode==='none').map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>{draft.mode==='ait'&&<label>模板匹配依据<select disabled={!draft.projectItemId} value={basis} onChange={event=>selectBasis(event.target.value as MatchingBasis)}><option value="0">无需尺寸</option><option value="2">二维尺寸：长、宽</option><option value="3">三维尺寸：长、宽、高</option></select></label>}</div>
    {draft.projectItemId>0&&hasLegacy&&<p className="pkg-muted">保留已有的其他规格参数和规则，兼容历史数据。</p>}
    </fieldset><div className="pkg-actions"><button className="primary-button" type="submit" disabled={busy||!draft.projectItemId}>{busy?'保存中…':'保存项目配置'}</button>{message&&<span role="status">{message}</span>}{error&&<span role="alert">{error}</span>}</div></form>;
}
