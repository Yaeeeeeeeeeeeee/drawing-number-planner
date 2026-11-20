import { afterEach, describe, expect, it } from 'vitest';
import { initializeEmptyAcceptanceDatabase } from '../../scripts/initialize-empty-acceptance.js';
import { openDatabase } from '../../src/db/database.js';
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const require = createRequire(import.meta.url);
const { prepareAcceptanceData } = require('../../scripts/prepare-acceptance-data.cjs');
const roots: string[] = [];
const revision = 'a'.repeat(40);
function setup() {
 const root = mkdtempSync(join(tmpdir(), 'planner-empty-delivery-')); roots.push(root);
 const appDirectory = join(root, 'application'); mkdirSync(appDirectory);
 const appData = join(root, 'user-data'); mkdirSync(appData);
 return { appData, appDirectory, version: { revision, emptyStart: true }, initializeDatabase: initializeEmptyAcceptanceDatabase };
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
describe('empty delivery bootstrap', () => {
 it('starts without any bundled database, sample PDF, or acceptance seed', () => {
  const options = setup();
  const data = prepareAcceptanceData(options);
  expect(existsSync(join(data, 'planner.db'))).toBe(true);
  expect(readdirSync(data).sort()).toEqual(['.acceptance-version', 'materials', 'outbound', 'planner.db', 'settings.json']);
  const database = openDatabase(join(data, 'planner.db'));
  try {
   const tables = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as Array<{name:string}>;
   for(const {name} of tables) {
    if(['schema_migrations','qr_purposes','qr_purpose_product_categories'].includes(name)) continue;
    expect((database.prepare(`SELECT COUNT(*) AS count FROM "${name}"`).get() as {count:number}).count, name).toBe(0);
   }
   expect((database.prepare('SELECT COUNT(*) AS count FROM qr_purposes').get() as {count:number}).count).toBe(3);
  } finally {database.close();}
  expect(readdirSync(join(data, 'materials'))).toEqual([]);
  expect(readdirSync(join(data, 'outbound'))).toEqual([]);
  expect(JSON.parse(readFileSync(join(data, 'settings.json'), 'utf8'))).toEqual({ workspaceRoot: join(data, 'materials'), outboundOutputRoot: join(data, 'outbound') });
 });
 it('never clears data created by the user on subsequent launches', () => {
  const options = setup(); const data = prepareAcceptanceData(options);
  writeFileSync(join(data, 'planner.db'), 'user business database');
  writeFileSync(join(data, 'materials', 'original.pdf'), 'original');
  expect(prepareAcceptanceData(options)).toBe(data);
  expect(readFileSync(join(data, 'planner.db'), 'utf8')).toBe('user business database');
  expect(readFileSync(join(data, 'materials', 'original.pdf'), 'utf8')).toBe('original');
 });
 it('does not open or remove an older candidate or unmarked directory', () => {
  const options = setup();
  const old = join(options.appData, 'DrawingNumberPlannerAcceptance', 'bbbbbbb'); mkdirSync(old, { recursive: true });
  writeFileSync(join(old, 'planner.db'), 'old sample is outside this installation');
  const data = prepareAcceptanceData(options); rmSync(join(data, '.acceptance-version'));
  expect(() => prepareAcceptanceData(options)).toThrow(/不会覆盖/);
  expect(readFileSync(join(old, 'planner.db'), 'utf8')).toBe('old sample is outside this installation');
 });
 it('refuses to initialize any existing database instead of erasing it', () => {
  const options = setup(); const existing = join(options.appData, 'existing.db');
  writeFileSync(existing, 'existing business database');
  expect(() => initializeEmptyAcceptanceDatabase(existing)).toThrow();
  expect(readFileSync(existing, 'utf8')).toBe('existing business database');
 });
 it('retains failed initialization evidence without retrying or clearing partial data', () => {
  const options = setup(); const data = join(options.appData, 'DrawingNumberPlannerAcceptance', revision.slice(0, 7));
  options.initializeDatabase = (databasePath: string) => { writeFileSync(databasePath, 'partial initialization'); throw new Error('initialization diagnostic'); };
  expect(() => prepareAcceptanceData(options)).toThrow(/initialization diagnostic/);
  expect(existsSync(join(data, '.acceptance-version'))).toBe(false);
  expect(readFileSync(join(data, 'first-start-error.txt'), 'utf8')).toContain('initialization diagnostic');
  expect(() => prepareAcceptanceData(options)).toThrow(/不会覆盖/);
  expect(readFileSync(join(data, 'planner.db'), 'utf8')).toBe('partial initialization');
 });
 it('rejects linked data directories before touching the target', () => {
  const options = setup(); const base = join(options.appData, 'DrawingNumberPlannerAcceptance'); mkdirSync(base);
  symlinkSync(options.appDirectory, join(base, revision.slice(0, 7)), process.platform === 'win32' ? 'junction' : 'dir');
  expect(() => prepareAcceptanceData(options)).toThrow(/不能是链接/);
  expect(readdirSync(options.appDirectory)).toEqual([]);
 });
});
