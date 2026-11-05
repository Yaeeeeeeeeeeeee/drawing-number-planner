import { expect, it } from 'vitest';
import data from '../docs/progress.json';
import { renderProgress } from '../scripts/progress-view';
it('renders all 30 unique requirements offline without claiming a live worker', () => {
  const result = renderProgress(data);
  expect(result.html).toContain('总需求：30项');
  expect(result.html).toContain('上次记录的执行状态');
  expect(result.html).not.toMatch(/fetch\(|https?:\/\//);
  for (const item of data.items) expect(result.markdown).toContain(`## ${item.id}. ${item.name}`);
  expect(result.html).toContain('0%');
});
it('rejects missing requirements and unsupported completion claims', () => {
  expect(() => renderProgress({ ...data, items: data.items.slice(1) })).toThrow();
  expect(() => renderProgress({ ...data, items: data.items.map((item, i) => i ? item : { ...item, status: '已完成', acceptance: [] }) })).toThrow();
});
it('escapes data as text rather than executable HTML', () => {
  const result = renderProgress({ ...data, current: '<script>alert(1)</script>' });
  expect(result.html).not.toContain('<script>alert(1)</script>');
  expect(result.html).toContain('&lt;script&gt;');
});
