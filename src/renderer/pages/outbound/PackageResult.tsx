import { Fragment, useState } from 'react';
import type { CreatedOutboundPackageView } from '../../data/client';
import { openOutboundPackageLocation } from '../../desktop-files';

/** Renders returned package facts only; never creates or changes packages. */
export function PackageResult({value}:{value:CreatedOutboundPackageView}) {
  const [expanded,setExpanded]=useState<number|null>(null);
  const [error,setError]=useState('');
  const parts=value.parts?.length?value.parts:[{partNumber:1,zipRelativePath:value.zipRelativePath,sizeBytes:null}];
  const open=async(partNumber?:number)=>{const result=await openOutboundPackageLocation(value.id,partNumber);if(!result.ok)setError(result.error?.message??'打开位置失败');};
  return <section className="approved-package-result"><div className="ob-section-head"><strong className="ob-good">压缩包已生成</strong><span className="ob-muted">{value.fileCount} 个文件 · {parts.length} 个分包</span></div><div className="ob-table"><table aria-label="ZIP 分包结果"><thead><tr><th>分包名称</th><th>大小</th><th>文件数量</th><th>操作</th></tr></thead><tbody>{parts.map(part=><Fragment key={part.partNumber}><tr><td>{part.zipRelativePath.split(/[\\/]/).at(-1)}</td><td>{part.sizeBytes===null?'未记录':`${(part.sizeBytes/1_000_000).toFixed(2)} MB`}</td><td>{parts.length===1?`${value.fileCount} 个`:<span title="现有返回值未提供每份文件数量；总文件数见上方">未提供</span>}</td><td><div className="ob-part-actions"><button className="text-button" type="button" aria-expanded={expanded===part.partNumber} onClick={()=>setExpanded(expanded===part.partNumber?null:part.partNumber)}>{expanded===part.partNumber?'收起路径':'查看路径'}</button><button className="text-button" type="button" onClick={()=>void open(part.partNumber)}>打开第{part.partNumber}份位置</button></div></td></tr>{expanded===part.partNumber&&<tr className="ob-part-path-row"><td colSpan={4}><div className="ob-path"><span>{part.zipRelativePath}</span></div></td></tr>}</Fragment>)}</tbody></table></div><button className="text-button" type="button" onClick={()=>void open()}>打开位置</button>{error&&<p role="alert" className="error-banner">{error}</p>}</section>;
}
