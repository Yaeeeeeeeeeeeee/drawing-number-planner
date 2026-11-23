import { BrowserWindow, dialog } from 'electron';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, rm, writeFile } from 'node:fs/promises';
import { bomExportPath } from '../core/bom/bom-export-document.js';
import { checkBomExportDocument } from '../core/bom/bom-export-ready.js';

export async function exportBomPdf(parent: BrowserWindow, serviceUrl: string, id: number, revision: number) {
  const preview = new BrowserWindow({ parent, show: false, webPreferences: {
    sandbox: true, nodeIntegration: false, contextIsolation: true,
  } });
  preview.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  preview.webContents.on('will-navigate', event => event.preventDefault());

  const url = serviceUrl + bomExportPath(id, revision);
  try {
    try {
      await preview.loadURL(url);
    } catch (loadError) {
      const response = await fetch(url);
      if (response.ok) throw loadError;
      const body = await response.json();
      throw new Error(body.error?.message ?? '无法读取所选 BOM 用于导出');
    }
    const error = await preview.webContents.executeJavaScript(
      `(${checkBomExportDocument.toString()})(document, ${id}, ${revision})`,
    ) as string | null;
    if (error) throw new Error(error);
    const content = await preview.webContents.printToPDF({ pageSize: 'A4', preferCSSPageSize: true, printBackground: true });
    const selection = await dialog.showSaveDialog(parent, {
      title: '导出此 BOM', defaultPath: `BOM-${id}.pdf`, filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (selection.canceled || !selection.filePath) return { ok: true, cancelled: true };
    const path = /\.pdf$/i.test(selection.filePath) ? selection.filePath : `${selection.filePath}.pdf`;
    const staging = `${path}.${randomUUID()}.tmp`;
    try {
      await writeFile(staging, content, { flag: 'wx' });
      try { await copyFile(staging, path, constants.COPYFILE_EXCL); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('所选 PDF 文件已存在，请使用其他文件名');
        throw error;
      }
    } finally {
      await rm(staging, { force: true });
    }
    return { ok: true };
  } finally {
    if (!preview.isDestroyed()) preview.destroy();
  }
}
