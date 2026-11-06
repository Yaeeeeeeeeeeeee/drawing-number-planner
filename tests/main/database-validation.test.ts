// @vitest-environment node
import Database from 'better-sqlite3';
import {afterEach, expect, it} from 'vitest';
import {mkdtempSync, readFileSync, readdirSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createV15Fixture} from '../db/v15-fixture';
import {initializeEmptyAcceptanceDatabase} from '../../scripts/initialize-empty-acceptance';
import {backupProductionDatabase, prepareExistingProductionDatabase, validateProductionDatabase} from '../../src/main/database-validation';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, {recursive:true, force:true}); });
function fixture(legacy = false) {
  const root = mkdtempSync(join(tmpdir(), 'planner-validation-')); roots.push(root);
  const file = join(root, 'planner.db');
  if (legacy) { const db = createV15Fixture(); try { db.prepare('VACUUM INTO ?').run(file); } finally { db.close(); } }
  else initializeEmptyAcceptanceDatabase(file);
  return {root, file};
}
it('rehearses a genuine v15 ledger without changing bytes, then backs up before upgrading', () => {
  const {root, file} = fixture(true), original = readFileSync(file);
  validateProductionDatabase(file);
  expect(readFileSync(file)).toEqual(original);
  expect(readdirSync(root)).toEqual(['planner.db']);
  prepareExistingProductionDatabase(file);
  const backups = readdirSync(join(root, 'backups'));
  expect(backups).toHaveLength(1);
  const backup = new Database(join(root, 'backups', backups[0]!), {readonly:true});
  const upgraded = new Database(file, {readonly:true});
  try {
    expect(backup.pragma('integrity_check', {simple:true})).toBe('ok');
    expect(backup.prepare('SELECT max(version) AS v FROM schema_migrations').get()).toEqual({v:15});
    expect(upgraded.prepare('SELECT max(version) AS v FROM schema_migrations').get()).toEqual({v:25});
    expect(upgraded.pragma('foreign_key_check')).toEqual([]);
  } finally { backup.close(); upgraded.close(); }
});
it('validates committed WAL pages without touching any source file and backs them up independently', () => {
  const {root, file} = fixture();
  const db = new Database(file);
  try {
    db.pragma('journal_mode = WAL'); db.pragma('wal_autocheckpoint = 0');
    db.exec("CREATE TABLE wal_evidence(value TEXT); INSERT INTO wal_evidence VALUES('committed WAL')");
    const files = readdirSync(root), bytes = files.map(name => readFileSync(join(root, name)));
    validateProductionDatabase(file);
    expect(readdirSync(root)).toEqual(files);
    files.forEach((name, index) => expect(readFileSync(join(root, name))).toEqual(bytes[index]));
    const backup = new Database(backupProductionDatabase(root), {readonly:true});
    try { expect(backup.prepare('SELECT value FROM wal_evidence').get()).toEqual({value:'committed WAL'}); }
    finally { backup.close(); }
  } finally { db.close(); }
});
it.each(['unique', 'partial-predicate', 'foreign-key', 'trigger'])('rejects missing or changed %s safety constraints even with an intact ledger', kind => {
  const {file} = fixture();
  const db = new Database(file);
  try {
    if (kind === 'unique') db.exec('DROP INDEX product_qr_codes_shared_purpose_unique');
    if (kind === 'partial-predicate') db.exec('DROP INDEX product_qr_codes_shared_purpose_unique; CREATE UNIQUE INDEX product_qr_codes_shared_purpose_unique ON product_qr_codes(product_id,purpose_id) WHERE appearance_version_id = -1');
    if (kind === 'trigger') db.exec('DROP TRIGGER qr_appearance_owner_insert');
    if (kind === 'foreign-key') {
      db.unsafeMode(true);
      db.pragma('writable_schema = ON');
      db.prepare("UPDATE sqlite_master SET sql = replace(sql, 'REFERENCES products(id)', '') WHERE type='table' AND name='material_batches'").run();
      db.pragma('schema_version = 999');
    }
  } finally { db.close(); }
  const bytes = readFileSync(file);
  expect(() => validateProductionDatabase(file)).toThrow();
  expect(readFileSync(file)).toEqual(bytes);
});
