import { CopyButton } from '../../components/CopyButton';
import { Fragment, useMemo, useState } from 'react';
import type { OutboundPackageModeView } from '../../data/client';
import { EmailComposer } from './EmailComposer';
import { ContactsManager } from './ContactsManager';
import { TemplateSettings } from './TemplateSettings';
import type { OutboundMailContext } from './PackageBuilder';
import { createOutboundMockStore, createOutboundReferenceMockApi, mockMaterials, mockProducts, type MockPackage, type MockScenario } from './outbound-mock';

const labels={normal:'正常',carried_forward:'历史沿用',missing:'缺失',conflict:'冲突',needs_confirmation:'待确认'};
const displayFileName = (name: string) => name.replace(/\.pdf$/i, '');
function CopyValue({value,label}:{value:string;label:string}) {
  const [feedback,setFeedback]=useState('');
  return <div className="ob-path"><span>{value}</span><div className="ob-path-copy"><CopyButton label={label} className="text-button" type="button" onClick={async()=>{try{await navigator.clipboard.writeText(value);setFeedback('已复制');}catch{setFeedback('请选中文本复制');}}} /><small role="status">{feedback}</small></div></div>;
}
function PartsTable({value}:{value:MockPackage}) {
  const [message,setMessage]=useState('');
  const [expanded,setExpanded]=useState<string|null>(null);
  return <><div className="ob-table"><table aria-label="ZIP 分包结果"><thead><tr>{['分包名称','大小','文件数量','操作'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{value.parts.map((part,index)=><Fragment key={part.name}><tr><td>{part.name}</td><td>{(part.sizeBytes/1_000_000).toFixed(2)} MB</td><td>{part.count} 个</td><td><div className="ob-part-actions"><button type="button" className="text-button" aria-expanded={expanded===part.name} aria-controls={`ob-part-path-${value.id}-${index}`} onClick={()=>setExpanded(expanded===part.name?null:part.name)}>{expanded===part.name?'收起路径':'查看路径'}</button><button type="button" className="text-button" onClick={()=>setMessage('Mock：仅模拟打开位置，未调用桌面桥接。')}>打开位置</button></div></td></tr>{expanded===part.name&&<tr className="ob-part-path-row"><td colSpan={4}><div id={`ob-part-path-${value.id}-${index}`}><CopyValue value={part.path} label="复制路径"/></div></td></tr>}</Fragment>)}</tbody></table></div>{message&&<p role="status" className="ob-muted">{message}</p>}</>;
}
export function OutboundMockPage() {
  const api=useMemo(()=>createOutboundReferenceMockApi(),[]);
  const store=useMemo(()=>createOutboundMockStore(),[]);
  const [productId,setProductId]=useState('-1');
  const [batch,setBatch]=useState('03.20261001');
  const [mode,setMode]=useState<OutboundPackageModeView>('change_only');
  const [materialType,setMaterialType]=useState<'initial'|'update'>('update');
  const [scenario,setScenario]=useState<MockScenario>('normal');
  const [preview,setPreview]=useState<ReturnType<typeof mockMaterials>|null>(null);
  const [selected,setSelected]=useState<number[]>([]);
  const [result,setResult]=useState<MockPackage|null>(null);
  const [context,setContext]=useState<OutboundMailContext|null>(null);
  const [error,setError]=useState('');
  const [history,setHistory]=useState(()=>store.history());
  const [expanded,setExpanded]=useState<number|null>(null);
  const [maintenance,setMaintenance]=useState<'contacts'|'templates'|null>(null);
  const product=mockProducts.find(row=>String(row.id)===productId)!;
  const invalidate=()=>{setPreview(null);setResult(null);setError('');};
  const load=()=>{const rows=mockMaterials(mode,scenario,batch).map(row=>({...row,name:row.name.replace('F60',product.model)}));setPreview(rows);setSelected(rows.filter(row=>row.selectable).map(row=>row.id));setResult(null);setError('');};
  const generate=()=>{if(!preview)return;try{const value=store.generate(preview,selected,product,mode);setResult(value);setHistory(store.history());setError('');setContext({packageName:value.name,packageFiles:value.parts.map(part=>part.name),product,materialType,items:value.items.map(row=>({projectItemName:displayFileName(row.name.split('-').at(-1)??row.name),fileName:row.name,sourceBatchName:row.batch,pdfFileId:row.id,changeDetails:row.changeDetails}))});}catch(reason){setError(reason instanceof Error?reason.message:'模拟生成失败');}};
  const blockers=preview?.some(row=>!row.selectable)??false;
  return <section className="page-surface outbound-mock-page">
    <header className="page-header"><div><h1>外发资料</h1><p>核对资料、整理分包与邮件草稿。系统不会发送邮件。</p></div><div className="ob-actions"><button type="button" className="text-button" onClick={()=>setMaintenance(maintenance==='contacts'?null:'contacts')}>联系人维护</button><button type="button" className="text-button" onClick={()=>setMaintenance(maintenance==='templates'?null:'templates')}>模板与签名</button></div></header>
    <p className="ob-mock-notice">开发 Mock · 仅内存样例，不调用真实 API、数据库、文件服务、ZIP 写入、目录选择或桌面桥接。</p>
{maintenance&&<section className="ob-maintenance"><div className="ob-section-head"><h2>{maintenance==='contacts'?'联系人维护':'模板与签名'}</h2><button type="button" className="text-button" onClick={()=>setMaintenance(null)}>返回外发工作</button></div>{maintenance==='contacts'?<ContactsManager api={api} hideDefaultType/>:<TemplateSettings api={api} fieldHelper/>}</section>}
    <div hidden={maintenance!==null}>
    <section className="ob-step" aria-labelledby="ob-prepare"><div className="ob-section-head"><h2 id="ob-prepare">1. 准备外发资料</h2><label className="ob-scenario"><span>Mock 场景</span><select aria-label="Mock 场景" value={scenario} onChange={event=>{setScenario(event.target.value as MockScenario);invalidate();}}><option value="normal">正常 / 多分包</option><option value="exceptions">缺失 / 冲突 / 待确认</option><option value="oversize">单文件超过 50MB</option></select></label></div>
    <div className="ob-selection"><label><span>品牌</span><select aria-label="品牌"><option>样例品牌</option></select></label><label><span>产品</span><select aria-label="产品" value={productId} onChange={event=>{setProductId(event.target.value);invalidate();}}>{mockProducts.map(row=><option key={row.id} value={row.id}>{row.sku} · {row.model} · {row.productCategory}</option>)}</select></label><label><span>资料批次</span><select aria-label="资料批次" value={batch} onChange={event=>{setBatch(event.target.value);invalidate();}}><option>03.20261001</option><option>02.20260901</option></select></label><label><span>资料类型</span><select aria-label="打包资料类型" value={materialType} onChange={event=>{setMaterialType(event.target.value as 'initial'|'update');invalidate();}}><option value="initial">首批资料</option><option value="update">更新资料</option></select></label></div>
    <fieldset className="ob-modes"><legend>打包模式</legend><label><input type="radio" name="ob-mode" checked={mode==='change_only'} onChange={()=>{setMode('change_only');invalidate();}}/>本次变更资料</label><label><input type="radio" name="ob-mode" checked={mode==='current_complete'} onChange={()=>{setMode('current_complete');invalidate();}}/>当前完整包材资料</label></fieldset>
    <div className="ob-section-head"><button type="button" className="primary-button" onClick={load}>预览文件</button></div>
    {preview&&<><div className="ob-section-head"><strong>打包清单 · {preview.length} 项 / 已选 {selected.length} 项</strong><div className="ob-actions"><button type="button" className="text-button" onClick={()=>setSelected(preview.filter(row=>row.selectable).map(row=>row.id))}>全选可用文件</button><button type="button" className="text-button" onClick={()=>setSelected([])}>取消全选</button></div></div>
    <div className="ob-table"><table aria-label="外发文件工作表"><colgroup><col style={{width:'5%'}}/><col style={{width:'28%'}}/><col style={{width:'18%'}}/><col style={{width:'12%'}}/><col style={{width:'9%'}}/><col style={{width:'8%'}}/><col style={{width:'12%'}}/><col style={{width:'8%'}}/></colgroup><thead><tr>{['选择','文件名','图号','资料批次','来源','文件状态','资料状态','说明'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{preview.map(row=><tr key={row.id}><td><input type="checkbox" aria-label={`选择 ${displayFileName(row.name)}`} checked={selected.includes(row.id)} disabled={!row.selectable} onChange={()=>setSelected(value=>value.includes(row.id)?value.filter(id=>id!==row.id):[...value,row.id])}/></td><td>{displayFileName(row.name)}</td><td className="ob-code">{row.code}</td><td>{row.batch}</td><td><span className={`ob-source-badge ${row.source==='历史沿用'?'historical':'current'}`}>{row.source}</span></td><td><span className={row.isPresent?'ob-good':'ob-error'}>{row.isPresent?'可用':'缺失'}</span></td><td><span className={`ob-state ${row.state}`}>{labels[row.state]}</span></td><td>{row.reason||`${(row.sizeBytes/1_000_000).toFixed(0)} MB · 可选择`}</td></tr>)}</tbody></table></div>
    {blockers&&<p className="ob-error" role="status">存在缺失、冲突或待确认资料，处理后才能打包。取消勾选不会绕过阻塞。</p>}
    <div className="ob-section-head"><button className="primary-button" type="button" disabled={blockers||selected.length===0} onClick={generate}>生成压缩包</button></div></>}
    {error&&<p role="alert" className="ob-error">{error}</p>}
    </section>
    <section className="ob-step" aria-labelledby="ob-result"><h2 id="ob-result">2. 生成外发结果</h2>{result?<><div className="ob-section-head"><strong className="ob-good">模拟压缩包已生成</strong><span className="ob-muted">{result.items.length} 个文件 · {result.parts.length} 个分包</span></div><PartsTable value={result}/></>:null}
    <h3>邮件草稿</h3><EmailComposer api={api} mailContext={context} filterRecipients/></section>
    <details className="ob-history"><summary>外发历史 · {history.length} 条记录</summary><div className="ob-table"><table aria-label="外发历史"><thead><tr>{['外发包','产品','打包模式','生成时间','文件 / 分包','操作'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{history.map(value=><Fragment key={value.id}><tr><td>{value.name}</td><td>{value.product}</td><td>{value.mode}</td><td>{value.createdAt}</td><td>{value.items.length} / {value.parts.length}</td><td><button type="button" className="text-button" aria-expanded={expanded===value.id} onClick={()=>setExpanded(expanded===value.id?null:value.id)}>{expanded===value.id?'收起明细':'展开明细'}</button></td></tr>{expanded===value.id&&<tr><td colSpan={6}><div className="ob-history-detail"><PartsTable value={value}/><table aria-label="历史文件快照"><thead><tr><th>文件名</th><th>图号</th><th>批次 / 来源</th><th>修改明细快照</th></tr></thead><tbody>{value.items.map(row=><tr key={row.id}><td>{displayFileName(row.name)}</td><td className="ob-code">{row.code}</td><td>{row.batch} · {row.source}</td><td>{row.changeDetails}</td></tr>)}</tbody></table></div></td></tr>}</Fragment>)}</tbody></table></div></details>
    </div>
  </section>;
}
