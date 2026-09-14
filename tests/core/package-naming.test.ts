import { describe, expect, it } from 'vitest';

import { buildOutboundPackageName } from '../../src/core/outbound/package-naming';

describe('buildOutboundPackageName', () => {
  const product = { brand: 'SAMKYO', model: 'F60', productCategory: '空气炸锅' };
  const localDate = new Date(2026, 8, 10, 9, 30);

  it('uses the verified initial-material wording and local Chinese creation date', () => {
    expect(buildOutboundPackageName({ ...product, materialType: 'initial', createdAt: localDate }))
      .toBe('D&D - SAMKYO F60空气炸锅 【包材资料-2026年9月10日】');
  });

  it('uses the verified update-material wording instead of silently sharing the initial name', () => {
    expect(buildOutboundPackageName({ ...product, materialType: 'update', createdAt: localDate }))
      .toBe('D&D - SAMKYO F60空气炸锅 【更新包材资料-2026年9月10日】');
  });
});
