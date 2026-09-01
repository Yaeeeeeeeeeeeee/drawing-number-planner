export interface DesktopFileResult {
  ok: boolean;
  error?: { code: string; message: string };
}

declare global {
  interface PlannerDesktop {
    showFileInFolder(pdfFileId: number): Promise<DesktopFileResult>;
  }
  interface Window {
    plannerDesktop?: PlannerDesktop;
  }
}

export async function openIndexedPdfLocation(pdfFileId: number): Promise<DesktopFileResult> {
  if (!Number.isInteger(pdfFileId) || pdfFileId <= 0) {
    return { ok: false, error: { code: 'INVALID_PDF_FILE_ID', message: 'PDF 文件索引无效' } };
  }
  if (!window.plannerDesktop) {
    return { ok: false, error: { code: 'DESKTOP_ONLY', message: '请在 Windows 桌面版打开文件位置' } };
  }
  try { return await window.plannerDesktop.showFileInFolder(pdfFileId); }
  catch (error) {
    return { ok: false, error: { code: 'OPEN_FILE_LOCATION_FAILED',
      message: error instanceof Error ? error.message : '打开文件位置失败' } };
  }
}
