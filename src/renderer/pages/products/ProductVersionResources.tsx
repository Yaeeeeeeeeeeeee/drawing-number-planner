import { useEffect, useState } from 'react';
import type { AppearanceResources } from '../../../core/products/appearance-types';
import type { AppearanceApi, AppearanceVersion } from '../../data/appearance-client';
import type { BomAppearanceApi } from '../../data/bom-appearance-client';
import type { BomVersionSummaryView } from '../../data/client';
import type { ProductVersionTarget } from './ProductAppearancePanel';
const tabs = [['bom','BOM'],['drawings','图号'],['pdf','PDF'],['qr','二维码'],['outbound','外发']] as const;
type Section = ProductVersionTarget['section'];
const sourceLabels: Record<string,string> = {'explicit-reuse':'明确沿用','bom-usage':'BOM 使用',manual:'人工确认',planning:'图号规划','legacy-single-appearance':'旧资料单外观关联','bom-reference':'BOM 引用','explicit':'明确关联','legacy-default':'原始外观关联'};
const countKey = {bom:'boms',drawings:'drawings',pdf:'pdfs',qr:'qrCodes',outbound:'outboundPackages'} as const;
export function ProductVersionResources({api,version,onOpenVersion,onClose}:{api:AppearanceApi & BomAppearanceApi;version:AppearanceVersion;onOpenVersion?:(target:ProductVersionTarget)=>void;onClose:()=>void}) {
  const [tab,setTab]=useState<Section>('bom');
  const [resources,setResources]=useState<AppearanceResources|null>(null);
  const [boms,setBoms]=useState<BomVersionSummaryView[]|null>(null);
  const [error,setError]=useState('');
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    let cancelled=false; setResources(null);setBoms(null);setError('');
    const read=async()=>{
      if(!api.getAppearanceResources)throw new Error('当前服务不支持版本资料查询');
      const data=await api.getAppearanceResources(version.id);
      if(data.appearanceVersionId!==version.id)throw new Error('服务返回的资料不属于所选外观');
      if(!cancelled)setResources(data);
      if(api.listAppearanceBoms){const rows=await api.listAppearanceBoms(version.productId,version.id);if(!cancelled)setBoms(rows);}
    };
    void read().catch(reason=>{if(!cancelled)setError(reason instanceof Error?reason.message:'版本资料加载失败');});
    return()=>{cancelled=true;};
  },[api,version.id,attempt]);
  const unbound=resources?.unboundCounts[countKey[tab]]??0;
  return <section className="product-version-resources" aria-label={`${version.label} 的版本资料`}>
    <div className="row-actions"><h3>{version.label} · 版本资料</h3><button className="text-button" type="button" onClick={onClose}>关闭版本资料</button></div>
    <div role="tablist" aria-label="版本资料分类">{tabs.map(([key,name])=><button role="tab" aria-selected={tab===key} key={key} type="button" className={tab===key?'secondary-button':'text-button'} onClick={()=>setTab(key)}>{name}</button>)}</div>
    {error&&<p role="alert" className="error-banner">{error} <button type="button" className="text-button" onClick={()=>setAttempt(n=>n+1)}>重试资料查询</button></p>}
    {!resources&&!error&&<p>正在读取版本资料…</p>}
    {resources&&<div role="tabpanel">
      {unbound>0&&<p className="muted-text">另有 {unbound} 条未明确归属外观的记录，未列为本版本资料。</p>}
      {tab==='bom'&&(boms===null?<p>{api.listAppearanceBoms?'正在读取版本 BOM…':'当前服务未提供版本 BOM 列表。'}</p>:boms.length?<ul>{boms.map(b=><li key={b.id}><button type="button" className="text-button" disabled={!onOpenVersion} onClick={()=>onOpenVersion?.({productId:version.productId,appearanceVersionId:version.id,section:'bom',bomVersionId:b.id})}>BOM #{b.id} · {b.businessChangeDateLabel||b.businessChangeDate||'未记录日期'}</button></li>)}</ul>:<p>此外观暂无 BOM。</p>)}
      {tab==='drawings'&&(resources.drawings.length?<ul>{resources.drawings.map(d=><li key={`${d.origin}:${d.id}`}><strong>{d.fullCode}</strong> <span>#{d.id} · {d.origin==='historical'?'历史图号':'正式图号'} · {sourceLabels[d.source]??'已确认版本关联'}</span></li>)}</ul>:<p>此外观暂无已确认图号。</p>)}
      {tab==='pdf'&&<><p className="muted-text">以下文件根据已确认的图号关联列出；此来源不代表已进入 BOM。</p>{resources.pdfs.length?<ul>{resources.pdfs.map(p=><li key={p.id}><strong>{p.fileName}</strong><small>图号关联 · {p.relativePath}</small></li>)}</ul>:<p>此外观暂无已确认 PDF 关联。</p>}</>}
      {tab==='qr'&&(resources.qrCodes.length?<ul>{resources.qrCodes.map(q=><li key={q.id}><strong>{q.name}</strong> · {q.status==='active'?'已启用':'已停用'} · {q.appearanceVersionId===null?'产品共用':'此外观独立'}{q.targetUrl&&<p>{q.targetUrl}</p>}</li>)}</ul>:<p>此外观暂无二维码配置。</p>)}
      {tab==='outbound'&&(resources.outboundPackages.length?<ul>{resources.outboundPackages.map(p=><li key={p.id}><strong>{p.packageName}</strong> · {p.createdAt} · 冻结快照</li>)}</ul>:<p>暂无明确记录此外观的历史外发包。</p>)}
      <button className="secondary-button" type="button" disabled={!onOpenVersion} onClick={()=>onOpenVersion?.({productId:version.productId,appearanceVersionId:version.id,section:tab})}>进入{tabs.find(([key])=>key===tab)?.[1]}管理</button>
    </div>}
  </section>;
}
