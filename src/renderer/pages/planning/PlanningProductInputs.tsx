import {useEffect,useRef,useState,type ReactNode} from 'react';
import type {PlanningDraftInput,PlanningDraftMode,WhiteDrawingBase} from '../../../core/planning/planning-types';
import {ProductLinePicker} from '../../components/ProductLinePicker';
import type {DictionaryItemView,ProductView} from '../../data/client';
import type {PackagingApi} from '../../data/packaging-client';
import {BatchProjectActions} from './BatchProjectActions';
import {changePlanningAppearance,isConfiguredProject,newPlanningGroup,newPlanningProject,planningWhiteKey,whiteColorName,type DraftGroup,type DraftProject} from './planning-workspace-state';

interface ProductsProps {
  mode:PlanningDraftMode;
  draft:PlanningDraftInput;
  products:ProductView[];
  appearances:DictionaryItemView[];
  disabled:boolean;
  onChange(next:PlanningDraftInput):void;
}

function modelName(product:ProductView|undefined,id:number) {
  return product?.model??`产品 ${id}`;
}

function dictionaryOptions(items:DictionaryItemView[]) {
  return items.map(item=><option key={item.id} value={item.id}>{item.code} · {item.name}</option>);
}

function productRequirements(product:ProductView|undefined,appearanceId:number|undefined) {
  if(!product)return '产品记录不可用';
  return [product.status!=='active'?'产品已停用':'',!product.brandId?'缺少品牌':'',!product.productSizeId?'缺少品类尺寸':'',!appearanceId?'请选择外观':''].filter(Boolean).join('；');
}

export function PlanningProducts({mode,draft,products,appearances,disabled,onChange}:ProductsProps) {
  const [category,setCategory]=useState(''),[appearance,setAppearance]=useState('');
  const batch=mode==='batch';
  const visible=products.filter(product=>product.status==='active'&&(batch||!category||product.productCategory===category));
  const updateSelection=(ids:number[])=>{
    const groups=ids.flatMap(id=>{
      const existing=draft.groups.find(group=>group.productId===id);
      if(existing)return [existing];
      const product=products.find(item=>item.id===id);
      return product?[newPlanningGroup(product)]:[];
    });
    onChange({...draft,groups,activeProductId:groups.some(group=>group.productId===draft.activeProductId)?draft.activeProductId:groups[0]?.productId});
  };
  const updateAppearance=(group:DraftGroup,id:number|undefined,versionId?:number) => {
    onChange({...draft,groups:draft.groups.map(current=>current.productId===group.productId?changePlanningAppearance(current,id,versionId):current)});
  };
  const selectedProduct=(group:DraftGroup)=>products.find(item=>item.id===group.productId);
  const single=draft.groups[0];
  const singleProduct=single&&selectedProduct(single);

  return <fieldset disabled={disabled} className="planning-inputs">
    {!batch&&<div className="planning-fields"><label>产品类别<select aria-label="产品类别" value={category} onChange={event=>{
      const next=event.target.value;
      setCategory(next);
      if(next&&single&&singleProduct?.productCategory!==next)updateSelection([]);
    }}><option value="">全部类别</option>{[...new Set(products.map(product=>product.productCategory))].sort().map(name=><option key={name}>{name}</option>)}</select></label></div>}
    <ProductLinePicker products={visible} mode={batch?'multiple':'single'} label={batch?'选择产品型号':'产品型号'} selectedIds={draft.groups.map(group=>group.productId)} onChange={updateSelection} disabled={disabled}/>
    {batch&&draft.groups.length>0&&<section className="planning-appearance-editor" aria-label="已选型号外观">
      <div className="planning-section-title"><h2>已选型号外观</h2><div className="planning-appearance-actions">
        <label>统一外观<select value={appearance} onChange={event=>setAppearance(event.target.value)}><option value="">请选择</option>{dictionaryOptions(appearances)}</select></label>
        <button type="button" disabled={!appearance} onClick={()=>onChange({...draft,groups:draft.groups.map(group=>group.appearanceId===Number(appearance)?group:changePlanningAppearance(group,Number(appearance)))})}>应用至已选型号</button>
      </div></div>
      <div className="planning-edit-table"><table><thead><tr><th scope="col">型号</th><th scope="col">外观</th><th scope="col">操作</th></tr></thead><tbody>
        {draft.groups.map(group=>{
          const product=selectedProduct(group),model=modelName(product,group.productId);
          const versions=product?.appearanceVersions?.filter(version=>version.appearanceId!=null)??[];
          const value=group.appearanceVersionId?`version:${group.appearanceVersionId}`:group.appearanceId??'';
          const issue=productRequirements(product,group.appearanceId??versions.find(version=>version.id===group.appearanceVersionId)?.appearanceId??undefined);
          return <tr key={group.productId}><th scope="row"><strong>{model}</strong><small>{product?.sku}</small>{issue&&<small className="planning-input-issue">{issue}</small>}</th><td>
            <select aria-label={`${model} 外观`} value={value} onChange={event=>{
              const next=event.target.value;
              if(next.startsWith('version:')){
                const version=versions.find(item=>`version:${item.id}`===next);
                if(version)updateAppearance(group,version.appearanceId??undefined,version.id);
              }else updateAppearance(group,Number(next)||undefined);
            }}>
              <option value="">请选择</option>
              {group.appearanceVersionId&&!versions.some(version=>version.id===group.appearanceVersionId)&&<option value={value}>已保存外观版本 {group.appearanceVersionId}</option>}
              {!group.appearanceVersionId&&group.appearanceId&&!appearances.some(item=>item.id===group.appearanceId)&&<option value={value}>已保存外观 {group.appearanceId}</option>}
              {versions.length>0&&<optgroup label="型号外观版本">{versions.map(version=><option key={version.id} value={`version:${version.id}`}>{version.label}</option>)}</optgroup>}
              {dictionaryOptions(appearances)}
            </select>
          </td><td><button type="button" className="text-button" aria-label={`移除 ${model}`} onClick={()=>updateSelection(draft.groups.filter(item=>item.productId!==group.productId).map(item=>item.productId))}>移除</button></td></tr>;
        })}
      </tbody></table></div>
    </section>}
    {!batch&&single&&<div className="planning-selected-products"><article>
      <strong>{singleProduct?.brandName} · {modelName(singleProduct,single.productId)}</strong>
      <dl className="planning-product-facts"><div><dt>SKU</dt><dd>{singleProduct?.sku??'未填写'}</dd></div><div><dt>品牌</dt><dd>{singleProduct?.brandName??'—'}</dd></div><div><dt>品类尺寸</dt><dd>{singleProduct?.productSizeName??'—'}</dd></div></dl>
      <label>外观<select value={single.appearanceId??''} onChange={event=>updateAppearance(single,Number(event.target.value)||undefined)}><option value="">请选择</option>{dictionaryOptions(appearances)}</select></label>
      {productRequirements(singleProduct,single.appearanceId)&&<p className="error-banner">{productRequirements(singleProduct,single.appearanceId)}</p>}
    </article></div>}
  </fieldset>;
}

