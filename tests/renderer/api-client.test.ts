import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '../../src/renderer/data/client';

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState({}, '', '/');
});

describe('renderer API client', () => {
  it('sends the desktop startup token on write requests', async () => {
    window.history.replaceState({}, '', '/?token=desktop-token');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 1, code: '02', name: 'SAMKYO', status: 'active',
    }), { status: 201, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await apiClient.createDictionary('brand', { code: '02', name: 'SAMKYO' });

    expect(fetchMock).toHaveBeenCalledWith('/api/dictionaries/brand', expect.objectContaining({
      headers: expect.objectContaining({ 'x-planner-token': 'desktop-token' }),
    }));
  });
});
