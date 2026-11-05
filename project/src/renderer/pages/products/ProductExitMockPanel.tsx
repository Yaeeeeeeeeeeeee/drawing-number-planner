import { Fragment, useEffect, useRef, useState } from 'react';
import type { PlannerApi, ProductCleanupPreviewView } from '../../data/client';

type CheckRow = { name: string; count: number | string; rule: string; guide: string; blocking?: boolean };
export function ProductExitMockPanel({ api, productId, onCancel, onComplete }: {
  api: PlannerApi; productId: number; onCancel: () => void; onComplete: () => void;
}) {
  const [preview, setPreview] = useState<ProductCleanupPreviewView | null>(null);
  const [error, setError] = useState('');
  const [operationError, setOperationError] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const sending = useRef(false);
  useEffect(() => {
    let live = true;
    setPreview(null); setError(''); setConfirmation(''); setOpen(null);
    void api.previewProductCleanup(productId).then(p => { if (live) setPreview(p); })
      .catch(e => { if (live) setError(e instanceof Error ? e.message : '检查失败'); });
    return () => { live = false; };
  }, [api, productId, retry]);
  const rows: CheckRow[] = preview ? [
    { name: '正式图号', count: preview.owned.drawings, rule: '退出后删除记录，保留占号', guide: '所属数量本身不阻止退出，以阻塞检查为准。产品集中退出使用“删除 / 保留占号”，不释放号码。作废只改变使用状态，也继续占号。若另需彻底删除并释放，必须在图号库执行独立释放预检、完整图号确认及引用检查；这里不提供释放操作。' },
    { name: '历史图号', count: preview.owned.historicalDrawings, rule: '退出后保留占号', guide: '可靠历史图号仍占号，产品退出不能释放号码。图号库可查看历史记录及删除状态；只有独立、明确的释放操作通过完整图号确认和引用保护后才能释放，不以缺失 PDF 或作废代替释放。' },
    { name: 'BOM 版本', count: preview.owned.bomRecords, rule: '退出当前 BOM，历史保留', guide: '所属版本数不是阻塞数。退出会移除当前 BOM 入口并标记所属版本退出，不改写历史快照。若阻塞原因指出其他产品 BOM 引用，请到 BOM 管理按该产品查询、核对并编辑当前引用，再回来重新检查；不要通过删除历史快照绕过引用。' },
    { name: '二维码业务记录', count: preview.owned.qrCodes, rule: '标记删除并停用', guide: '此数量是二维码业务记录，不是文件索引。产品退出标记所属二维码删除、停用，不删除磁盘文件。若单独处理，可在二维码管理核对记录；其删除仍受文件和 BOM 引用保护，不能当作解除所有引用的捷径。' },
    { name: '资料批次', count: preview.owned.batches, rule: '解除产品关联，待确认', guide: '批次保留，退出时解除产品归属并置为待确认，不删除批次或原文件。其他产品批次的文件引用若被预检阻塞，需先在图号库资料批次 / PDF 文件中心核对来源；未确认归属时不要重建或猜测关联。' },
    { name: '历史外发快照', count: preview.preservedSnapshots, rule: '保留，不阻止退出', guide: '不需要先删除。历史产品身份、外发包及资料事实快照保留，不能因当前产品退出而改写或删除。外发资料中的历史入口用于查看，不提供快照清除按钮。' },
    ...(preview.classification ? [
      { name: '已删除业务记录', count: preview.classification.alreadyDeleted, rule: '保留，不作为当前阻塞', guide: '这是已有删除状态记录的汇总，不是可释放图号数。图号删除保留占号与彻底释放仍是两个独立结果，需在图号库回收站逐项核对；此处不自动恢复或释放。' },
      { name: '文件存在的 PDF 索引', count: preview.classification.presentPdfIndexes, rule: '保留索引，解除产品关联', guide: '退出解除关联的图号连接并标记待确认。索引与磁盘原始 PDF 是不同对象；不得删除原 PDF。PDF 文件中心用于核对索引与文件事实，资料库全局清空不是产品退出前置步骤。' },
      { name: '文件缺失的 PDF 索引', count: preview.classification.missingPdfIndexes, rule: '保留索引，不释放图号', guide: '文件缺失不代表图号无效，也不释放占号。无需为退出伪造文件存在状态；在 PDF 文件中心核对资料完整性。不要把索引清理当作磁盘文件删除。' },
      { name: '历史邮件草稿', count: preview.classification.preservedDrafts, rule: '保留，不阻止退出', guide: '无需先删除。草稿属于历史外发包，退出保留草稿与包快照；可在外发资料核对历史，不提供历史清除操作。' },
    ] : []),
    { name: '历史产品身份', count: '保留', rule: '保留身份与退出事件', guide: '产品从当前业务退出，历史身份仍供图号、BOM、外发快照追溯。不提供彻底删除身份或自动恢复功能。' },
    ...preview.blockers.map((reason, i) => ({ name: `阻塞检查 ${i + 1}`, count: reason, rule: '需先处理', blocking: true, guide: `实际阻塞原因：${reason}。后台任务需等待完成或通过原任务入口取消；参考来源需在对应产品编辑中核对参考型号；其他产品引用需在对应 BOM、图号或资料页面核对并按原保护规则处理。现有预检未提供记录定位参数，不能自动跳到指定记录。处理后点击“重新检查”；不要删除受保护的历史记录。仅数量无法判断具体阻塞归属。` })),
  ] : [];
  async function execute() {
    if (sending.current || !preview || preview.blockers.length || confirmation !== preview.model || error) return;
    if (!window.confirm(`确认让 ${preview.model} 退出当前业务？所属图号保留占号，历史身份和快照保留，不删除任何磁盘文件。`)) return;
    sending.current = true; setBusy(true); setOperationError('');
    try { await api.cleanupProduct(productId, confirmation); onComplete(); }
    catch (e) { setOperationError(e instanceof Error ? e.message : '退出失败'); }
    finally { sending.current = false; setBusy(false); }
  }
  return <section className="pm-exit-check" aria-label="关联检查与退出指引">
    <header><strong>关联检查与退出指引</strong><button type="button" disabled={busy} onClick={() => setRetry(n => n + 1)}>重新检查</button></header>
    <p className="pm-check-note">内存样例。查看处理指引不会修改数据；退出保留历史与原始文件。</p>
    {!preview && !error && <p role="status">正在检查关联…</p>}
    {error && <p role="alert" className="pm-check-failure">{error}</p>}
    {preview && <table aria-label="退出关联工作表"><colgroup><col style={{width:'25%'}}/><col style={{width:'16%'}}/><col style={{width:'35%'}}/><col style={{width:'24%'}}/></colgroup>
      <thead><tr><th>关联项目</th><th>数量 / 摘要</th><th>处理规则</th><th>操作</th></tr></thead>
      <tbody>{rows.map(row => <Fragment key={row.name}><tr className={row.blocking?'pm-check-blocked':''}>
        <td>{row.name}</td><td><strong>{row.count}</strong></td><td>{row.rule}</td>
        <td><button type="button" aria-expanded={open===row.name} onClick={() => setOpen(open===row.name?null:row.name)}>{open===row.name?'收起指引':'查看处理指引'}</button></td>
      </tr>{open===row.name&&<tr><td colSpan={4} className="pm-check-guide"><p>{row.guide}</p><small>Mock 内不跳转真实页面，不执行关联修改。</small></td></tr>}</Fragment>)}</tbody></table>}
    <footer>
      <div role="status">预检结论：<strong className={error?'pm-check-failure':preview?.blockers.length?'pm-check-blocked':''}>{error?'检查失败':preview?preview.blockers.length?'需先处理':'可退出':'检查中'}</strong></div>
      {preview && <label>输入型号确认<input aria-label="输入型号确认" value={confirmation} disabled={busy} placeholder={preview.model} onChange={e => setConfirmation(e.target.value)}/></label>}
      {operationError && <p role="alert" className="pm-check-failure">{operationError}</p>}
      <div className="pm-check-actions"><button type="button" className="pm-danger" disabled={busy||!preview||Boolean(error)||Boolean(preview?.blockers.length)||confirmation!==preview?.model} onClick={() => void execute()}>{busy?'正在退出…':'确认删除档案'}</button><button type="button" disabled={busy} onClick={onCancel}>取消</button></div>
    </footer>
  </section>;
}
