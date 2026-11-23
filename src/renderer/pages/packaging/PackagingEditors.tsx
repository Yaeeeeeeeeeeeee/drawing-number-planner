import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { ActionToast } from '../../components/ActionToast';
import { ProductLinePicker } from '../../components/ProductLinePicker';
import { useModalFocus } from '../../components/useModalFocus';
import type { DictionaryItemView, ProductView } from '../../data/client';
import type { AitFileReference, PackagingApi, PackagingInspectionView } from '../../data/packaging-client';
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

export function TemplateEditor({api,initial,catalog,lookups,open=true,onSaved,onCancel,onOpenConfig,onInspected}:{
  api:PackagingApi;initial?:PackagingTemplate;catalog?:PackagingCatalog;lookups:PackagingLookups;open?:boolean;
  onSaved(template:PackagingTemplate):Promise<void>;onCancel():void;onOpenConfig?(projectId:number):void;
  onInspected?(read:boolean):void;
}) {
  const [draft,setDraft]=useState<PackagingTemplateInput>(initial??{name:'',mainCategoryId:0,projectItemId:0,brandIds:[],productIds:[],fields:[],requiredFonts:[],status:'active'});
  const rules=(catalog?.rules??[]).filter(rule=>rule.templateId===initial?.id&&rule.status==='active');
  const existingRule=rules.length===1?rules[0]:undefined;
  const [rangeEnabled,setRangeEnabled]=useState(false);
  const [rangeValues,setRangeValues]=useState<Record<string,{min:string;max:string}>>(()=>Object.fromEntries((existingRule?.conditions??[]).filter(c=>c.operator==='between').map(c=>[c.key,{min:String(c.value),max:String(c.max??'')}])));
  const [swap,setSwap]=useState(existingRule?.allowLengthWidthSwap??true);
  const dimensions=dimensionDefinitions(catalog?.configs.find(config=>config.projectItemId===draft.projectItemId)?.parameters??[]);
  const unsupported=Boolean(existingRule&&(existingRule.conditions.some(c=>c.operator!=='between'||typeof c.value!=='number'||c.max===undefined||!dimensions.some(d=>d.key===c.key))||new Set(existingRule.conditions.map(c=>c.key)).size!==existingRule.conditions.length));
  const [file,setFile]=useState<AitFileReference>();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [allBrands,setAllBrands]=useState(false);
  const [objects,setObjects]=useState<string[]>([]);
  const [reading,setReading]=useState(false);
  const [readMessage,setReadMessage]=useState('');
  const [readError,setReadError]=useState('');
  const [readWarning,setReadWarning]=useState('');
  const [drawingEvidence,setDrawingEvidence]=useState<PackagingInspectionView['drawingNumber']>();
  const [fontStatuses,setFontStatuses]=useState<PackagingInspectionView['fontStatuses']>();
  const [fontInput,setFontInput]=useState(draft.requiredFonts.join(', '));
  const [pendingRead,setPendingRead]=useState<{objects:string[];newFonts:string[];unavailableObjects:string[]}>();
  const panel=useRef<HTMLElement>(null);
  const baseline=useRef(JSON.stringify(draft));
  const saving=useRef(false);
  const readSequence=useRef(0);
  const dirty=JSON.stringify(draft)!==baseline.current||Boolean(file)||rangeEnabled;
  const requestClose=()=>{if(saving.current)return;if(!dirty||window.confirm('有未保存的修改，确认放弃？'))onCancel();};
  useModalFocus({panel,open,onClose:requestClose});

  useEffect(()=>{
    const protect=(event:BeforeUnloadEvent)=>{if(dirty||saving.current){event.preventDefault();event.returnValue='';}};
    window.addEventListener('beforeunload',protect);
    return()=>window.removeEventListener('beforeunload',protect);
  },[dirty]);
  useEffect(()=>{
    let active=true;
    if(initial&&typeof api.templateStatus==='function')void api.templateStatus(initial.id).then(status=>{
      if(active&&readSequence.current===0&&!status.available)setReadError(status.message??'模板文件不可用，请重新定位');
    }).catch(()=>{if(active&&readSequence.current===0)setReadError('无法检查模板路径，请重新定位或稍后重试');});
    return()=>{active=false;};
  },[api,initial]);

  const change=(patch:Partial<PackagingTemplateInput>)=>setDraft(current=>({...current,...patch}));
  const updateFonts=(text:string)=>{
    setFontInput(text);
    change({requiredFonts:[...new Set(text.split(/[,，]/).map(name=>name.trim()).filter(Boolean))]});
  };
  const applyRead=(result:{objects:string[];newFonts:string[]})=>{
    setObjects(result.objects);
    if(result.newFonts.length)updateFonts([...new Set([...draft.requiredFonts,...result.newFonts])].join(', '));
    setPendingRead(undefined);
  };
  const inspect=async(selectedFile?:AitFileReference)=>{
    const sequence=++readSequence.current;
    setReading(true);
    setReadMessage('');
    setReadError('');
    setReadWarning('');
    setDrawingEvidence(undefined);
    setFontStatuses(undefined);
    setPendingRead(undefined);
    try{
      const result=selectedFile
        ? await api.inspectTemplateReference(selectedFile.token,draft.fields.filter(field=>field.objectName.trim()),draft.requiredFonts)
        : initial ? await api.inspectTemplate(initial.id) : undefined;
      if(sequence!==readSequence.current||!result)return;
      setFontStatuses(result.fontStatuses);
      onInspected?.(result.documentRead===true);
      const issues=result.issues.map(issue=>issue.message).join('；');
      const discovered=result.textObjects??result.fields;
      const read=result.documentRead??Boolean(discovered.some(object=>object.matches!==0)||result.fonts.length||result.drawingNumber);
      if(!read){
        setReadError(issues||'无法确认 Illustrator 已读取 AIT 内容');
        return;
      }
      setDrawingEvidence(result.drawingNumber);
      const nextObjects=[...new Set(discovered.filter(object=>object.editable&&object.objectName).map(object=>object.objectName))];
      const newFonts=[...new Set(result.fonts)].filter(font=>!draft.requiredFonts.includes(font));
      const mappings=draft.fields.filter(field=>field.sourceKey==='DRAWING_NO'&&field.objectName);
      const comparison={
        objects:nextObjects,newFonts,
        unavailableObjects:mappings.map(field=>field.objectName).filter(name=>!nextObjects.includes(name)),
      };
      if(mappings.length||draft.requiredFonts.length)setPendingRead(comparison);
      else applyRead(comparison);
      setReadMessage(`已读取 ${nextObjects.length} 个可编辑文字对象、${result.fonts.length} 种字体。`);
      setReadError(result.issues.filter(issue=>issue.severity==='error').map(issue=>issue.message).join('；'));
      setReadWarning(result.issues.filter(issue=>issue.severity==='warning').map(issue=>issue.message).join('；'));
    }catch(reason){
      if(sequence!==readSequence.current)return;
      onInspected?.(false);
      setReadError(`${reason instanceof Error?reason.message:'读取失败'}。可以保留现有映射，或稍后重新读取。`);
    }finally{
      if(sequence===readSequence.current)setReading(false);
    }
  };
  const chooseFile=async(select:()=>Promise<AitFileReference|null>)=>{
    try{
      const next=await select();
      if(!next)return;
      const duplicate=catalog?.templates.find(item=>item.id!==initial?.id&&item.assetRelativePath===next.displayPath);
      if(duplicate){
        setReadError(`原始 AIT 路径已由模板“${duplicate.name}”引用，请编辑该记录。`);
        return;
      }
      setFile(next);
      setObjects([]);
      void inspect(next);
    }catch(reason){setReadError(reason instanceof Error?reason.message:'选择失败');}
  };
  const save=async(event:React.FormEvent)=>{
    event.preventDefault();
    if(saving.current||reading)return;
    saving.current=true;
    setBusy(true);
    setError('');
    try{
      const conditions=dimensions.flatMap(dimension=>{
        const value=rangeValues[dimension.key];
        if(!value||(!value.min&&!value.max))return [];
        if(!value.min||!value.max||Number(value.min)>Number(value.max))throw new Error(`${dimension.label}尺寸范围不完整或上限小于下限`);
        return [{key:dimension.key,operator:'between' as const,value:Number(value.min),max:Number(value.max)}];
      });
      const range=rangeEnabled?{...(existingRule?{id:existingRule.id}:{}),name:existingRule?.name??`${draft.name}尺寸范围`,conditions,allowLengthWidthSwap:swap,status:'active' as const}:undefined;
      let saved:PackagingTemplate;
      if(file){
        saved=range?await api.saveTemplateReference(draft,file.token,initial?.id,range)
          :initial?await api.saveTemplateReference(draft,file.token,initial.id):await api.saveTemplateReference(draft,file.token);
      }else if(initial){
        saved=range?await api.updateTemplate(initial.id,draft,range):await api.updateTemplate(initial.id,draft);
      }else throw new Error('请选择 AIT 文件');
      baseline.current=JSON.stringify(draft);
      setFile(undefined);
      setRangeEnabled(false);
      try{await onSaved(saved);}
      catch(reason){setError(`模板已保存，${reason instanceof Error?reason.message:'列表刷新失败'}`);}
    }catch(reason){setError(reason instanceof Error?reason.message:'模板保存失败');}
    finally{saving.current=false;setBusy(false);}
  };
  const filteredProducts=allBrands||!draft.brandIds.length?lookups.products:lookups.products.filter(product=>draft.brandIds.includes(product.brandId));
  const fontLabel={installed:'已安装',missing:'缺失',unknown:'无法检测'};
  const offeredObjects=(name:string)=>[...new Set([...(name?[name]:[]),...objects])];

  return createPortal(<div className="packaging-page packaging-catalog pkg-template-overlay" hidden={!open}>
    <div className="module-backdrop" onClick={requestClose} aria-hidden="true"/>
    <section className="pkg-template-drawer" ref={panel} role="dialog" aria-modal="true" aria-labelledby="pkg-template-title" tabIndex={-1}>
      <header className="pkg-drawer-heading">
        <div><h2 id="pkg-template-title">{initial?'编辑 AIT 模板':'新增 AIT 模板'}</h2>{initial&&<span>{initial.name}</span>}</div>
        <button className="secondary-button" type="button" aria-label="关闭 AIT 模板编辑" disabled={busy} onClick={requestClose}><X size={20} aria-hidden="true"/></button>
      </header>
      <form className="pkg-editor" aria-label="AIT 模板编辑" onSubmit={save}>
        <fieldset className="pkg-drawer-content" disabled={busy||reading}>
          <section className="pkg-editor-section pkg-ait-file-section" aria-label="AIT 原始文件">
            <div className="pkg-file-inspection" onDragOver={event=>{if(event.dataTransfer.types.includes('Files'))event.preventDefault();}} onDrop={event=>{
              event.preventDefault();
              if(busy||reading)return;
              const files=Array.from(event.dataTransfer.files);
              if(files.length!==1||!/\.ait$/iu.test(files[0].name)){setReadError('请拖入一个 .ait 原始文件');return;}
              void chooseFile(()=>api.dropTemplateReference(files[0]));
            }}>
              <div><strong>{file?.fileName??initial?.fileName??'AIT 原始文件'}</strong><small>{file?.displayPath??initial?.assetRelativePath??'拖入 .ait 文件，或使用文件选择器'}</small></div>
              <button className="secondary-button" type="button" onClick={()=>void chooseFile(()=>api.selectTemplateReference())}>{initial?'重新定位 AIT':'选择 AIT 原始文件'}</button>
              <button className="secondary-button" type="button" disabled={!file&&!initial} onClick={()=>void inspect(file)}>{reading?'读取中…':'读取对象与字体'}</button>
            </div>
            {drawingEvidence&&<p role="status">原完整图号：{drawingEvidence.originalText} · {drawingEvidence.matches} 处完全相同文字</p>}
            {readMessage&&<p className="pkg-muted" role="status">{readMessage}</p>}
            {readError&&<p className="pkg-error" role="alert">{readError}</p>}
            {readWarning&&<p className="pkg-muted">{readWarning}</p>}
            {pendingRead&&<div className="pkg-read-review" role="group" aria-label="重新读取差异">
              <strong>重新读取差异</strong>
              <p>读取到的可编辑对象：{pendingRead.objects.join('、')||'无'}</p>
              {pendingRead.unavailableObjects.length>0&&<p>未读取到已映射对象：{pendingRead.unavailableObjects.join('、')}</p>}
              <p>新增字体：{pendingRead.newFonts.join('、')||'无'}</p>
              <p>现有图号映射会保留，可在应用读取结果后手动选择对象。</p>
              <button type="button" className="secondary-button" onClick={()=>applyRead(pendingRead)}>应用读取结果</button>
              <button type="button" className="secondary-button" onClick={()=>setPendingRead(undefined)}>保留当前配置</button>
            </div>}
          </section>
          <section className="pkg-editor-section" aria-label="基础信息">
            <h4>基础信息</h4>
            <div className="pkg-fields pkg-template-identity">
              <label>模板名称<input required value={draft.name} onChange={event=>change({name:event.target.value})}/></label>
              <Status value={draft.status} onChange={status=>change({status})}/>
            </div>
            <div className="pkg-fields">
              <label>资料类别<select required value={draft.mainCategoryId||''} onChange={event=>{
                change({mainCategoryId:Number(event.target.value),projectItemId:0});setRangeEnabled(false);setRangeValues({});
              }}><option value="">请选择</option>{lookups.mains.map(main=><option key={main.id} value={main.id}>{main.code} · {main.name}</option>)}</select></label>
              <ProjectSelect projects={lookups.projects.filter(project=>project.parentId===draft.mainCategoryId)} value={draft.projectItemId}
                onChange={projectItemId=>{change({projectItemId});setRangeEnabled(false);setRangeValues({});}}/>
            </div>
          </section>
          <section className="pkg-editor-section" aria-label="适用范围">
            <h4>适用范围</h4>
            <fieldset className="pkg-checks"><legend>适用品牌（不选为全部）</legend>
              {lookups.brands.map(brand=><label key={brand.id}><input type="checkbox" checked={draft.brandIds.includes(brand.id)} onChange={event=>{
                change({brandIds:event.target.checked?[...draft.brandIds,brand.id]:draft.brandIds.filter(id=>id!==brand.id)});
                setAllBrands(false);
              }}/>{brand.code} · {brand.name}</label>)}
            </fieldset>
            {draft.brandIds.length>0&&<label className="pkg-check"><input type="checkbox" checked={allBrands} onChange={event=>setAllBrands(event.target.checked)}/>显示全部品牌型号</label>}
            <ProductLinePicker products={filteredProducts} selectedIds={draft.productIds} onChange={productIds=>change({productIds})} label="适用产品型号"/>
            {draft.productIds.length>0&&<p className="pkg-muted">已选型号：{draft.productIds.map(id=>lookups.products.find(product=>product.id===id)?.model??`#${id}`).join('、')}</p>}
          </section>
          <section className="pkg-editor-section" aria-label="图号字段映射">
            <h4>图号字段映射</h4>
            {draft.fields.map((field,index)=>field.sourceKey==='DRAWING_NO'&&<div className="pkg-field-row" key={index}>
              <label>AIT 对象名称<select required aria-label={`AIT 对象名称 ${index+1}`} value={field.objectName} onChange={event=>change({fields:draft.fields.map((entry,i)=>i===index?{...entry,objectName:event.target.value}:entry)})}>
                <option value="">请选择已读取的对象</option>{offeredObjects(field.objectName).map(name=><option key={name} value={name}>{name}</option>)}
              </select></label>
              <label>填入内容<select aria-label={`填入内容 ${index+1}`} value="DRAWING_NO" onChange={()=>{}}><option value="DRAWING_NO">完整图号</option></select></label>
              <label className="pkg-check"><input type="checkbox" aria-label={`必填 ${index+1}`} checked={field.required} onChange={event=>change({fields:draft.fields.map((entry,i)=>i===index?{...entry,required:event.target.checked}:entry)})}/>必填</label>
              <button className="secondary-button" type="button" aria-label={`移除图号映射 ${index+1}`} onClick={()=>change({fields:draft.fields.filter((_,i)=>i!==index)})}>移除</button>
            </div>)}
            <button className="secondary-button" type="button" disabled={!objects.length} onClick={()=>change({fields:[...draft.fields,{objectName:'',sourceKey:'DRAWING_NO',required:true}]})}>添加图号映射</button>
            {!objects.length&&<p className="pkg-muted">读取 AIT 后可选择对象。留空时使用现有完整图号自动识别规则。</p>}
          </section>
          <section className="pkg-editor-section" aria-label="字体">
            <h4>字体</h4>
            {draft.requiredFonts.length>0&&<ul className="pkg-font-tags" aria-label="字体检测状态">{draft.requiredFonts.map(name=>{
              const status=fontStatuses?.find(font=>font.name===name)?.status??'unknown';
              return <li key={name} data-font-status={status}>{name} <small>{fontLabel[status]}</small></li>;
            })}</ul>}
            <label className="pkg-fonts">所需字体<input aria-label="所需字体" placeholder="多种字体用逗号分隔" value={fontInput} onChange={event=>updateFonts(event.target.value)}/></label>
          </section>
          <section className="pkg-editor-section" aria-label="模板尺寸范围">
            <h4>模板尺寸范围</h4>
            {!dimensions.length&&<p>请先在项目生成设置中配置尺寸匹配依据。{onOpenConfig&&<button className="secondary-button" type="button" onClick={()=>onOpenConfig(draft.projectItemId)}>前往项目生成设置</button>}</p>}
            {rules.length>1?<p>存在多条启用规则：{rules.map(rule=>rule.name).join('、')}。请到“模板匹配规则”中分别编辑；模板资料仍可保存。</p>
              :unsupported?<p>现有规则包含此处不支持的历史条件，请到“模板匹配规则”中编辑；模板资料仍可保存。</p>
              :<>
                <label className="pkg-check"><input type="checkbox" checked={rangeEnabled} disabled={!draft.projectItemId||!dimensions.length} onChange={event=>setRangeEnabled(event.target.checked)}/>设置模板尺寸范围</label>
                {rangeEnabled&&<>
                  <p>填写需要限制的尺寸，留空表示该尺寸不限制。</p>
                  <div className="pkg-fields">{dimensions.map(dimension=><div key={dimension.key}>
                    <label>{dimension.label}最小值<input aria-label={`${dimension.label}最小值`} type="number" step="any" value={rangeValues[dimension.key]?.min??''} onChange={event=>setRangeValues({...rangeValues,[dimension.key]:{min:event.target.value,max:rangeValues[dimension.key]?.max??''}})}/></label>
                    <label>{dimension.label}最大值<input aria-label={`${dimension.label}最大值`} type="number" step="any" value={rangeValues[dimension.key]?.max??''} onChange={event=>setRangeValues({...rangeValues,[dimension.key]:{min:rangeValues[dimension.key]?.min??'',max:event.target.value}})}/></label>
                  </div>)}</div>
                  <label className="pkg-check"><input type="checkbox" checked={swap} onChange={event=>setSwap(event.target.checked)}/>允许长宽互换（高度不参与）</label>
                </>}
              </>}
          </section>
        </fieldset>
        <div className="pkg-actions">
          <button className="primary-button" disabled={busy||reading} type="submit">{busy?'保存中…':'保存模板'}</button>
          <button className="secondary-button" type="button" disabled={busy} onClick={requestClose}>取消</button>
          {error&&<span role="alert">{error}</span>}
        </div>
      </form>
    </section>
  </div>,document.body);
}

