/** Runs inside the isolated print document and in the browser preview. */
export async function checkBomExportDocument(doc: Document, id: number, revision: number): Promise<string | null> {
  if (doc.body?.dataset.bomExport !== String(id) || doc.body.dataset.editRevision !== String(revision)) {
    try {
      const body = JSON.parse(doc.body?.textContent ?? '');
      if (typeof body.error?.message === 'string') return body.error.message;
    } catch { /* A response that is not an export document cannot be printed. */ }
    return '无法读取所选 BOM 用于导出，请重新打开记录';
  }
  await doc.fonts.ready;
  const results = await Promise.all(Array.from(doc.images, async image => {
    try {
      await image.decode();
      if (image.naturalWidth > 0 && image.naturalHeight > 0) return '';
    } catch { /* Consult the attachment service to distinguish read and decode failures. */ }
    let reason = '图片无法解码';
    try {
      const response = await doc.defaultView!.fetch(image.src, { cache: 'no-store' });
      if (!response.ok) {
        const body = await response.json();
        reason = body.error?.message || `附件读取失败（HTTP ${response.status}）`;
      } else {
        void response.body?.cancel().catch(() => undefined);
      }
    } catch { reason = '附件连接或读取失败'; }
    return `${image.alt}：${reason}`;
  }));
  return results.filter(Boolean).join('；') || null;
}
