/** Electron sizes are native logical units; innerWidth/Height are CSS units.
 * Derive frame/menu insets from the live renderer, not from a guessed Windows border.
 * Physical monitor DPI is handled by Electron and must not be multiplied again.
 */
export function minimumOuterSize({ outer, viewport, zoom }: {
  outer: [number, number]; viewport: [number, number]; zoom: number;
}): [number, number] | null {
  if (![...outer, ...viewport, zoom].every(value => Number.isFinite(value) && value > 0)) return null;
  return [720, 600].map((target, index) =>
    Math.ceil(target * zoom + Math.max(0, outer[index] - viewport[index] * zoom)),
  ) as [number, number];
}
