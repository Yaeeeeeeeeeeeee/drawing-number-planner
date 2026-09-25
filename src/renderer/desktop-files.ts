export interface DesktopFileResult {
  ok: boolean;
  error?: { code: string; message: string };
}

declare global {
  interface PlannerDesktop {
    showFileInFolder(pdfFileId: number): Promise<DesktopFileResult>;
    showBomAssetInFolder?(assetId: number): Promise<DesktopFileResult>;
    chooseOutboundDirectory?(): Promise<DesktopFileResult & { cancelled?: boolean; path?: string }>;
    showOutboundPackageInFolder?(packageId: number, partNumber?: number): Promise<DesktopFileResult>;
  }
  interface Window {
    plannerDesktop?: PlannerDesktop;
  }
}

export async function chooseOutboundDirectory(): Promise<DesktopFileResult & { cancelled?: boolean; path?: string }> {
  if (!window.plannerDesktop?.chooseOutboundDirectory) return { ok: false, error: { code: 'DESKTOP_ONLY', message: '请在 Windows 桌面版选择外发输出目录' } };
  try { return await window.plannerDesktop.chooseOutboundDirectory(); }
  catch (error) { return { ok: false, error: { code: 'SELECT_OUTPUT_FAILED', message: error instanceof Error ? error.message : '选择外发输出目录失败' } }; }
}

export async function openOutboundPackageLocation(packageId: number, partNumber?: number): Promise<DesktopFileResult> {
  if (!Number.isInteger(packageId) || packageId <= 0) return { ok: false, error: { code: 'INVALID_PACKAGE_ID', message: '外发压缩包编号无效' } };
  if (!window.plannerDesktop?.showOutboundPackageInFolder) return { ok: false, error: { code: 'DESKTOP_ONLY', message: '请在 Windows 桌面版打开压缩包位置' } };
  try { return await (partNumber === undefined ? window.plannerDesktop.showOutboundPackageInFolder(packageId)
    : window.plannerDesktop.showOutboundPackageInFolder(packageId, partNumber)); }
  catch (error) { return { ok: false, error: { code: 'OPEN_PACKAGE_FAILED', message: error instanceof Error ? error.message : '打开压缩包位置失败' } }; }
}

export async function openBomAssetLocation(assetId: number): Promise<DesktopFileResult> {
  if (!Number.isInteger(assetId) || assetId <= 0) {
    return { ok: false, error: { code: 'INVALID_BOM_ASSET_ID', message: 'BOM 附件索引无效' } };
  }
  if (!window.plannerDesktop?.showBomAssetInFolder) {
    return { ok: false, error: { code: 'DESKTOP_ONLY', message: '请在 Windows 桌面版打开文件位置' } };
  }
  try { return await window.plannerDesktop.showBomAssetInFolder(assetId); }
  catch (error) {
    return { ok: false, error: { code: 'OPEN_BOM_ASSET_FAILED',
      message: error instanceof Error ? error.message : '打开 BOM 附件位置失败' } };
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
