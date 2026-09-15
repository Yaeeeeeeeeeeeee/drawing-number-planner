import type { LocalServiceConnection } from './local-service-controller.js';

export interface DesktopSurfaceResult {
  status: 'running' | 'unavailable';
  url?: string;
  error?: string;
}

interface DesktopSurfaceDependencies {
  startService(): Promise<LocalServiceConnection>;
  loadURL(url: string): Promise<unknown>;
  businessUrl(connection: LocalServiceConnection): string;
  quit(): void;
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function unavailableUrl(message: string): string {
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>图号规划器</title>
    <style>body{font:16px system-ui;margin:0;background:#f3f6fa;color:#243447}main{max-width:620px;margin:18vh auto;padding:32px;background:white;border:1px solid #dfe6ee;border-radius:12px}h1{font-size:22px}p{line-height:1.7;color:#52616f}</style>
    <main><h1>本地服务暂时不可用</h1><p>图号规划器的桌面外壳仍在运行，业务页面尚未加载。</p><p>${escapeHtml(message)}</p></main></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

export async function loadDesktopSurface(dependencies: DesktopSurfaceDependencies): Promise<DesktopSurfaceResult> {
  try {
    const connection = await dependencies.startService();
    const url = dependencies.businessUrl(connection);
    await dependencies.loadURL(url);
    return { status: 'running', url };
  } catch (error) {
    const message = error instanceof Error ? error.message : '本地服务启动失败';
    try {
      await dependencies.loadURL(unavailableUrl(message));
      return { status: 'unavailable', error: message };
    } catch (surfaceError) {
      dependencies.quit();
      throw surfaceError;
    }
  }
}

