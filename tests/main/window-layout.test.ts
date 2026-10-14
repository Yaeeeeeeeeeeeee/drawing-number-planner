// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { minimumOuterSize } from '../../src/main/window-layout';

describe('minimum CSS viewport to native window size', () => {
  it('accounts for the measured frame and menu rather than equating outer and CSS dimensions', () => {
    expect(minimumOuterSize({ outer: [1440, 900], viewport: [1424, 812], zoom: 1 })).toEqual([736, 688]);
  });
  it('accounts for renderer zoom but does not multiply by physical display DPI', () => {
    expect(minimumOuterSize({ outer: [1440, 900], viewport: [1136, 640], zoom: 1.25 })).toEqual([920, 850]);
  });
  it('does not install invalid minimum dimensions from an unavailable viewport', () => {
    expect(minimumOuterSize({ outer: [1440, 900], viewport: [0, 0], zoom: 1 })).toBeNull();
  });
});
