import { PageHeader } from '../components/PageHeader';
import { Fragment, useMemo, useState } from 'react';

import type { ImportReportView, PlannerApi } from '../data/client';
import { DataTable } from '../components/DataTable';
import { isMigrationMock, MigrationMockPage } from './migration-mock';
const dictionaryLabels: Record<string,string> = {brand:'品牌',product_size:'品类尺寸',appearance:'外观',color:'颜色',main_category:'主类别',project_item:'项目明细',layer_count:'兼容层数数据'};
const issueLabels: Record<string,string> = {DUPLICATE_CODE:'工作簿重复编码',INCOMPLETE_ROW:'字段不完整',DATABASE_CONFLICT:'数据库编码冲突',AMBIGUOUS_PARENT:'主类别有歧义',MISSING_PARENT:'缺少主类别'};

export function ImportPage({ api }: { api: PlannerApi }) {
  return isMigrationMock() ? <MigrationMockPage/> : <ImportWorkspace api={api}/>;
}
function ImportWorkspace({ api }: { api: PlannerApi }) {
  const [file, setFile] = useState<File | null>(null); const [auditId, setAuditId] = useState('');
  const [report, setReport] = useState<ImportReportView | null>(null); const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [error, setError] = useState('');
  const [reportView,setReportView] = useState<'issues'|'candidates'>('issues');
  const [issueSearch,setIssueSearch] = useState('');
  const [dictionaryFilter,setDictionaryFilter] = useState('all');
  const [resultFilter,setResultFilter] = useState('all');
  const [openIssue,setOpenIssue] = useState<number|null>(null);
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
  const matches = (type:string,text:string) => (dictionaryFilter==='all'||dictionaryFilter===type)&&text.toLowerCase().includes(issueSearch.toLowerCase());
  const visibleCandidates = report?.candidates.filter(item => matches(item.type,`${item.code} ${item.name} ${item.sourceCell} ${item.parentName ?? ''}`) && (resultFilter==='all'||resultFilter==='eligible'&&!conflicted.has(item.id)||resultFilter==='blocked'&&conflicted.has(item.id))) ?? [];
  return <section className="page-surface page-enter migration-integrated mm-page"><PageHeader title="迁移检查" description="核对导入候选与问题记录，确认范围后执行迁移。"></PageHeader>
    <div className="mm-source"><label className="file-picker"><span>选择 Excel 文件</span><input aria-label="选择 Excel 文件" type="file" accept=".xlsx,.xls" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
      <strong>{file?.name ?? '尚未选择文件'}</strong><button className="primary-button" disabled={!file || busy} onClick={() => void audit()} type="button">{busy ? '检查中…' : '开始检查'}</button></div>
    <p className="mm-scope">检查范围：“新版图号”工作表的固定字典列与编码/父级关系。未检查历史图号、BOM、PDF 或跨批次复用；原文件不修改。</p>
    {error && <p className="error-banner">{error}</p>}{message && <p className="success-banner">{message}</p>}
    {!report&&!busy&&!error&&<p className="mm-empty">选择 Excel 文件并开始检查，尚无有效报告。</p>}
    {report && <><div className="mm-summary"><strong>{report.issues.length ? `发现 ${report.issues.length} 个问题` : '未发现冲突'}</strong><span>候选 {report.candidates.length} 条</span><span>受影响候选 <strong>{conflicted.size}</strong></span><span>可导入 {eligibleIds.length} 条</span><small>子项导入还需核对所选父级。</small></div>
      <div className="mm-tools"><nav className="mm-tabs" aria-label="检查结果视图"><button type="button" aria-pressed={reportView==='issues'} onClick={()=>{setReportView('issues');setResultFilter('all');}}>异常明细 {report.issues.length}</button><button type="button" aria-pressed={reportView==='candidates'} onClick={()=>{setReportView('candidates');setResultFilter('all');}}>导入候选 {report.candidates.length}</button></nav><input aria-label="筛选异常" placeholder="编码、名称、来源或原因" value={issueSearch} onChange={e=>setIssueSearch(e.target.value)}/><select aria-label="字典类型" value={dictionaryFilter} onChange={e=>setDictionaryFilter(e.target.value)}><option value="all">全部字典范围</option>{Object.entries(dictionaryLabels).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select><select aria-label="结果筛选" value={resultFilter} onChange={e=>setResultFilter(e.target.value)}><option value="all">全部结果</option>{reportView==='issues'?Object.entries(issueLabels).map(([value,label])=><option value={value} key={value}>{label}</option>):<><option value="eligible">无已知冲突</option><option value="blocked">禁止导入</option></>}</select></div>
      {reportView==='issues' && <>{!report.issues.length && <p>本次 Excel 检查未发现异常；未执行其他业务模块检查。</p>}<table aria-label="迁移问题工作表"><colgroup>{[22,14,22,22,20].map((width,index)=><col key={index} style={{width:`${width}%`}}/>)}</colgroup><thead><tr>{['问题类型','字典范围','数据摘要','来源单元格','操作'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{report.issues.map((issue,index)=>matches(issue.dictionaryType,`${issue.code} ${issue.value ?? ''} ${issue.message} ${issue.sourceCell}`)&&(resultFilter==='all'||resultFilter===issue.code)?<Fragment key={`${issue.code}-${index}`}><tr><td><span className={issue.code.includes('PARENT')||issue.code==='INCOMPLETE_ROW'?'mm-warning':'mm-conflict'}>{issueLabels[issue.code]??issue.code}</span></td><td>{dictionaryLabels[issue.dictionaryType]??issue.dictionaryType}</td><td>{issue.value??'—'}</td><td>{issue.sourceCell}</td><td><button type="button" aria-expanded={openIssue===index} onClick={()=>setOpenIssue(openIssue===index?null:index)}>{openIssue===index?'收起原因':'查看原因'}</button></td></tr>{openIssue===index&&<tr><td colSpan={5} className="mm-detail"><p>{issue.message}</p><small>{issue.candidateIds?.length?`关联候选 ${issue.candidateIds.length} 条，禁止选择。`:'没有关联候选，仍需核对源表。'}</small></td></tr>}</Fragment>:null)}</tbody></table></>}
      <div hidden={reportView !== 'candidates'}>
      <div className="selection-actions"><button className="secondary-button" disabled={busy || consumed || !eligibleIds.length} onClick={() => setSelected(eligibleIds)} type="button">全选可导入项（含筛选外）</button><button className="secondary-button" disabled={busy || !selected.length} onClick={() => setSelected([])} type="button">取消全选</button></div>
      <DataTable fillViewport items={visibleCandidates} columns={[{ key: 'select', label: '导入', render: (item) => <input aria-label={`选择 ${item.name}`} type="checkbox" disabled={busy || consumed || conflicted.has(item.id)} checked={selected.includes(item.id)} onChange={() => toggle(item.id)} /> },
        { key: 'type', label: '字典', render: (item) => dictionaryLabels[item.type]??item.type }, { key: 'code', label: '编码', render: (item) => <strong>{item.code}</strong> },
        { key: 'name', label: '名称', render: (item) => item.name }, {key:'parent',label:'父级',render:item=>item.parentName??'—'}, { key: 'source', label: '来源单元格', render: (item) => item.sourceCell },{key:'result',label:'核查结果',render:item=>conflicted.has(item.id)?<span className="mm-conflict">禁止导入</span>:'无已知冲突'}]} />
      <div className="bottom-actions"><span>已选择 {selected.length} 条</span><button className="primary-button" disabled={!selected.length || busy || consumed} onClick={() => void confirm()} type="button">确认导入</button></div>
      {selected.some(id=>!visibleCandidates.some(item=>item.id===id))&&<p className="mm-warning">其中 {selected.filter(id=>!visibleCandidates.some(item=>item.id===id)).length} 条在当前筛选外，确认将一并导入。</p>}
      </div>{consumed && <p className="hint-text">本次检查已完成导入，请重新检查后继续导入。</p>}</>}
  </section>;
}
