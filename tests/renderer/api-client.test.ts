import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let apiClient: typeof import('../../src/renderer/data/client').apiClient;
let ApiError: typeof import('../../src/renderer/data/client').ApiError;

beforeEach(async () => {
  vi.resetModules();
  ({ apiClient, ApiError } = await import('../../src/renderer/data/client'));
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
});

describe('renderer API client', () => {
  it('sends selected PDF index IDs to the cleanup endpoint with the local session token', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'cleanup-token' }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ cleaned: 2 }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiClient.cleanupPdfFiles([31, 42])).resolves.toEqual({ cleaned: 2 });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/files/cleanup', expect.objectContaining({
      method: 'POST', headers: expect.objectContaining({ 'content-type': 'application/json', 'x-planner-token': 'cleanup-token' }),
      body: JSON.stringify({ ids: [31, 42] }),
    }));
  });

  it('obtains a per-launch session token without placing it in the URL', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'fresh-launch-token' }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 1, code: '02', name: 'SAMKYO', status: 'active' }), { status: 201, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ version: { id: 1, items: [] }, diff: [] }), { status: 201, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ workspaceRoot: 'X:\\Library', configured: true, available: true }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ total: 0, matched: 0, unmatched: 0, conflict: 0, source: 0, outlined: 0, missing: 0, scannedAt: '2026-08-25T00:00:00Z' }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [], total: 0, page: 1, pageSize: 20 }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await apiClient.createDictionary('brand', { code: '02', name: 'SAMKYO' });
    await apiClient.saveBomVersion({ productId: 1, colorId: 5, expectedCurrentVersionId: null, items: [] });
    await apiClient.updateWorkspaceSettings('X:\\Library');
    await apiClient.scanPdfFiles();
    await apiClient.searchPdfFiles({ keyword: '转曲', matchStatus: 'unmatched', page: 1, pageSize: 20 });

    expect(window.location.search).toBe('');
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/session', { method: 'POST' });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/dictionaries/brand', expect.objectContaining({
      headers: expect.objectContaining({ 'x-planner-token': 'fresh-launch-token' }),
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/boms/versions', expect.objectContaining({
      method: 'POST', headers: expect.objectContaining({ 'x-planner-token': 'fresh-launch-token' }),
      body: JSON.stringify({ productId: 1, colorId: 5, expectedCurrentVersionId: null, items: [] }),
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(4, '/api/files/settings', expect.objectContaining({
      method: 'PUT', headers: expect.objectContaining({ 'x-planner-token': 'fresh-launch-token' }),
      body: JSON.stringify({ workspaceRoot: 'X:\\Library' }),
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(5, '/api/files/scan', expect.objectContaining({
      method: 'POST', headers: expect.objectContaining({ 'x-planner-token': 'fresh-launch-token' }),
    }));
    expect(fetchMock.mock.calls[4][1]?.headers).not.toHaveProperty('content-type');
    expect(fetchMock).toHaveBeenNthCalledWith(6, '/api/files?keyword=%E8%BD%AC%E6%9B%B2&matchStatus=unmatched&page=1&pageSize=20', {
      headers: {},
    });
  });

  it('replays a stale-token write once after refreshing the local session', async () => {
    const requestBody = { code: '02', name: 'SAMKYO' };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'stale-token' }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'INVALID_TOKEN', message: '会话已失效' } }), { status: 401, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'fresh-token' }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 1, code: '02', name: 'SAMKYO', status: 'active' }), { status: 201, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiClient.createDictionary('brand', requestBody)).resolves.toMatchObject({ id: 1, code: '02' });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/session', { method: 'POST' });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/dictionaries/brand', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'content-type': 'application/json', 'x-planner-token': 'stale-token' }),
      body: JSON.stringify(requestBody),
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/session', { method: 'POST' });
    expect(fetchMock).toHaveBeenNthCalledWith(4, '/api/dictionaries/brand', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'content-type': 'application/json', 'x-planner-token': 'fresh-token' }),
      body: JSON.stringify(requestBody),
    }));
  });

  it('surfaces INVALID_TOKEN returned by the single replay without another refresh', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'stale-token' }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'INVALID_TOKEN', message: '会话已失效' } }), { status: 401, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'fresh-token' }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'INVALID_TOKEN', message: '会话仍然失效' } }), { status: 401, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiClient.createDictionary('brand', { code: '02', name: 'SAMKYO' }))
      .rejects.toMatchObject({ code: 'INVALID_TOKEN' } satisfies Partial<InstanceType<typeof ApiError>>);

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls.filter(([path]) => path === '/api/session')).toHaveLength(2);
  });

  it('does not refresh a write session for a different authorization failure', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'current-token' }), { status: 200, headers: { 'content-type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'FORBIDDEN', message: '没有权限' } }), { status: 403, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(apiClient.createDictionary('brand', { code: '02', name: 'SAMKYO' }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' } satisfies Partial<InstanceType<typeof ApiError>>);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.filter(([path]) => path === '/api/session')).toHaveLength(1);
  });

  it('shares one fresh bootstrap when concurrent writes reject the same stale token', async () => {
    let sessionBootstrapCount = 0;
    const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
      if (path === '/api/session') {
        sessionBootstrapCount += 1;
        return new Response(JSON.stringify({ token: sessionBootstrapCount === 1 ? 'stale-token' : 'fresh-token' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      const token = (init?.headers as Record<string, string>)['x-planner-token'];
      if (token === 'stale-token') {
        return new Response(JSON.stringify({ error: { code: 'INVALID_TOKEN', message: '会话已失效' } }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ id: path.endsWith('brand') ? 1 : 2, code: '02', name: 'SAMKYO', status: 'active' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await Promise.all([
      apiClient.createDictionary('brand', { code: '02', name: 'SAMKYO' }),
      apiClient.createDictionary('category', { code: '03', name: '配件' }),
    ]);

    expect(sessionBootstrapCount).toBe(2);
    expect(fetchMock.mock.calls.filter(([path]) => path === '/api/session')).toHaveLength(2);
    expect(fetchMock.mock.calls.filter(([path]) => path !== '/api/session')).toHaveLength(4);
  });
});
