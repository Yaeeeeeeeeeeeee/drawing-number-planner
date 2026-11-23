import { bomExportPath } from '../../../core/bom/bom-export-document';
import { checkBomExportDocument } from '../../../core/bom/bom-export-ready';

export async function exportBom(id: number, revision: number): Promise<boolean> {
  if (window.plannerDesktop?.exportBomPdf) {
    const result = await window.plannerDesktop.exportBomPdf(id, revision);
    if (!result.ok) throw new Error(result.error?.message ?? 'BOM PDF 导出失败');
    return !result.cancelled;
  }
  const preview = document.createElement('iframe');
  preview.title = 'BOM PDF 打印预览';
  preview.setAttribute('aria-hidden', 'true');
  preview.style.cssText = 'position:fixed;width:1px;height:1px;border:0;left:-100px;top:0';
  const loaded = new Promise<void>((resolve, reject) => {
    preview.addEventListener('load', () => resolve(), { once: true });
    preview.addEventListener('error', () => reject(new Error('无法加载 BOM 打印预览')), { once: true });
  });
  preview.src = bomExportPath(id, revision);
  document.body.append(preview);
  try {
    await loaded;
    if (!preview.contentDocument || !preview.contentWindow) throw new Error('无法打开 BOM 打印预览');
    const error = await checkBomExportDocument(preview.contentDocument, id, revision);
    if (error) throw new Error(error);
    preview.contentWindow.addEventListener('afterprint', () => preview.remove(), { once: true });
    preview.contentWindow.print();
    return false;
  } catch (error) {
    preview.remove();
    throw error;
  }
}
