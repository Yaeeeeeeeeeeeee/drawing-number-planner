import { Fragment, useRef, useState } from 'react';
export const isMigrationMock=()=>import.meta.env.DEV&&typeof window!=='undefined'&&new URLSearchParams(window.location.search).get('mock')==='migration';
type Candidate={id:string;type:string;code:string;name:string;source:string;parent?:string;parentId?:string};
type Issue={id:string;kind:string;type:string;source:string;value:string;reason:string;ids:string[]};
const labels:Record<string,string>={brand:'品牌',product_size:'品类尺寸',appearance:'外观',color:'颜色',main_category:'主类别',project_item:'项目明细',layer_count:'兼容层数数据'};
const kinds:Record<string,string>={DUPLICATE_CODE:'工作簿重复编码',INCOMPLETE_ROW:'字段不完整',DATABASE_CONFLICT:'数据库编码冲突',AMBIGUOUS_PARENT:'主类别有歧义',MISSING_PARENT:'缺少主类别'};
const candidates:Candidate[]=[
 {id:'b1',type:'brand',code:'02',name:'样例品牌',source:'E22:F22'},
 {id:'a1',type:'appearance',code:'10',name:'标准外观',source:'E23:G23'},
 {id:'m1',type:'main_category',code:'04',name:'印刷件类',source:'E24:H24'},
 {id:'p1',type:'project_item',code:'01',name:'说明书',source:'E25:I25',parent:'印刷件类',parentId:'m1'},
 {id:'c1',type:'color',code:'0',name:'白色',source:'C22:D22'},
 {id:'c2',type:'color',code:'0',name:'白色重复项',source:'C23:D23'},
 {id:'s1',type:'product_size',code:'0404',name:'长品类尺寸名称样例：用于核对完整数据和来源单元格，不能截断重要标识',source:'A26:B26'},
 {id:'p2',type:'project_item',code:'02',name:'铭牌',source:'E27:J27',parent:'同名主类别'},
 {id:'p3',type:'project_item',code:'03',name:'包装箱',source:'E28:K28',parent:'不存在的主类别'},
 {id:'l1',type:'layer_count',code:'01',name:'原模板兼容项',source:'E29:N29'},
];
const issues:Issue[]=[
 {id:'i1',kind:'DUPLICATE_CODE',type:'color',source:'C22:D22, C23:D23',value:'0',reason:'同一字典范围存在重复编码；需核对源工作簿，再重新检查。不自动覆盖。',ids:['c1','c2']},
 {id:'i2',kind:'DATABASE_CONFLICT',type:'brand',source:'E22:F22',value:'02 · 样例品牌',reason:'当前数据库已有相同编码。冲突候选不可导入；检查不判断历史记录应被删除。',ids:['b1']},
 {id:'i3',kind:'INCOMPLETE_ROW',type:'appearance',source:'E30:G30',value:'名称缺失',reason:'编码、名称或父级信息不完整，未生成候选。此问题不能仅通过候选列表发现。',ids:[]},
 {id:'i4',kind:'AMBIGUOUS_PARENT',type:'project_item',source:'E27:J27',value:'同名主类别',reason:'数据库与本批候选中有多个同名主类别，无法确定归属。需人工核对，不猜测父级，也不新增自动修复。',ids:['p2']},
 {id:'i5',kind:'MISSING_PARENT',type:'project_item',source:'E28:K28',value:'不存在的主类别',reason:'找不到所属主类别。需在现有业务中建立或选择正确来源后重新检查；本界面不补造关联。',ids:['p3']},
];
const scenes={normal:'完成且存在问题',clean:'完成无问题',empty:'空报告',failure:'检查失败',xls:'旧版 XLS 不支持',expired:'审计失效',importFailure:'导入失败',long:'长原因文本'};
export function MigrationMockPage(){
 const [scene,setScene]=useState('normal');const [stage,setStage]=useState<'idle'|'checking'|'ready'|'failed'|'importing'|'done'>('idle');
 const [file,setFile]=useState('');const [tab,setTab]=useState('issues');const [type,setType]=useState('all');const [search,setSearch]=useState('');const [kind,setKind]=useState('all');
 const [selected,setSelected]=useState<string[]>([]);const [open,setOpen]=useState<string|null>(null);const [error,setError]=useState('');const [notice,setNotice]=useState('');
 const version=useRef(0);const pending=useRef(false);
 const rows=scene==='empty'?[]:scene==='clean'?candidates.filter(c=>['a1','m1','p1','s1'].includes(c.id)):candidates;
 const problems=scene==='clean'||scene==='empty'?[]:issues;
 const blocked=new Set(problems.flatMap(i=>i.ids));const eligible=rows.filter(c=>!blocked.has(c.id));
 const busy=stage==='checking'||stage==='importing';const hasReport=['ready','importing','done'].includes(stage);
 const invalidate=()=>{version.current++;setStage('idle');setSelected([]);setOpen(null);setError('');setNotice('');};
 const check=()=>{
  if(!file||pending.current)return;pending.current=true;setStage('checking');setSelected([]);setOpen(null);setError('');setNotice('');const v=version.current;
  setTimeout(()=>{pending.current=false;if(v!==version.current)return;if(scene==='failure'||scene==='xls'){setStage('failed');setError(scene==='xls'?'旧版 .xls 需另存为 .xlsx；未执行检查或导入。':'模拟检查失败，没有有效报告。请重新检查。');return;}setStage('ready');setTab(problems.length?'issues':'candidates');},450);
 };
 const importRows=()=>{
  if(stage!=='ready'||!selected.length||pending.current)return;
  if(scene==='expired'){setStage('failed');setSelected([]);setError('模拟审计结果已失效，请重新检查；未执行导入。');return;}
  if(rows.some(c=>selected.includes(c.id)&&c.parentId&&!selected.includes(c.parentId))){setError('所选项目明细需要同时选择本批主类别；未执行导入。');return;}
  pending.current=true;setStage('importing');setError('');const v=version.current;const count=selected.length;
  setTimeout(()=>{pending.current=false;if(v!==version.current)return;if(scene==='importFailure'){setStage('ready');setError('模拟导入失败，内存结果未提交，未调用真实备份或数据库。');return;}setStage('done');setSelected([]);setNotice(`已模拟导入 ${count} 条，跳过 ${rows.length-count} 条；审计结果已消费，需重新检查。`);},450);
 };
 const toggle=(id:string)=>{if(stage!=='ready'||blocked.has(id))return;setSelected(old=>old.includes(id)?old.filter(x=>x!==id):[...old,id]);};
 const matches=(t:string,text:string)=>(type==='all'||type===t)&&(!search||text.toLowerCase().includes(search.toLowerCase()));
 const visibleIssues=problems.filter(i=>matches(i.type,`${i.value} ${i.source} ${i.reason}`)&&(kind==='all'||kind===i.kind));
 const visibleCandidates=rows.filter(c=>matches(c.type,`${c.code} ${c.name} ${c.source} ${c.parent??''}`)&&(kind==='all'||kind==='eligible'&&!blocked.has(c.id)||kind==='blocked'&&blocked.has(c.id)));
 return <section className="page-surface mm-page"><header className="page-header"><h1>迁移检查</h1><label>Mock 场景<select aria-label="Mock 场景" disabled={busy} value={scene} onChange={e=>{setScene(e.target.value);invalidate();}}>{Object.entries(scenes).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label></header>
 <div className="mm-source"><button disabled={busy} onClick={()=>{invalidate();setFile(scene==='xls'?'样例旧模板.xls':'样例编码模板.xlsx');}}>选择样例文件</button><strong>{file||'尚未选择文件'}</strong><button className="primary-button" disabled={!file||busy} onClick={check}>{stage==='checking'?'检查中…':'开始检查'}</button><span role="status">{({idle:'尚未检查',checking:'正在检查样例',ready:'检查完成',failed:'检查失败',importing:'正在模拟导入',done:'本次导入完成'})[stage]}</span></div>
 <p className="mm-scope">检查范围：“新版图号”工作表的固定字典列与编码/父级关系。未检查历史图号、BOM、PDF 或跨批次复用；原文件不修改。</p>
 {error&&<p role="alert" className="mm-error">{error}</p>}{notice&&<p role="status" className="mm-success">{notice}</p>}
 {stage==='idle'&&<p className="mm-empty">选择内存样例并开始检查，尚无有效报告。</p>}{stage==='checking'&&<p className="mm-empty">正在解析及核对样例字典…不显示虚构扫描进度。</p>}
 {hasReport&&<><div className="mm-summary"><span>候选 <strong>{rows.length}</strong></span><span>问题 <strong>{problems.length}</strong></span><span>受影响候选 <strong>{blocked.size}</strong></span><span>无已知审计冲突 <strong>{eligible.length}</strong></span><small>子项导入还需核对所选父级。</small></div>
 <div className="mm-tools"><div className="mm-tabs"><button aria-pressed={tab==='issues'} onClick={()=>{setTab('issues');setKind('all');setOpen(null);}}>需处理问题</button><button aria-pressed={tab==='candidates'} onClick={()=>{setTab('candidates');setKind('all');setOpen(null);}}>全部候选</button></div>
 <input aria-label="搜索检查结果" placeholder="编码、名称、来源或原因" value={search} onChange={e=>setSearch(e.target.value)}/><select aria-label="字典类型" value={type} onChange={e=>setType(e.target.value)}><option value="all">全部字典范围</option>{Object.entries(labels).map(([v,l])=><option value={v} key={v}>{l}</option>)}</select><select aria-label="结果筛选" value={kind} onChange={e=>setKind(e.target.value)}><option value="all">全部结果</option>{tab==='issues'?Object.entries(kinds).map(([v,l])=><option value={v} key={v}>{l}</option>):<><option value="eligible">无已知冲突</option><option value="blocked">禁止导入</option></>}</select></div>
 {tab==='issues'?visibleIssues.length?<table aria-label="迁移问题工作表"><colgroup>{[22,14,22,22,20].map((w,i)=><col key={i} style={{width:`${w}%`}}/>)}</colgroup><thead><tr>{['问题类型','字典范围','数据摘要','来源单元格','操作'].map(l=><th key={l}>{l}</th>)}</tr></thead><tbody>{visibleIssues.map(i=><Fragment key={i.id}><tr><td><span className={i.kind.includes('PARENT')||i.kind==='INCOMPLETE_ROW'?'mm-warning':'mm-conflict'}>{kinds[i.kind]}</span></td><td>{labels[i.type]}</td><td>{i.value}</td><td>{i.source}</td><td><button aria-expanded={open===i.id} onClick={()=>setOpen(open===i.id?null:i.id)}>{open===i.id?'收起原因':'查看原因'}</button></td></tr>{open===i.id&&<tr><td colSpan={5} className="mm-detail"><p>{i.reason}{scene==='long'?' 此长原因样例用来检验换行与可读性。问题属于字典映射，不能据此删除已有历史图号、覆盖编码或清理原始文件。':''}</p><small>{i.ids.length?`关联候选 ${i.ids.length} 条，均禁止选择；可在全部候选视图核对来源。`:'没有候选记录，仍需处理源表缺项。'}</small></td></tr>}</Fragment>)}</tbody></table>:<p className="mm-empty">{problems.length?'筛选无匹配问题':'本次字典检查未发现已知审计问题；不代表全库检查通过。'}</p>:
 <><div className="mm-select"><button disabled={stage!=='ready'||!eligible.length} onClick={()=>setSelected(eligible.map(c=>c.id))}>全选无冲突候选（含筛选外）</button><button disabled={busy||!selected.length} onClick={()=>setSelected([])}>取消全选</button></div>{visibleCandidates.length?<table aria-label="迁移候选工作表"><colgroup>{[6,13,9,23,14,18,17].map((w,i)=><col key={i} style={{width:`${w}%`}}/>)}</colgroup><thead><tr>{['选择','字典','编码','名称','父级','来源','核查结果'].map(l=><th key={l}>{l}</th>)}</tr></thead><tbody>{visibleCandidates.map(c=><Fragment key={c.id}><tr><td><input aria-label={`选择 ${c.name}`} type="checkbox" checked={selected.includes(c.id)} disabled={stage!=='ready'||blocked.has(c.id)} onChange={()=>toggle(c.id)}/></td><td>{labels[c.type]}</td><td><strong>{c.code}</strong></td><td>{c.name}</td><td>{c.parent||'—'}</td><td>{c.source}</td><td>{blocked.has(c.id)?<button className="mm-conflict" onClick={()=>setOpen(open===c.id?null:c.id)}>禁止导入 · 原因</button>:c.parentId?'需同时选择父级':'无已知冲突'}</td></tr>{open===c.id&&<tr><td colSpan={7} className="mm-detail">{problems.filter(i=>i.ids.includes(c.id)).map(i=><p key={i.id}>{kinds[i.kind]}：{i.reason}</p>)}</td></tr>}</Fragment>)}</tbody></table>:<p className="mm-empty">{rows.length?'没有符合筛选条件的候选':'本次检查没有候选记录'}</p>}</>}
 <footer className="mm-bottom"><div><strong>已选 {selected.length} 条</strong><small>仅导入所选字典，不覆盖既有编码，不修改源文件或历史业务。</small></div><button className="primary-button" disabled={!selected.length||stage!=='ready'} onClick={importRows}>{stage==='importing'?'导入中…':'确认导入（模拟）'}</button></footer></>}
 </section>;
}
