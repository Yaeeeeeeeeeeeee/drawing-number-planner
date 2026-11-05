import { useRef, useState } from 'react';
import { composeDrawingCode, composeDrawingPrefix } from '../../core/drawings/drawing-code';
export const isPlanningMock=()=>import.meta.env.DEV&&typeof window!=='undefined'&&new URLSearchParams(window.location.search).get('mock')==='planning';
type Row={id:number;main:string;project:string;color:string;notes:string};
type Result={id:number;full:string;sequence:number;name:string;source:string};
const scenarios={normal:'正常样例',formal:'正式图号占用',historical:'历史图号占用',retained:'删除保留占号',released:'明确释放后推荐',conflict:'图号冲突',stale:'保存时推荐变化',saveFailure:'保存失败',loadFailure:'基础资料加载失败',empty:'无可用字典',missingAppearance:'无默认外观',exhausted:'流水号耗尽',long:'长名称'};
const blank=(id:number):Row=>({id,main:'',project:'',color:'',notes:''});
const mains=[['04','印刷件类'],['05','包装类']];
const projects=[{code:'01',name:'说明书',parent:'04'},{code:'02',name:'铭牌',parent:'04'},{code:'01',name:'包装箱',parent:'05'}];
export function PlanningMockPage(){
 const [scenario,setScenario]=useState('normal');const [product,setProduct]=useState('');const [appearance,setAppearance]=useState('');
 const [rows,setRows]=useState<Row[]>([blank(1)]);const next=useRef(2);const version=useRef(0);const approved=useRef(-1);
 const [results,setResults]=useState<Result[]|null>(null);const [saved,setSaved]=useState<Result[]>([]);const [error,setError]=useState('');const [notice,setNotice]=useState('');const [busy,setBusy]=useState(false);
 const occupied=useRef(new Map<string,number[]>());const pending=useRef(false);
 const invalid=()=>{version.current++;approved.current=-1;setResults(null);setError('');setNotice('规划条件已变化，旧预览失效，请重新查重。');};
 const update=(id:number,key:keyof Row,value:string)=>{setRows(old=>old.map(r=>r.id===id?{...r,[key]:value,...(key==='main'?{project:''}:{})}:r));invalid();};
 const complete=Boolean(product&&appearance&&rows.length&&rows.every(r=>r.main&&r.project&&r.color));
 const check=()=>{
  if(!complete||pending.current)return;pending.current=true;setBusy(true);setResults(null);approved.current=-1;setError('');setNotice('');
  const v=version.current;
  setTimeout(()=>{
   pending.current=false;setBusy(false);if(v!==version.current)return;
   if(scenario==='conflict'||scenario==='exhausted'){setError(scenario==='conflict'?'样例图号冲突：已有占号，不能确认，请重新查重。':'样例编码前缀流水号已用完，不能占号。');return;}
   const allocations=new Map<string,number[]>();const output=rows.map(r=>{
    const parts={brandCode:product==='p2'?'03':'02',productSizeCode:'0404',appearanceCode:appearance,colorCode:r.color,mainCategoryCode:r.main,projectItemCode:r.project};
    const prefix=composeDrawingPrefix(parts);
    const base=scenario==='formal'?[1,2]:scenario==='historical'?[1,7]:scenario==='retained'?[1,5]:scenario==='released'?[1,3]:[];
    const used=allocations.get(prefix)??[...base,...(occupied.current.get(prefix)??[])];const sequence=scenario==='released'&&!used.includes(2)?2:Math.max(0,...used)+1;used.push(sequence);allocations.set(prefix,used);
    return {id:r.id,sequence,full:composeDrawingCode(parts,sequence),name:`样例品牌-${product==='p2'?'F200':'F100'}${r.color==='0'?'白色':'黑色'}-${projects.find(p=>p.parent===r.main&&p.code===r.project)?.name}`,source:scenario==='normal'||scenario==='long'||scenario==='missingAppearance'?'可用推荐（内存）':scenario==='released'?'样例明确释放的流水号可重新推荐':`样例依据：${scenarios[scenario as keyof typeof scenarios]}，仍保留占号`};
   });
   approved.current=v;setResults(output);setNotice('查重预览完成，尚未占号。');
  },350);
 };
 const reserve=()=>{
  if(!results||approved.current!==version.current||pending.current)return;pending.current=true;setBusy(true);setError('');
  const v=version.current;const output=results;
  setTimeout(()=>{pending.current=false;setBusy(false);if(v!==version.current)return;
   if(scenario==='saveFailure'||scenario==='stale'){approved.current=-1;setResults(null);setError(scenario==='stale'?'样例推荐图号已变化，请重新查重后再占号。':'模拟保存失败，未占用任何图号，请重新查重。');return;}
   for(const item of output){const prefix=item.full.slice(0,-3);occupied.current.set(prefix,[...(occupied.current.get(prefix)??[]),item.sequence]);}
   setSaved(output);setResults(null);approved.current=-1;setRows([blank(next.current++)]);setNotice('模拟整批占号成功，未写入真实数据。');
  },400);
 };
 return <section className="page-surface pm-plan"><header className="page-header"><h1>图号规划</h1><label>Mock 场景<select aria-label="Mock 场景" disabled={busy} value={scenario} onChange={e=>{setScenario(e.target.value);invalid();if(e.target.value==='missingAppearance')setAppearance('');}}>{Object.entries(scenarios).map(([v,n])=><option key={v} value={v}>{n}</option>)}</select></label></header>
 {scenario==='loadFailure'?<p role="alert">基础资料加载失败 <button onClick={()=>setScenario('normal')}>重试</button></p>:scenario==='empty'?<p>没有可用字典，不能规划图号。</p>:<>
 <div className="pp-context"><label>产品<select aria-label="产品" disabled={busy} value={product} onChange={e=>{setProduct(e.target.value);setAppearance(scenario==='missingAppearance'?'':'01');invalid();}}><option value="">请选择产品</option><option value="p1">MOCK-100-JP · F100 · 样例品牌</option><option value="p2">MOCK-200-JP · F200 · {scenario==='long'?'长品牌名称样例用于检查选择框与资料核对宽度':'样例品牌乙'}</option></select></label><label>外观<select aria-label="外观" disabled={busy||!product} value={appearance} onChange={e=>{setAppearance(e.target.value);invalid();}}><option value="">请选择外观</option><option value="01">01 · 标准外观</option><option value="10">10 · {scenario==='long'?'完整外观编码与超长名称样例':'另一外观'}</option></select></label></div>
 <div className="pp-derived"><div className="pp-context-fact"><span>品牌</span><strong>{product?product==='p2'?'03 · 样例品牌乙':'02 · 样例品牌':'随产品确定'}</strong></div><div className="pp-context-fact"><span>品类尺寸</span><strong>{product?'0404 · 标准尺寸':'随产品确定'}</strong></div><small>完整外观编码参与生成；产品身份及字典关系不改变。</small></div>
 <div className="pp-toolbar"><strong>规划项目 · {rows.length} 行</strong><button disabled={busy||rows.length>=100} onClick={()=>{setRows(old=>[...old,blank(next.current++)]);invalid();}}>添加项目</button></div>
 <div className="pp-rows">{rows.map((r,index)=><section className="pp-row" key={r.id}><div className="pp-fields"><span className="pp-row-no">{index+1}</span><label>主类别<select aria-label={`第 ${index+1} 行主类别`} disabled={busy} value={r.main} onChange={e=>update(r.id,'main',e.target.value)}><option value="">请选择</option>{mains.map(([c,n])=><option key={c} value={c}>{c} · {n}</option>)}</select></label>
 <label>项目明细<select aria-label={`第 ${index+1} 行项目明细`} disabled={busy||!r.main} value={r.project} onChange={e=>update(r.id,'project',e.target.value)}><option value="">{r.main?'请选择':'先选主类别'}</option>{projects.filter(p=>p.parent===r.main).map(p=><option key={p.code} value={p.code}>{p.code} · {p.name}</option>)}</select></label>
 <label>颜色<select aria-label={`第 ${index+1} 行颜色`} disabled={busy} value={r.color} onChange={e=>update(r.id,'color',e.target.value)}><option value="">请选择</option><option value="0">0 · 白色</option><option value="1">1 · 黑色</option></select></label>
 <label>备注<input aria-label={`第 ${index+1} 行备注`} disabled={busy} value={r.notes} onChange={e=>update(r.id,'notes',e.target.value)}/></label><button disabled={busy||rows.length===1} onClick={()=>{setRows(old=>old.filter(i=>i.id!==r.id));invalid();}}>移除</button></div>
 {results?.find(x=>x.id===r.id)&&<div className="pp-result">{results.filter(x=>x.id===r.id).map(x=><div key={x.id}><small>预计完整图号 · 尚未占号</small><strong className="pp-code">{x.full}</strong><span>推荐流水号 <b>{String(x.sequence).padStart(3,'0')}</b></span><p>{x.name} · {r.notes||'无备注'}</p><small>{x.source}；此来源为 Mock 显式样例，不代表真实接口提供占号明细。</small></div>)}</div>}</section>)}</div>
 <div className="pp-bottom"><span>{complete?'条件完整':`待完成：${!product?'产品、':''}${!appearance?'外观、':''}各行主类别 / 项目明细 / 颜色`}</span><div><button className="primary-button" disabled={!complete||busy} onClick={check}>{busy?'处理中…':'查重并预览'}</button><button className="primary-button" disabled={!results||busy||approved.current!==version.current} onClick={reserve}>确认整批占号（模拟）</button></div></div>
 </>}
 {notice&&<p role="status" className="pp-notice">{notice}</p>}{error&&<p role="alert" className="pp-error">{error}</p>}{saved.length>0&&<div className="pp-saved"><strong>已模拟占用 {saved.length} 个图号</strong>{saved.map(x=><p key={x.id}>{x.full} · {x.name}</p>)}<small>保留本次结果供核对；未创建真实记录或文件。</small></div>}
 </section>;
}
