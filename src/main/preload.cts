const { contextBridge, ipcRenderer } = require('electron') as typeof import('electron');

contextBridge.exposeInMainWorld('plannerDesktop', {
  showFileInFolder(pdfFileId: unknown) {
    if (!Number.isInteger(pdfFileId) || Number(pdfFileId) <= 0) {
      return Promise.resolve({ ok: false, error: { code: 'INVALID_PDF_FILE_ID', message: 'PDF 文件索引无效' } });
    }
    return ipcRenderer.invoke('planner:show-file-in-folder', pdfFileId);
  },
  qrFileAction(relativePath: unknown, action: unknown) {
    if (typeof relativePath !== 'string' || !['open', 'show', 'preview'].includes(String(action))) {
      return Promise.resolve({ ok: false, error: { code: 'INVALID_QR_FILE_ACTION', message: '二维码文件操作无效' } });
    }
    return ipcRenderer.invoke('planner:qr-file-action', relativePath, action);
  },
});
