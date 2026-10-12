import { useMemo, useState } from 'react';

import type { ImportReportView, PlannerApi } from '../data/client';
import { DataTable } from '../components/DataTable';
import { isMigrationMock, MigrationMockPage } from './migration-mock';

export function ImportPage({ api }: { api: PlannerApi }) {
  return isMigrationMock() ? <MigrationMockPage/> : <ImportWorkspace api={api}/>;
}
function ImportWorkspace({ api }: { api: PlannerApi }) {
  const [file, setFile] = useState<File | null>(null); const [auditId, setAuditId] = useState('');
  const [report, setReport] = useState<ImportReportView | null>(null); const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [error, setError] = useState('');
  const [reportView,setReportView] = useState<'issues'|'candidates'>('issues');
  const [issueSearch,setIssueSearch] = useState('');
  const [consumed, setConsumed] = useState(false);
  const conflicted = useMemo(() => new Set(report?.issues.flatMap((issue) => issue.candidateIds ?? []) ?? []), [report]);
  const eligibleIds = useMemo(() => report?.candidates.filter((candidate) => !conflicted.has(candidate.id)).map((candidate) => candidate.id) ?? [], [report, conflicted]);
  const audit = async () => { if (!file) return; setBusy(true); setError(''); setMessage(''); try { const result = await api.auditWorkbook(file);
    setAuditId(result.auditId); setReport(result.report); setSelected([]); setConsumed(false); } catch (reason) { setError(reason instanceof Error ? reason.message : '检查失败'); } finally { setBusy(false); } };
  const confirm = async () => { setBusy(true); setError(''); try { const result = await api.confirmImport(auditId, selected); setMessage(`已导入 ${result.imported} 条，跳过 ${result.skipped} 条`); setSelected([]); setConsumed(true); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '导入失败'); } finally { setBusy(false); } };
  const toggle = (id: string) => {
    if (busy || consumed || conflicted.has(id)) return;
    setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  };
  return <section className="page-surface page-enter migration-integrated"><header className="page-header"><div><p className="eyebrow">EXCEL MIGRATION</p><h1>迁移检查</h1><p>先检查、再选择、最后导入；原始 Excel 文件不会被修改。</p></div></header>
    <div className="upload-strip"><label className="file-picker"><span>选择 Excel 文件</span><input aria-label="选择 Excel 文件" type="file" accept=".xlsx,.xls" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
      <span className="file-name">{file?.name ?? '尚未选择文件'}</span><button className="primary-button" disabled={!file || busy} onClick={() => void audit()} type="button">{busy ? '检查中…' : '开始检查'}</button></div>
    {error && <p className="error-banner">{error}</p>}{message && <p className="success-banner">{message}</p>}
    {report && <><div className={report.issues.length ? 'audit-summary warning' : 'audit-summary'}><strong>{report.issues.length ? `发现 ${report.issues.length} 个问题` : '未发现冲突'}</strong><span>候选 {report.candidates.length} 条</span><span>可导入 {eligibleIds.length} 条</span></div>
      <nav className="segmented-tabs" aria-label="检查结果视图"><button type="button" aria-pressed={reportView==='issues'} onClick={()=>setReportView('issues')}>异常明细 {report.issues.length}</button><button type="button" aria-pressed={reportView==='candidates'} onClick={()=>setReportView('candidates')}>导入候选 {report.candidates.length}</button></nav>{reportView==='issues' && <><label>筛选异常<input aria-label="筛选异常" value={issueSearch} onChange={e=>setIssueSearch(e.target.value)}/></label>{!report.issues.length && <p>本次 Excel 检查未发现异常；未执行其他业务模块检查。</p>}{report.issues.filter(issue=>`${issue.code} ${issue.value ?? ''} ${issue.message} ${issue.sourceCell}`.includes(issueSearch)).map((issue, index) => <div className="issue-row" key={`${issue.code}-${index}`}><span>{issue.code}</span><strong>{issue.value ?? issue.dictionaryType}</strong><p>{issue.message} · {issue.sourceCell}</p></div>)}</>}
      <div hidden={reportView !== 'candidates'}>
      <div className="selection-actions"><button className="secondary-button" disabled={busy || consumed || !eligibleIds.length} onClick={() => setSelected(eligibleIds)} type="button">全选可导入项</button><button className="secondary-button" disabled={busy || !selected.length} onClick={() => setSelected([])} type="button">取消全选</button></div>
      <DataTable items={report.candidates} columns={[{ key: 'select', label: '导入', render: (item) => <input aria-label={`选择 ${item.name}`} type="checkbox" disabled={busy || consumed || conflicted.has(item.id)} checked={selected.includes(item.id)} onChange={() => toggle(item.id)} /> },
        { key: 'type', label: '字典', render: (item) => item.type }, { key: 'code', label: '编码', render: (item) => <span className="mono">{item.code}</span> },
        { key: 'name', label: '名称', render: (item) => item.name }, { key: 'source', label: '来源单元格', render: (item) => item.sourceCell }]} />
      <div className="bottom-actions"><span>已选择 {selected.length} 条</span><button className="primary-button" disabled={!selected.length || busy || consumed} onClick={() => void confirm()} type="button">确认导入</button></div>
      </div>{consumed && <p className="hint-text">本次检查已完成导入，请重新检查后继续导入。</p>}</>}
  </section>;
}
