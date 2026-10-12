export function BomRecordNotices({ index, drawingStatus, batchMissing = false, previewFailed = false, noCandidates = false, blocked = false }: {
  index: number; drawingStatus?: string; batchMissing?: boolean; previewFailed?: boolean; noCandidates?: boolean; blocked?: boolean;
}) {
  const notices = [drawingStatus === 'voided' && '图号作废', drawingStatus === 'inactive' && '图号停用', noCandidates && '图号无候选', batchMissing && '批次缺失', previewFailed && '附件预览失败'].filter(Boolean);
  // Empty attachments are legal optional values, not new validation errors.
  return notices.length || blocked ? <span className="bom-record-notices" aria-label={`项目 ${index} 提示`}>{notices.map((notice) => <span data-tone={notice === '图号作废' || notice === '图号停用' ? 'error' : 'warning'} key={String(notice)}>{notice}</span>)}{blocked && <span data-tone="error">保存阻塞</span>}</span> : null;
}
