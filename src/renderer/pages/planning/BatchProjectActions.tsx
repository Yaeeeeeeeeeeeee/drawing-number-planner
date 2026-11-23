import {useState} from 'react';
import type {PackagingTemplate} from '../../../core/packaging/packaging-types';
import type {DictionaryItemView,ProductView} from '../../data/client';
import type {PackagingApi} from '../../data/packaging-client';
import {appendPlanningProjects,hasProjectInput,newPlanningProject,type DraftGroup} from './planning-workspace-state';

interface BatchProjectActionsProps {
  group:DraftGroup;
  groups:DraftGroup[];
  products:ProductView[];
  mains:DictionaryItemView[];
  projects:DictionaryItemView[];
  packaging?:PackagingApi;
  disabled:boolean;
  onGroups(groups:DraftGroup[]):void;
}

export function BatchProjectActions({group,groups,products,mains,projects,packaging,disabled,onGroups}:BatchProjectActionsProps) {
  const [action,setAction]=useState<'import'|'copy'|null>(null);
  const [templates,setTemplates]=useState<PackagingTemplate[]>([]),[templateId,setTemplateId]=useState('');
  const [loading,setLoading]=useState(false),[error,setError]=useState('');
  const [targets,setTargets]=useState<number[]>([]);
  const [feedback,setFeedback]=useState('');
  const sourceRows=group.rows.filter(hasProjectInput);
  const others=groups.filter(item=>item.productId!==group.productId);
  const validTemplates=templates.filter(template=>template.status==='active'&&mains.some(item=>item.id===template.mainCategoryId)&&projects.some(item=>item.id===template.projectItemId&&item.parentId===template.mainCategoryId));
  const loadTemplates=async()=>{
    if(!packaging)return;
    setLoading(true);setError('');
    try{setTemplates((await packaging.getCatalog()).templates);}
    catch(reason){setError(reason instanceof Error?reason.message:'包材模板读取失败');}
    finally{setLoading(false);}
  };
  const startImport=()=>{
    setAction('import');setTemplateId('');setFeedback('');
    void loadTemplates();
  };
  const applyTemplate=()=>{
    const template=validTemplates.find(item=>item.id===Number(templateId));
    if(!template||sourceRows.length>=100)return;
    const next=appendPlanningProjects(group,[{...newPlanningProject(),mainCategoryId:template.mainCategoryId,projectItemId:template.projectItemId}]);
    onGroups(groups.map(item=>item.productId===group.productId?next:item));
    setAction(null);setFeedback('已导入项目，请补充颜色后检查。');
  };
  const canCopy=(target:DraftGroup)=>target.rows.filter(hasProjectInput).length+sourceRows.length<=100;
  const copyProjects=()=>{
    const destinationGroups=others.filter(item=>targets.includes(item.productId)&&canCopy(item));
    if(!destinationGroups.length||!sourceRows.length)return;
    onGroups(groups.map(item=>destinationGroups.includes(item)?appendPlanningProjects(item,sourceRows.map(row=>{
      const {whiteBase:_whiteBase,...fields}=row;
      return {...fields,clientId:crypto.randomUUID()};
    })):item));
    setAction(null);setFeedback(`已复制到 ${destinationGroups.length} 个型号。`);
  };
  return <div className="planning-project-tools">
    <div className="planning-tool-row">
      <button type="button" disabled={disabled||!packaging||loading||sourceRows.length>=100} onClick={startImport}>从包材模板导入</button>
      <button type="button" disabled={disabled||!others.length||!sourceRows.length} onClick={()=>{setAction('copy');setTargets([]);setFeedback('');}}>复制到其他型号</button>
      {feedback&&<span role="status">{feedback}</span>}
    </div>
    {action==='import'&&<div className="planning-tool-options">
      {loading?<span role="status">正在读取包材模板…</span>:error?<><span role="alert">{error}</span><button type="button" disabled={disabled} onClick={()=>void loadTemplates()}>重新读取包材模板</button></>:validTemplates.length?<label>包材模板<select value={templateId} onChange={event=>setTemplateId(event.target.value)}>
        <option value="">请选择模板</option>{validTemplates.map(item=><option value={item.id} key={item.id}>{item.name} · {projects.find(project=>project.id===item.projectItemId)?.name}</option>)}
      </select></label>:<span>暂无可导入的启用模板。</span>}
      <button type="button" className="primary-button" disabled={disabled||loading||Boolean(error)||!templateId||sourceRows.length>=100} onClick={applyTemplate}>导入项目</button>
      <button type="button" onClick={()=>setAction(null)}>取消</button>
    </div>}
    {action==='copy'&&<div className="planning-tool-options">
      <fieldset className="planning-copy-targets"><legend>复制目标</legend>{others.map(item=>{
        const product=products.find(product=>product.id===item.productId);
        const limit=!canCopy(item);
        return <label key={item.productId}><input type="checkbox" disabled={disabled||limit} checked={targets.includes(item.productId)} onChange={event=>setTargets(current=>event.target.checked?[...current,item.productId]:current.filter(id=>id!==item.productId))}/>{product?.model??`产品 ${item.productId}`}{limit&&'（超出 100 行）'}</label>;
      })}</fieldset>
      <button type="button" className="primary-button" disabled={disabled||!others.some(item=>targets.includes(item.productId)&&canCopy(item))} onClick={copyProjects}>复制项目</button>
      <button type="button" onClick={()=>setAction(null)}>取消</button>
    </div>}
  </div>;
}
