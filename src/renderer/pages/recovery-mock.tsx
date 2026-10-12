import { useRef, useState } from 'react';
export const isRecoveryMock=()=>import.meta.env.DEV&&typeof window!=='undefined'&&new URLSearchParams(window.location.search).get('mock')==='recovery';
type Action='cancel'|'reload'|'restart'|'relaunch';
const scenes={normal:'正常运行',unavailable:'服务不可用',starting:'服务启动中',task:'任务进行中',slow:'任务无进展',finalizing:'安全提交阶段',failure:'恢复失败',timeout:'停止等待超时',unknown:'任务状态未知'};
const actions:{id:Action;name:string;note:string}[]=[
 {id:'cancel',name:'终止当前任务',note:'发送取消请求；安全提交阶段不能终止。请求返回后仍需确认任务状态。'},
 {id:'reload',name:'重新加载界面',note:'重新加载页面，不修复数据。未保存的输入可能丢失。'},
 {id:'restart',name:'重启本地服务',note:'停止并重新启动子服务；不重置数据库，不代表所有业务故障已解决。'},
 {id:'relaunch',name:'完整恢复应用',note:'等待任务安全停止，再重启服务与应用。不清理历史、不删除原始文件。'},
];
export function RecoveryMockPage({ docked = false }: { docked?: boolean } = {}){
 const [scene,setScene]=useState('normal');const [open,setOpen]=useState(!docked);const [detail,setDetail]=useState(false);
 const [confirm,setConfirm]=useState<Action|null>(null);const [busy,setBusy]=useState<Action|null>(null);
 const [phase,setPhase]=useState('');const [result,setResult]=useState('');const [failed,setFailed]=useState(false);const [healthy,setHealthy]=useState(false);const [cancelled,setCancelled]=useState(false);const lock=useRef(false);
 const task=['task','slow','finalizing','timeout'].includes(scene)&&!cancelled;
 const unavailable=scene==='unavailable'&&!healthy;const unknown=scene==='unknown';
 const service=unavailable?'本地服务不可用':scene==='starting'?'本地服务正在启动':'本地服务进程运行';
 const status=busy?phase:unavailable?'本地服务异常':scene==='starting'?'本地服务启动中':unknown?'任务状态未知':task?scene==='finalizing'?'任务正在安全提交':scene==='slow'?'任务长时间无进展':'任务正在运行':'当前无活动任务';
 const disabled=(id:Action)=>Boolean(busy)||scene==='starting'||id==='cancel'&&(!task||scene==='finalizing'||unavailable||unknown);
 const start=(id:Action)=>{
  if(lock.current||disabled(id))return;lock.current=true;setConfirm(null);setBusy(id);setFailed(false);setResult('');
  setPhase(id==='cancel'?'正在请求任务取消…':id==='restart'?'正在重启本地服务…':id==='relaunch'?'正在准备，等待任务安全停止…':'正在触发界面重新加载…');
  setTimeout(()=>{
   if(scene==='failure'||scene==='timeout'&&id==='relaunch'){setFailed(true);setResult(scene==='timeout'?'仍有任务尚未安全停止。恢复未继续，请等待任务结束后再尝试。':'模拟恢复失败：无法重新建立本地服务连接。未重置数据库或删除文件。');setPhase('');setBusy(null);lock.current=false;return;}
   if(id==='cancel'){
    setPhase('已请求取消，等待任务状态确认…');
    setTimeout(()=>{setCancelled(true);setResult('样例任务状态已确认：已取消。');setPhase('');setBusy(null);lock.current=false;},650);
   }else{if(id==='restart')setHealthy(true);setResult(id==='restart'?'样例服务连接已确认可用；仍需核对原业务操作结果。':id==='reload'?'已模拟触发界面重载。不能据此确认界面或业务已恢复。':'已模拟触发应用重启。重启后的状态尚未验证。');setPhase('');setBusy(null);lock.current=false;}
  },650);
 };
 const current=actions.find(a=>a.id===confirm);
 return <section className={`rm-page ${docked?'rm-docked':'page-surface'}`}><header className="page-header"><h1>安全恢复预览</h1><label>Mock 场景<select aria-label="Mock 场景" disabled={Boolean(busy)} value={scene} onChange={e=>{setScene(e.target.value);setResult('');setFailed(false);setHealthy(false);setCancelled(false);setPhase('');setConfirm(null);}}>{Object.entries(scenes).map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label></header>
 <p className="rm-scope">隔离样板：不连接真实服务、不调用 Electron、不刷新或重启程序。</p>
 <div className="rm-host"><div className="rm-entry"><span className={unavailable||unknown?'rm-status warning':'rm-status'}>{status}</span><button aria-expanded={open} onClick={()=>setOpen(!open)}>安全恢复</button></div>
 {open&&<section className="rm-panel" aria-label="安全恢复面板"><header><strong>安全恢复</strong><button aria-label="关闭安全恢复面板" onClick={()=>setOpen(false)}>关闭</button></header>
 <div className="rm-health"><div>{service}</div><small>{unknown?'任务查询未确认，不推断系统正常。':task?scene==='finalizing'?'安全提交中：禁止中途取消。':'样例任务：准备导入 · 已处理 12 / 30 条':cancelled?'任务状态：已取消':'当前未发现活动任务（样例）'}</small></div>
 {scene==='slow'&&<p className="rm-warning">任务暂无新进展，不会自动终止。可继续等待或请求取消。</p>}
 <div className="rm-actions">{actions.map(a=><div className={a.id==='relaunch'?'rm-action danger':'rm-action'} key={a.id}><div><strong>{a.name}</strong><p>{a.note}</p></div><button disabled={disabled(a.id)} onClick={()=>a.id==='cancel'?start(a.id):setConfirm(a.id)}>{busy===a.id?'处理中…':a.id==='cancel'?'请求取消':'执行'}</button></div>)}</div>
 {scene==='slow'&&!busy&&<button onClick={()=>{setScene('task');setResult('已继续等待；未发送取消或重启请求。');}}>继续等待</button>}
 {busy&&<p role="status" className="rm-progress">{phase}</p>}
 {result&&<p role={failed?'alert':'status'} className={failed?'rm-result error':'rm-result'}>{result}</p>}
 <button className="rm-detail-button" aria-expanded={detail} onClick={()=>setDetail(!detail)}>{detail?'收起故障详情':'查看状态详情'}</button>
 {detail&&<dl className="rm-details"><dt>状态来源</dt><dd>内存样例，不是实时诊断</dd><dt>服务</dt><dd>{service}</dd><dt>任务</dt><dd>{unknown?'未确认':task?'有活动任务':'无活动任务'}</dd><dt>恢复限制</dt><dd>不修复数据、不清空索引、不删除磁盘文件。主进程卡死不能保证此入口可用。</dd></dl>}
 </section>}</div>
 {current&&<div className="rm-overlay"><section role="dialog" aria-modal="true" aria-label="恢复影响确认" tabIndex={-1} ref={el=>el?.focus()} onKeyDown={e=>{if(e.key==='Escape')setConfirm(null);if(e.key==='Tab'){const list=e.currentTarget.querySelectorAll('button');const first=list[0],last=list[list.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}}}><h3>{current.name}</h3><p>{current.note}</p><p>仅模拟执行；不会发送恢复命令。请求已发送不等于恢复成功。</p><button className="rm-confirm" onClick={()=>start(current.id)}>确认模拟执行</button><button onClick={()=>setConfirm(null)}>取消</button></section></div>}
 </section>;
}
