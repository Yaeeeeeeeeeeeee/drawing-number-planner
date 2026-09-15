// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { loadDesktopSurface } from '../../src/main/desktop-startup';

describe('desktop startup flow', () => {
  it('keeps the main shell alive and shows only an unavailable surface when initial service startup fails', async () => {
    const loadURL = vi.fn().mockResolvedValue(undefined);
    const quit = vi.fn();

    const result = await loadDesktopSurface({
      startService: vi.fn().mockRejectedValue(Object.assign(new Error('端口已占用'), { code: 'EADDRINUSE' })),
      loadURL,
      businessUrl: (connection) => connection.url,
      quit,
    });

    expect(result).toEqual({ status: 'unavailable', error: '端口已占用' });
    expect(quit).not.toHaveBeenCalled();
    expect(loadURL).toHaveBeenCalledTimes(1);
    expect(loadURL.mock.calls[0][0]).toContain(encodeURIComponent('本地服务暂时不可用'));
    expect(loadURL.mock.calls[0][0]).not.toContain('127.0.0.1');
  });

  it('does not load a normal business URL before the service reports ready', async () => {
    let ready!: (value: { url: string; token: string }) => void;
    const startService = vi.fn(() => new Promise<{ url: string; token: string }>((resolve) => { ready = resolve; }));
    const loadURL = vi.fn().mockResolvedValue(undefined);
    const loading = loadDesktopSurface({ startService, loadURL, businessUrl: (connection) => connection.url,
      quit: vi.fn() });

    await Promise.resolve();
    expect(loadURL).not.toHaveBeenCalled();
    ready({ url: 'http://127.0.0.1:4317', token: 'private' });
    await expect(loading).resolves.toEqual({ status: 'running', url: 'http://127.0.0.1:4317' });
    expect(loadURL).toHaveBeenCalledWith('http://127.0.0.1:4317');
  });
});

