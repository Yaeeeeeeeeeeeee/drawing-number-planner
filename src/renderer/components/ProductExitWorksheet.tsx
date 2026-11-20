import { useState } from 'react';
import type { ProductCleanupPreviewView } from '../data/client';

export function ProductExitWorksheet({preview,selectable=false}:{preview:ProductCleanupPreviewView;selectable?:boolean}) {
  const [expanded,setExpanded]=useState<string|null>(null);
  const rows: Array<[string,number|string,string,string]> = [
    ['正式图号',preview.owned.drawings,'退出记录，保留占号','不会释放图号。正式图号与历史图号占用保持原规则；释放必须使用原有独立安全流程。'],
    ['历史图号',preview.owned.historicalDrawings,'保留占号','历史占用不因产品退出自动释放。'],
    ['BOM 记录',preview.owned.bomRecords,'退出当前记录，历史保留','所属数量不是必须手动删除的阻塞数量。实际阻塞由完整预检列出；不可删除历史快照来清除阻塞。'],
    ['二维码业务记录',preview.owned.qrCodes,'按原规则退出','业务记录与文件索引不同；不会删除磁盘附件。'],
    ['资料批次',preview.owned.batches,'按原规则解除产品关联','具体处理由原集中退出服务执行，不会移动或删除实际文件。'],
    ['历史外发快照',preview.preservedSnapshots,'保留，不阻止退出','必须保留外发时的身份与资料事实，不提供删除入口。'],
    ['已删除业务记录',preview.classification?.alreadyDeleted ?? '未提供','保留，不作为当前阻塞','历史身份保留，不能当作当前阻塞关系。'],
    ['文件存在的 PDF 索引',preview.classification?.presentPdfIndexes ?? '未提供','保留索引，解除产品关联','PDF 原始文件不会删除；文件状态与图号占用状态独立。'],
    ['文件缺失的 PDF 索引',preview.classification?.missingPdfIndexes ?? '未提供','保留索引，不释放图号','缺失表示文件事实，不表示图号可以释放。'],
    ['历史邮件草稿',preview.classification?.preservedDrafts ?? '未提供','保留，不阻止退出','保留历史业务记录，不提供误导性的删除入口。'],
    ['历史产品身份','保留','保留身份与退出事件','退出不是抹除历史身份，原业务关联保护仍执行。'],
  ];
  return <div className="product-exit-work"><h3>关联检查与退出指引</h3><table><thead><tr>{['关联项目','数量 / 摘要','处理规则','操作'].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{rows.map(([label,count,rule,guide])=><tr key={label}><td>{label}</td><td><strong>{count}</strong></td><td>{selectable?'见下方处理选项及影响说明':rule}{expanded===label && <p className="exit-guide">{selectable?'图号占用与业务历史分别选择；共享文件索引、实际文件及必要审计保留。':guide}仅下方真实阻塞信息决定是否需先处理。</p>}</td><td><button className="text-button" type="button" aria-expanded={expanded===label} onClick={()=>setExpanded(expanded===label?null:label)}>{expanded===label?'收起规则':'查看规则'}</button></td></tr>)}</tbody></table><p>预检结论：<strong>{preview.blockers.length?'需先处理':'可退出'}</strong>。最终确认仍由原服务校验。</p></div>;
}
