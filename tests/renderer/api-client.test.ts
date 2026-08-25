import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '../../src/renderer/data/client';

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
});

describe('renderer API client', () => {
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
});
