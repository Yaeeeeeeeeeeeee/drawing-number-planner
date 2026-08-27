const { contextBridge, ipcRenderer } = require('electron') as typeof import('electron');

contextBridge.exposeInMainWorld('plannerDesktop', {
  showFileInFolder(pdfFileId: unknown) {
    if (!Number.isInteger(pdfFileId) || Number(pdfFileId) <= 0) {
      return Promise.resolve({ ok: false, error: { code: 'INVALID_PDF_FILE_ID', message: 'PDF 文件索引无效' } });
    }
    return ipcRenderer.invoke('planner:show-file-in-folder', pdfFileId);
  },
});
