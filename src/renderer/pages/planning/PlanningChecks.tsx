import type {BatchPlanningPreview,BatchPlanningCheck} from '../../../core/planning/planning-types';
import type {DictionaryItemView} from '../../data/client';
import {DataTable} from '../../components/DataTable';

interface PlanningChecksProps {
  preview:BatchPlanningPreview;
  projects:DictionaryItemView[];
  colors:DictionaryItemView[];
  busy:boolean;
  failedOnly?:boolean;
  onFocus(row:BatchPlanningCheck):void;
  onRecheck(row:BatchPlanningCheck):void;
  onEdit?(row:BatchPlanningCheck):void;
  onRemove?(row:BatchPlanningCheck):void;
}

export function PlanningChecks({preview,projects,colors,busy,failedOnly,onFocus,onRecheck,onEdit,onRemove}:PlanningChecksProps) {
  const groups=preview.groups.map(group=>({...group,visibleRows:failedOnly?group.rows.filter(row=>!row.available):group.rows})).filter(group=>group.visibleRows.length);
  return <div className="planning-check-groups">{groups.length===0&&<p>{failedOnly?'没有未通过的项目。':'暂无待检查项目。'}</p>}{groups.map(group=><details key={group.productId} open className="planning-check-group"><summary><strong>{group.model||`产品 ${group.productId}`}</strong><span>{group.rows.filter(row=>row.available).length} / {group.rows.length} 项通过</span></summary>
    <DataTable tableId={`planning-checks-${group.productId}`} items={group.visibleRows.map(row=>({...row,id:row.clientId}))} onRowClick={onFocus} columns={[
      {key:'project',label:'项目',width:130,render:row=>projects.find(item=>item.id===row.projectItemId)?.name??'待选择'},
      {key:'color',label:'颜色',width:85,render:row=>colors.find(item=>item.id===row.colorId)?.name??'待选择'},
      {key:'drawingNo',label:'完整图号',width:225,minWidth:190,render:row=><span className="planning-code" title={row.fullCode}>{row.fullCode??'—'}</span>},
      {key:'sequence',label:'推荐流水号',width:95,render:row=>row.sequence?String(row.sequence).padStart(3,'0'):'—'},
      {key:'status',label:'查重状态',width:100,render:row=><span className={`planning-check-status ${row.available?'passed':'failed'}`}>{row.available?row.shared?'共用已有图号':'可占用':'未通过'}</span>},
      {key:'reason',label:'冲突原因',width:170,align:'left',render:row=><span title={row.error?.message}>{row.error?.message??'—'}</span>},
      {key:'actions',label:'操作',width:onEdit?130:95,render:row=>onEdit?<div className="planning-check-row-actions">{!row.available&&<>
        <button type="button" className="text-button" disabled={busy} onClick={event=>{event.stopPropagation();onEdit(row);}}>去补充</button>
        <button type="button" className="text-button planning-danger" disabled={busy} onClick={event=>{event.stopPropagation();onRemove?.(row);}}>移除</button>
      </>}</div>:<button type="button" className="text-button" disabled={busy} onClick={event=>{event.stopPropagation();onRecheck(row);}}>单项重查</button>},
    ]}/></details>)}</div>;
}