interface ProjectsProps {
  mode:PlanningDraftMode;
  group?:DraftGroup;
  groups:DraftGroup[];
  products:ProductView[];
  mains:DictionaryItemView[];
  projects:DictionaryItemView[];
  colors:DictionaryItemView[];
  packaging?:PackagingApi;
  disabled:boolean;
  editRow?:string;
  onGroups(groups:DraftGroup[]):void;
  onSelect(id:number):void;
  onFocus(row:DraftProject):void;
  whiteBases:Record<string,WhiteDrawingBase[]>;
  whiteError:Record<string,string>;
  onLoadWhite(row:DraftProject):void;
}

export function PlanningProjects({mode,group,groups,products,mains,projects,colors,packaging,disabled,editRow,onGroups,onSelect,onFocus,whiteBases,whiteError,onLoadWhite}:ProjectsProps) {
  const focusRef=useRef<HTMLSelectElement>(null);
  useEffect(()=>{if(editRow)focusRef.current?.focus();},[group?.productId,editRow]);
  const batch=mode==='batch';
  const apply=(next:DraftGroup)=>onGroups(groups.map(item=>item.productId===next.productId?next:item));
  const update=(id:string,patch:Partial<DraftProject>)=>{
    if(!group)return;
    const target=group.rows.find(row=>row.clientId===id);
    apply({...group,rows:group.rows.map(row=>row.clientId===id?{...row,...patch}:patch.shareWhite!==undefined&&row.projectItemId&&row.projectItemId===target?.projectItemId?{...row,shareWhite:patch.shareWhite,whiteBase:undefined}:row)});
  };
  const model=group?modelName(products.find(product=>product.id===group.productId),group.productId):'';
  const renderRow=(row:DraftProject,index:number):ReactNode=>{
    if(!group)return null;
    const number=index+1,key=planningWhiteKey(group,row),bases=whiteBases[key]??[],color=colors.find(item=>item.id===row.colorId);
    const nonWhite=color&&!whiteColorName(color.name);
    const baseValue=row.whiteBase?`${row.whiteBase.origin}:${row.whiteBase.id}`:'';
    const fields=[
      ['主类别',<select ref={row.clientId===editRow?focusRef:undefined} aria-label={`第 ${number} 行主类别`} value={row.mainCategoryId??''} onChange={event=>update(row.clientId,{mainCategoryId:Number(event.target.value)||undefined,projectItemId:undefined,whiteBase:undefined})}><option value="">请选择</option>{dictionaryOptions(mains)}</select>],
      ['项目明细',<select aria-label={`第 ${number} 行项目明细`} disabled={!row.mainCategoryId} value={row.projectItemId??''} onChange={event=>update(row.clientId,{projectItemId:Number(event.target.value)||undefined,whiteBase:undefined})}><option value="">请选择</option>{dictionaryOptions(projects.filter(item=>item.parentId===row.mainCategoryId))}</select>],
      ['颜色',<select aria-label={`第 ${number} 行颜色`} value={row.colorId??''} onChange={event=>update(row.clientId,{colorId:Number(event.target.value)||undefined,whiteBase:undefined})}><option value="">请选择</option>{dictionaryOptions(colors)}</select>],
      ['备注',<input aria-label={`第 ${number} 行备注`} maxLength={1000} value={row.notes??''} onChange={event=>update(row.clientId,{notes:event.target.value})}/>],
    ] as const;
    const remove=<button type="button" className="text-button" aria-label={`删除项目 ${number}`} disabled={!batch&&group.rows.length===1} onClick={()=>apply({...group,rows:group.rows.filter(item=>item.clientId!==row.clientId)})}>移除</button>;
    const sharing=<div className="planning-sharing">
      {nonWhite&&<label><input type="checkbox" aria-label={`第 ${number} 行独立占号`} checked={row.shareWhite===false} onChange={event=>update(row.clientId,{shareWhite:!event.target.checked,whiteBase:undefined})}/>独立占号</label>}
      {row.shareWhite!==false&&nonWhite&&row.projectItemId&&<>
        <button type="button" className="text-button" onClick={()=>onLoadWhite(row)}>查看真实白色基准</button>
        <label>白色基准<select aria-label={`第 ${number} 行白色基准`} value={baseValue} onChange={event=>{
          const base=bases.find(item=>`${item.origin}:${item.id}`===event.target.value);
          update(row.clientId,{whiteBase:base?{origin:base.origin,id:base.id}:undefined});
        }}>
          <option value="">使用唯一的真实白色记录</option>
          {row.whiteBase&&!bases.some(item=>`${item.origin}:${item.id}`===baseValue)&&<option value={baseValue}>已选白色基准</option>}
          {bases.map(item=><option key={`${item.origin}:${item.id}`} value={`${item.origin}:${item.id}`}>{item.fullCode} · {item.displayName}</option>)}
        </select></label>
        {whiteError[key]&&<p role="alert" className="error-banner">{whiteError[key]}</p>}
      </>}
    </div>;
    const focus=()=>onFocus(row);
    return batch?<tr key={row.clientId} onFocus={focus}>
      <th scope="row">{number}</th>{fields.map(([label,control])=><td key={label}>{control}</td>)}
      <td>{nonWhite?sharing:'—'}</td><td>{remove}</td>
    </tr>:<article className="planning-project" key={row.clientId} onFocus={focus}>
      <div className="planning-section-title"><strong>项目 {number}</strong>{remove}</div>
      <div className="planning-fields">{fields.map(([label,control])=><label key={label}>{label}{control}</label>)}</div>
      {sharing}
    </article>;
  };
  return <section>
    <div className="planning-model-tabs" role="tablist" aria-label="本次规划型号">{groups.map(item=>{
      const count=item.rows.filter(isConfiguredProject).length;
      const model=modelName(products.find(product=>product.id===item.productId),item.productId);
      return <button type="button" role="tab" disabled={disabled} aria-selected={item.productId===group?.productId} key={item.productId} onClick={()=>onSelect(item.productId)}>{model}{batch&&<small>{count?`已配置 ${count} 项`:'未配置'}</small>}</button>;
    })}</div>
    {!group?<p>请先选择产品型号</p>:<>
      <div className="planning-section-title"><h2>{batch?'配置项目':'选择项目'}</h2><button type="button" disabled={disabled||group.rows.length>=100} onClick={()=>apply({...group,rows:[...group.rows,newPlanningProject()]})}>添加项目</button></div>
      <fieldset disabled={disabled} className="planning-inputs"><legend className="sr-only">{model} 项目</legend>
        {batch?<>
          <BatchProjectActions key={group.productId} group={group} groups={groups} products={products} mains={mains} projects={projects} packaging={packaging} disabled={disabled} onGroups={onGroups}/>
          <div className="planning-edit-table planning-project-table"><table aria-label={`${model} 项目配置`}>
            <colgroup><col className="planning-project-number"/><col/><col/><col className="planning-project-color"/><col/><col className="planning-project-sharing"/><col className="planning-project-actions"/></colgroup>
            <thead><tr><th scope="col">序号</th><th scope="col">主类别</th><th scope="col">项目明细</th><th scope="col">颜色</th><th scope="col">备注</th><th scope="col">白色共用</th><th scope="col">操作</th></tr></thead>
            <tbody>{group.rows.length?group.rows.map(renderRow):<tr><td colSpan={7}>请添加项目或从包材模板导入。</td></tr>}</tbody>
          </table></div>
        </>:group.rows.map(renderRow)}
      </fieldset>
    </>}
  </section>;
}