export function RuleEditor({api,initial,catalog,onSaved,onCancel}:{api:PackagingApi;initial?:TemplateRule;catalog:PackagingCatalog;onSaved(rule:TemplateRule):Promise<void>;onCancel():void}) {
  const [draft,setDraft]=useState<TemplateRuleInput>(initial??{name:'',templateId:0,conditions:[],allowLengthWidthSwap:true,status:'active'});const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const change=(patch:Partial<TemplateRuleInput>)=>setDraft({...draft,...patch});
  const template=catalog.templates.find(t=>t.id===draft.templateId);const parameters=catalog.configs.find(c=>c.projectItemId===template?.projectItemId)?.parameters??[];
  const definitions=dimensionDefinitions(parameters);
  const editCondition=(index:number,patch:Partial<TemplateCondition>)=>change({conditions:draft.conditions.map((condition,i)=>i===index?{...condition,...patch}:condition)});
  return <form className="pkg-editor" aria-label="模板匹配规则编辑" onSubmit={async event=>{event.preventDefault();setBusy(true);setError('');try{const saved=await api.saveRule({...draft,...(initial?{id:initial.id}:{})});await onSaved(saved);}catch(e){setError(e instanceof Error?e.message:'规则保存失败');}finally{setBusy(false);}}}><h3>{initial?'编辑匹配规则':'新增匹配规则'}</h3><fieldset disabled={busy}><div className="pkg-fields"><label>规则名称<input required value={draft.name} onChange={event=>change({name:event.target.value})}/></label><label>目标模板<select required value={draft.templateId||''} onChange={event=>{const next=catalog.templates.find(t=>t.id===Number(event.target.value));change({templateId:Number(event.target.value),...(template?.projectItemId!==next?.projectItemId?{conditions:[],allowLengthWidthSwap:true}:{})});}}><option value="">请选择</option>{catalog.templates.map(t=><option key={t.id} value={t.id}>{t.name}{t.status==='inactive'?'（已停用）':''}</option>)}</select></label><Status value={draft.status} onChange={status=>change({status})}/></div>
    {!draft.conditions.length&&<p className="pkg-muted">固定模板（无需尺寸）</p>}
    {draft.conditions.map((condition,index)=>{
      const definition=parameters.find(d=>d.key===condition.key);const legacy=!definitions.some(d=>d.key===condition.key);const textValue=definition?.type==='text'||(!definition&&typeof condition.value==='string');
      return <div key={index} className="pkg-field-row"><label>尺寸<select required aria-label={`条件尺寸 ${index+1}`} value={condition.key} onChange={event=>editCondition(index,{key:event.target.value})}>{legacy&&<option value={condition.key}>{dimensionLabel(parameters,condition.key)}</option>}{definitions.map(d=><option key={d.key} value={d.key}>{d.label}</option>)}</select></label><label>比较方式<select aria-label={`比较方式 ${index+1}`} value={condition.operator} onChange={event=>editCondition(index,{operator:event.target.value as TemplateCondition['operator']})}>{[['lt','小于'],['lte','小于等于'],['gt','大于'],['gte','大于等于'],['between','范围（含最小和最大值）'],['eq','等于']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>{condition.operator==='between'?'最小值':'数值'}<input aria-label={`${condition.operator==='between'?'最小值':'数值'} ${index+1}`} required type={textValue?'text':'number'} step="any" value={condition.value} onChange={event=>editCondition(index,{value:textValue?event.target.value:Number(event.target.value)})}/></label>{condition.operator==='between'&&<label>最大值<input aria-label={`最大值 ${index+1}`} required type="number" min={Number(condition.value)} step="any" value={condition.max??''} onChange={event=>editCondition(index,{max:Number(event.target.value)})}/></label>}<button type="button" aria-label={`移除条件 ${index+1}`} onClick={()=>change({conditions:draft.conditions.filter((_,i)=>i!==index)})}>移除条件</button></div>;
    })}
    <div className="pkg-actions"><button type="button" disabled={!definitions.length} onClick={()=>change({conditions:[...draft.conditions,{key:definitions[0].key,operator:'lte',value:0}]})}>添加尺寸条件</button><label className="pkg-check"><input type="checkbox" checked={draft.allowLengthWidthSwap} disabled={!definitions.some(d=>resolveParameterAxis(d)==='length')||!definitions.some(d=>resolveParameterAxis(d)==='width')} onChange={event=>change({allowLengthWidthSwap:event.target.checked})}/>允许长宽互换（高度不参与）</label></div></fieldset><div className="pkg-actions"><button type="submit" className="primary-button" disabled={busy}>{busy?'保存中…':'保存匹配规则'}</button><button type="button" disabled={busy} onClick={onCancel}>取消</button>{error&&<span role="alert">{error}</span>}</div></form>;
}

const newProjectConfig=(projectItemId=0):PackagingProjectConfig=>({projectItemId,mode:'ait',parameters:[]});

export function ConfigEditor({api,catalog,projects,onSaved,requestedProjectId}:{
  api:PackagingApi;catalog:PackagingCatalog;projects:DictionaryItemView[];
  onSaved(config:PackagingProjectConfig):Promise<void>;requestedProjectId?:number;
}) {
  const [draft,setDraft]=useState(()=>newProjectConfig());
  const [basis,setBasis]=useState<MatchingBasis>('0');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [lastSaved,setLastSaved]=useState<{config:PackagingProjectConfig;catalogConfigs:PackagingProjectConfig[]}>();
  const [selectionBaseline,setSelectionBaseline]=useState(draft);
  const lookup=(id:number)=>lastSaved?.catalogConfigs===catalog.configs&&lastSaved.config.projectItemId===id
    ?lastSaved.config:catalog.configs.find(config=>config.projectItemId===id);
  const selectProject=(id:number)=>{
    const saved=lookup(id);
    const next=saved??newProjectConfig(id);
    setDraft(next);
    setSelectionBaseline(next);
    setBasis(matchingBasis(next.parameters));
    setMessage('');
    setError('');
  };
  useEffect(()=>{
    if(requestedProjectId&&requestedProjectId!==draft.projectItemId)selectProject(requestedProjectId);
  },[requestedProjectId]);
  const selectBasis=(nextBasis:MatchingBasis)=>{
    const axes:DimensionAxis[]=nextBasis==='3'?['length','width','height']:nextBasis==='2'?['length','width']:[];
    const templates=catalog.templates.filter(t=>t.projectItemId===draft.projectItemId).map(t=>t.id);
    const usedKeys=new Set(catalog.rules.filter(rule=>templates.includes(rule.templateId)).flatMap(rule=>rule.conditions.map(condition=>condition.key)));
    const blocked=draft.parameters.find(parameter=>usedKeys.has(parameter.key)&&resolveParameterAxis(parameter)&&!axes.includes(resolveParameterAxis(parameter)!));
    if(blocked){setError(`现有匹配规则仍使用${axisLabels[resolveParameterAxis(blocked)!]}，请先调整规则，再更改匹配依据。`);return;}
    const original=lookup(draft.projectItemId)?.parameters??[];
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
  const savedConfig=lookup(draft.projectItemId);
  const dirty=JSON.stringify(draft)!==JSON.stringify(selectionBaseline);
  const projectName=projects.find(project=>project.id===draft.projectItemId)?.name;
  const savedDimensions=dimensionDefinitions(savedConfig?.parameters??[]);
  const sizeSummary=savedDimensions.length===3?'三维尺寸':savedDimensions.length===2?'二维尺寸':'尺寸';
  return <>
    <form className="pkg-editor pkg-project-settings" aria-label="项目生成设置" onSubmit={async event=>{
      event.preventDefault();
      if(busy)return;
      setBusy(true);setMessage('');setError('');
      try{
        const stored=await api.saveConfig(draft);
        setLastSaved({config:stored,catalogConfigs:catalog.configs});setSelectionBaseline(stored);setDraft(stored);setBasis(matchingBasis(stored.parameters));
        setMessage('项目配置已保存');
        try{await onSaved(stored);}
        catch(reason){setError(`项目配置已保存，${reason instanceof Error?reason.message:'配置列表刷新失败'}`);}
      }catch(reason){setError(reason instanceof Error?reason.message:'配置保存失败');}
      finally{setBusy(false);}
    }}>
      <fieldset disabled={busy}>
        <div className="pkg-fields">
          <ProjectSelect projects={projects} label="配置项目" value={draft.projectItemId} onChange={selectProject}/>
          <label>生成方式<select disabled={!draft.projectItemId} value={draft.mode} onChange={event=>{setDraft({...draft,mode:event.target.value as PackagingMode});setMessage('');}}>
            {Object.entries(modeLabels).filter(([value])=>value!=='none'||draft.mode==='none').map(([value,label])=><option key={value} value={value}>{label}</option>)}
          </select></label>
          {draft.mode==='ait'&&<label>模板匹配依据<select disabled={!draft.projectItemId} value={basis} onChange={event=>selectBasis(event.target.value as MatchingBasis)}>
            <option value="0">无需尺寸</option><option value="2">二维尺寸：长、宽</option><option value="3">三维尺寸：长、宽、高</option>
          </select></label>}
        </div>
        {draft.projectItemId>0&&hasLegacy&&<p className="pkg-muted">保留已有的其他规格参数和规则，兼容历史数据。</p>}
      </fieldset>
      <div className="pkg-actions">
        <button className="primary-button" type="submit" disabled={busy||!draft.projectItemId}>{busy?'保存中…':'保存项目配置'}</button>
        {error&&<span role="alert">{error}</span>}
      </div>
      <ActionToast message={message}/>
    </form>
    <section className="pkg-config-summary" aria-label="当前配置摘要">
      <h3>当前配置摘要</h3>
      {draft.projectItemId?<dl>
        <div><dt>当前项目</dt><dd>{projectName??`项目 #${draft.projectItemId}`}</dd></div>
        {savedConfig&&<div><dt>生成方式</dt><dd>{modeLabels[savedConfig.mode]}</dd></div>}
        {savedConfig?.mode==='ait'&&<div><dt>模板匹配依据</dt><dd>{savedDimensions.length?sizeSummary+' · '+savedDimensions.map(d=>d.label).join('、'):'无需尺寸'}</dd></div>}
        <div><dt>保存状态</dt><dd>{savedConfig?(dirty?'有未保存更改':'已保存'):'尚未保存'}</dd></div>
      </dl>:<p className="pkg-muted">请选择配置项目。</p>}
      <p className="pkg-muted">实际生成结果可在制图任务中查看。</p>
    </section>
  </>;
}
