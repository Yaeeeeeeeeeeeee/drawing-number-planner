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
      .mockResolvedValueOnce(new Response(JSON.stringify({ version: { id: 1, items: [] }, diff: [] }), { status: 201, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await apiClient.createDictionary('brand', { code: '02', name: 'SAMKYO' });
    await apiClient.saveBomVersion({ productId: 1, colorId: 5, expectedCurrentVersionId: null, items: [] });

    expect(window.location.search).toBe('');
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/session', { method: 'POST' });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/dictionaries/brand', expect.objectContaining({
      headers: expect.objectContaining({ 'x-planner-token': 'fresh-launch-token' }),
    }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/boms/versions', expect.objectContaining({
      method: 'POST', headers: expect.objectContaining({ 'x-planner-token': 'fresh-launch-token' }),
      body: JSON.stringify({ productId: 1, colorId: 5, expectedCurrentVersionId: null, items: [] }),
    }));
  });
});
