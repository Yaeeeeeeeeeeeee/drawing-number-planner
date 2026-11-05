export type QrFileAction = 'open' | 'show' | 'preview';

export interface QrDesktopFileResult {
  ok: boolean;
  previewDataUrl?: string;
  error?: { code: string; message: string };
}

declare global {
  interface PlannerDesktop {
    qrFileAction?(relativePath: string, action: QrFileAction): Promise<QrDesktopFileResult>;
  }
}

function invalidPath(): QrDesktopFileResult {
  return { ok: false, error: { code: 'PATH_OUTSIDE_WORKSPACE', message: '二维码文件路径无效' } };
}

export async function useDesktopQrFile(relativePath: string, action: QrFileAction): Promise<QrDesktopFileResult> {
  if (!relativePath || !window.plannerDesktop?.qrFileAction) {
    return { ok: false, error: { code: 'DESKTOP_ONLY', message: '请在 Windows 桌面版查看二维码文件' } };
  }
  if (relativePath.includes('..') || /^[a-z]:/i.test(relativePath) || relativePath.startsWith('/') || relativePath.startsWith('\\')) {
    return invalidPath();
  }
  try { return await window.plannerDesktop.qrFileAction(relativePath, action); }
  catch (error) {
    return { ok: false, error: { code: 'QR_FILE_ACTION_FAILED', message: error instanceof Error ? error.message : '二维码文件操作失败' } };
  }
}
