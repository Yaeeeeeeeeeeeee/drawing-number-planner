const { contextBridge, ipcRenderer } = require('electron') as typeof import('electron');

contextBridge.exposeInMainWorld('plannerDesktop', {
  showFileInFolder(pdfFileId: unknown) {
    if (!Number.isInteger(pdfFileId) || Number(pdfFileId) <= 0) {
      return Promise.resolve({ ok: false, error: { code: 'INVALID_PDF_FILE_ID', message: 'PDF 文件索引无效' } });
    }
    return ipcRenderer.invoke('planner:show-file-in-folder', pdfFileId);
  },
  showBomAssetInFolder(assetId: unknown) {
    if (!Number.isInteger(assetId) || Number(assetId) <= 0) {
      return Promise.resolve({ ok: false, error: { code: 'INVALID_BOM_ASSET_ID', message: 'BOM 附件索引无效' } });
    }
    return ipcRenderer.invoke('planner:show-bom-asset-in-folder', assetId);
  },
  qrFileAction(relativePath: unknown, action: unknown) {
    if (typeof relativePath !== 'string' || !['open', 'show', 'preview'].includes(String(action))) {
      return Promise.resolve({ ok: false, error: { code: 'INVALID_QR_FILE_ACTION', message: '二维码文件操作无效' } });
    }
    return ipcRenderer.invoke('planner:qr-file-action', relativePath, action);
  },
  chooseOutboundDirectory() { return ipcRenderer.invoke('planner:choose-outbound-directory'); },
  showOutboundPackageInFolder(packageId: unknown) {
    if (!Number.isInteger(packageId) || Number(packageId) <= 0) return Promise.resolve({ ok: false, error: { code: 'INVALID_PACKAGE_ID', message: '外发压缩包编号无效' } });
    return ipcRenderer.invoke('planner:show-outbound-package-in-folder', packageId);
  },
});
