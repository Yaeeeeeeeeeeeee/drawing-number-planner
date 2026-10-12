import { useEffect, useRef, useState } from 'react';
type Scenario = 'normal'|'otherBlock'|'deleteFailure'|'preflightFailure'|'timeout'|'changed'|'missing';
type Origin = { source:'product-exit'; productId:number; sku:string; model:string; filter:string; expanded:boolean; preflight:boolean; scroll:number; token:number };
type Stage = 'products'|'bom'|'other';
export function ProductBomRoundtripMock() {
 const [stage,setStage]=useState<Stage>(new URLSearchParams(location.search).get('entry')==='bom'?'bom':'products');
 const [origin,setOrigin]=useState<Origin|null>(null); const [filter,setFilter]=useState('');
 const [expanded,setExpanded]=useState(true); const [preflight,setPreflight]=useState(true);
 const [scenario,setScenario]=useState<Scenario>('normal'); const scenarioRef=useRef(scenario);scenarioRef.current=scenario;
 const [checked,setChecked]=useState<number[]>([]);const checkedRef=useRef(checked);checkedRef.current=checked;
 const [status,setStatus]=useState('checking');const [fresh,setFresh]=useState<number|null>(null);
 const [confirmation,setConfirmation]=useState('');const [message,setMessage]=useState('');
 const [tab,setTab]=useState('query');const [selected,setSelected]=useState<number|null>(null);
 const [draft,setDraft]=useState('');const [dirty,setDirty]=useState(false);
 const [pending,setPending]=useState<null|{kind:'leave';action:()=>void}|{kind:'process';id:number}>(null);
 const [processing,setProcessing]=useState(false);const serial=useRef(0);const returning=useRef(false);
 const alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false;serial.current++;};},[]);
 const check=()=>{
   const id=++serial.current;setFresh(null);setConfirmation('');setStatus('checking');returning.current=true;
   const mode=scenarioRef.current;
   window.setTimeout(()=>{
     if(!alive.current||serial.current!==id)return;
     returning.current=false;
     if(mode==='preflightFailure'||mode==='timeout'){setStatus(mode==='timeout'?'timeout':'failed');return;}
     if(mode==='missing'){setStatus('missing');return;}
     setFresh(Math.max(0,2-checkedRef.current.length));
     setStatus(mode==='changed'?'changed':'ready');
   },mode==='timeout'?1000:450);
 };
 useEffect(()=>{if(stage==='products')check();},[]);
 const guard=(action:()=>void)=>{if(processing)return;if(dirty)setPending({kind:'leave',action});else action();};
 const navigate=(next:Stage)=>{
   serial.current++;setFresh(null);setConfirmation('');returning.current=false;
   history.pushState({roundtrip:true,stage:next},'',location.href);setStage(next);
 };
 const go=()=>{
   if(status==='checking'||returning.current)return;
   const context:Origin={source:'product-exit',productId:-1,sku:'MOCK-100-JP',model:'F100',filter,expanded,preflight,scroll:window.scrollY,token:Date.now()};
   setOrigin(context);serial.current++;setFresh(null);setConfirmation('');setTab('query');navigate('bom');
 };
 const restore=(push=true)=>{
   if(returning.current)return;
   serial.current++;setFresh(null);setConfirmation('');setMessage('');
   if(origin){setFilter(origin.filter);setExpanded(origin.expanded);setPreflight(origin.preflight);}
   else{setExpanded(true);setPreflight(true);setMessage('来源上下文失效，已回到产品样例并重新检查；未恢复任何退出许可。');}
   if(push)navigate('products');else setStage('products');
   check();requestAnimationFrame(()=>window.scrollTo(0,origin?.scroll??0));
 };
 const latest=useRef({dirty,stage,restore,processing});latest.current={dirty,stage,restore,processing};
 useEffect(()=>{
   const pop=()=>{
     // Browser traversal never grants permission or trusts a stored result.
     serial.current++;setFresh(null);setConfirmation('');returning.current=false;
     if(latest.current.dirty){
       history.pushState({roundtrip:true,stage:latest.current.stage},'',location.href);
       setPending({kind:'leave',action:()=>latest.current.restore(false)});
     }else latest.current.restore(false);
   };
   addEventListener('popstate',pop);return()=>removeEventListener('popstate',pop);
 },[]);
 const process=(id:number)=>{
   setPending(null);setProcessing(true);setMessage('正在模拟处理…');
   window.setTimeout(()=>{
     if(!alive.current)return;
     setProcessing(false);
     if(scenarioRef.current==='deleteFailure'){setMessage('模拟处理失败：关联未改变');return;}
     setChecked(v=>v.includes(id)?v:[...v,id]);setMessage('模拟操作已完成；返回后必须重新检查，不代表允许退出。');
   },350);
 };
 const otherBlocked=scenario==='otherBlock';const valid=(status==='ready'||status==='changed')&&fresh===0&&!otherBlocked;
 const sku='MOCK-100-JP'; const model=status==='changed'?'F100A':'F100';
 return <section className="page-surface products-mock-page pm-roundtrip">
 <header className="page-header"><h1>{stage==='products'?'产品档案':stage==='bom'?'BOM 管理':'其他模块 · 隔离占位'}</h1><small>往返交互 Mock · 仅内存</small></header>
 <div className="pm-flow-tools"><label>Mock 场景<select aria-label="往返场景" value={scenario} onChange={e=>{serial.current++;returning.current=false;setScenario(e.target.value as Scenario);setFresh(null);setConfirmation('');if(stage==='products')setStatus('stale');}}>
 {Object.entries({normal:'正常 / BOM 阻塞',otherBlock:'BOM 完成后其他关联阻塞',deleteFailure:'处理失败',preflightFailure:'返回预检失败',timeout:'预检超时',changed:'原产品状态变化',missing:'原产品不存在'}).map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label>
 <button onClick={()=>guard(()=>navigate('other'))}>切换其他模块</button><button onClick={()=>guard(()=>{setOrigin(null);setTab('query');navigate('bom');})}>普通进入 BOM</button></div>
 {stage==='products'&&<>
 <label className="pm-flow-filter">产品筛选<input aria-label="产品筛选" value={filter} onChange={e=>setFilter(e.target.value)}/></label>
 <table aria-label="往返产品工作表"><thead><tr><th>SKU</th><th>型号</th><th>状态</th><th>操作</th></tr></thead><tbody>
 <tr>{status==='missing'?<td colSpan={4}>原产品 ID -1 不存在；仅保留来源位置供核对，不恢复产品。</td>:<><td>{sku}</td><td>{model}</td><td>{status==='changed'?'已停用（最新读取）':'启用中'}</td><td><button onClick={()=>setExpanded(!expanded)}>{expanded?'收起详情':'展开详情'}</button></td></>}</tr></tbody></table>
 {expanded&&<section className="pm-flow-detail"><button onClick={()=>setPreflight(!preflight)}>{preflight?'收起预检':'打开退出预检'}</button>
 {preflight&&<><div className="pm-reference-flow">
 <section className="pm-reference-step"><div><h3>① 产品退出预检</h3><strong>BOM 所属版本 · 2 条</strong><p>当前产品 BOM 关系需核对，不代表待删除数量。</p></div><div className="pm-step-action"><span className="pm-flow-pill">{fresh===null?'待检查':fresh>0?'需先处理':'已核对'}</span><button disabled={status==='checking'||status==='missing'} onClick={go}>前往处理 →</button></div></section>
 <div className="pm-step-connector" aria-hidden="true">↓</div>
 <section className="pm-reference-step pm-reference-bom"><h3>② BOM 管理 · 关联处理模式</h3><p>来自产品退出预检：{sku} / {model}</p>{[1,2].map(id=><div className="pm-reference-record" key={id}><span>样例 BOM 版本 {id}</span><span className={checked.includes(id)?'pm-flow-pill done':'pm-flow-pill'}>{checked.includes(id)?'模拟已处理':'待核查'}</span><button disabled={status==='checking'||status==='missing'} onClick={go}>查看 / 处理</button></div>)}<small>示意记录；没有结构化阻塞 ID，需进入后人工核对。</small></section>
 <div className="pm-step-connector" aria-hidden="true">↓</div>
 <section className="pm-reference-step"><div><h3>③ 返回原产品预检</h3><p>保留来源上下文，返回后重新读取产品并检查全部关联。</p></div><div className="pm-step-action"><span className="pm-flow-pill done">重新检查</span><button onClick={()=>check()}>重新检查全部关联</button></div></section>
 </div><h3>完整预检结果</h3><p className="pm-check-note">产品 ID -1；所属 BOM 版本 2 条，不是待删除数量。无结构化阻塞记录 ID。</p>
 <table aria-label="往返预检"><thead><tr><th>关联项目</th><th>数量 / 摘要</th><th>处理规则</th><th>操作</th></tr></thead><tbody>
 <tr><td>BOM 关联检查</td><td>{fresh===null?'待重新检查':`模拟阻塞 ${fresh} 条`}</td><td>数量与阻塞各自核对</td><td><button disabled={status==='checking'||status==='missing'} onClick={go}>打开 BOM 查询</button></td></tr>
 <tr><td>其他关联检查</td><td>{fresh===null?'待重新检查':otherBlocked?'仍有图号引用阻塞':'无其他阻塞（样例）'}</td><td>必须完整预检</td><td>保留引用保护</td></tr>
 <tr><td>历史身份 / 快照 / 原文件</td><td>保留</td><td>不删除、不释放图号</td><td>无删除入口</td></tr></tbody></table>
 <p role="status">{({checking:'正在重新读取产品并执行完整预检…',failed:'检查失败，禁止退出',timeout:'检查超时，禁止退出',missing:'原产品不存在，禁止退出',stale:'场景已变化，请重新检查',changed:'已读取最新产品状态 · '})[status]??'最新预检：'}{fresh!==null&&(valid?'可进入退出确认':'需先处理')}</p>
 <button onClick={()=>check()}>重新检查</button><label className="pm-flow-confirm">输入最新型号确认<input aria-label="最新型号确认" value={confirmation} onChange={e=>setConfirmation(e.target.value)} disabled={!valid}/></label>
 <button className="pm-danger" disabled={!valid||confirmation!==model} onClick={()=>{if(window.confirm('仅模拟确认退出？保留历史及原文件。'))setMessage('模拟退出确认完成，未调用真实服务。');}}>确认退出（模拟）</button></>}
 </section>}</>}
 {stage==='bom'&&<>
 {origin&&<div className="pm-bom-task"><div className="pm-task-top"><div><strong>产品退出 · 关联处理</strong><span className="pm-task-source">来自产品档案</span><p>{origin.sku} · {origin.model}</p></div><button disabled={processing} onClick={()=>guard(()=>restore())}>返回退出预检</button></div><div className="pm-task-bottom"><span>当前产品 BOM 所属版本 <span className="pm-flow-pill">2 条待核查</span></span><small>处理后返回，系统将重新检查全部关联</small></div></div>}
 <div className="pm-flow-tabs">{['query','edit','history'].map(v=><button key={v} aria-pressed={tab===v} onClick={()=>guard(()=>{setTab(v);setSelected(null);})}>{({query:'BOM 查询',edit:'BOM 编辑',history:'历史 BOM'})[v]}</button>)}</div>
 <p className="pm-check-note">按稳定产品 ID -1 查询。当前仅定位产品 BOM，具体阻塞关系需人工核对。</p>
 {tab==='query'&&<table aria-label="模拟BOM列表"><thead><tr><th>版本 / 产品</th><th>范围</th><th>样例核对状态</th><th>操作</th></tr></thead><tbody>{[1,2].map(id=><tr key={id}><td>版本 {id} · {sku} / F100</td><td>{id===1?'当前版本':'所属版本，不推定为当前阻塞'}</td><td>{checked.includes(id)?'模拟已处理':'未核对'}</td><td><button onClick={()=>setSelected(selected===id?null:id)}>查看</button><button disabled={processing||checked.includes(id)} onClick={()=>setPending({kind:'process',id})}>模拟处理</button></td></tr>)}</tbody></table>}
 {selected!==null&&<p>版本 {selected}：仅示意记录；没有可靠关联 ID，不宣称定位到真实阻塞，不操作历史。</p>}
 {tab==='edit'&&<label className="pm-flow-confirm">模拟编辑备注<input aria-label="模拟编辑备注" value={draft} onChange={e=>{setDraft(e.target.value);setDirty(true);}}/><button onClick={()=>{setDirty(false);setMessage('内存草稿已保存，不改变 BOM 关联');}}>保存草稿（模拟）</button></label>}
 {tab==='history'&&<p>历史 BOM / 快照仅保留规则预览，不提供删除或批量处理按钮。</p>}
 </>}
 {stage==='other'&&<><p>仅隔离导航占位，不挂载真实模块。</p><button onClick={()=>guard(()=>{setTab('query');navigate('bom');})}>返回 BOM 任务</button>{origin&&<button onClick={()=>guard(()=>restore())}>返回退出预检</button>}</>}
 {message&&<p role="status">{message}</p>}
 {pending&&<div className="pm-flow-overlay"><section role="dialog" aria-modal="true" aria-label={pending.kind==='leave'?'未保存修改确认':'模拟处理确认'} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();setPending(null);}if(e.key==='Tab'){const buttons=e.currentTarget.querySelectorAll('button');const first=buttons[0],last=buttons[buttons.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}}}>
 <h3>{pending.kind==='leave'?'有未保存修改':'模拟处理关联'}</h3><p>{pending.kind==='leave'?'离开将放弃当前内存草稿。取消可继续编辑。':'仅模拟操作结果，不删除真实 BOM、历史记录或快照。所属版本不是待删除数量。'}</p>
 <button autoFocus onClick={()=>{if(pending.kind==='leave'){const action=pending.action;setDirty(false);setDraft('');setPending(null);action();}else process(pending.id);}}>{pending.kind==='leave'?'放弃修改并离开':'确认模拟处理'}</button><button onClick={()=>setPending(null)}>取消</button>
 </section></div>}
 </section>;
}
