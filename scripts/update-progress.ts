import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { renderProgress, type ProgressData } from './progress-view.js';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(resolve(root, 'docs/progress.json'), 'utf8')) as ProgressData;
const expected = readFileSync(resolve(root, 'docs/second-acceptance-requirements.txt'), 'utf8');
let next = 1; const titles = [...expected.matchAll(/^(\d+)\. (.+)$/gm)].filter((m) => Number(m[1]) === next ? (++next, true) : false);
if (titles.length !== 30 || data.items.some((item, i) => item.name !== titles[i][2].trim())) throw new Error('需求编号/名称与原始30项不一致');
const { html, markdown } = renderProgress(data);
for (const [name, content] of [['PROGRESS.md', markdown], ['progress.html', html]]) {
  const path = resolve(root, name); const temporary = `${path}.tmp`;
  writeFileSync(temporary, content, 'utf8'); renameSync(temporary, path);
}
console.log('已同步 PROGRESS.md 和 progress.html；不改变业务数据。');
