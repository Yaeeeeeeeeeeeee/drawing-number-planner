import { expect, it, vi } from 'vitest';
import { createV15Fixture } from './v15-fixture';
import { migrateDatabase } from '../../src/db/migrations';

it.each([false, true])('v14 recycle-bin upgrade backs up and rolls back on failure=%s', (fail) => {
  const db = createV15Fixture();
  try {
    db.exec("delete from schema_migrations where version > 14; insert into schema_migrations(version,applied_at) values(14,'2026-10-19')");
    if ((db.pragma('table_info(dictionary_items)') as { name: string }[]).some(c => c.name === 'deleted_at')) {
      db.exec('alter table dictionary_items drop column deleted_at');
    }
    db.exec("insert into dictionary_items(type,code,name,created_at) values('brand','02','历史品牌','2026-09-30')");
    if (fail) db.exec("create trigger stop_v15 before insert on schema_migrations when new.version=15 begin select raise(abort,'v15-failed'); end");
    const backup = vi.fn(() => { expect(db.prepare('select max(version) as v from schema_migrations').get()).toEqual({v:14}); });
    const run = () => migrateDatabase(db, { databaseExists: true, createBackup: backup });
    if (fail) expect(run).toThrow('v15-failed');
    else expect(run()).toEqual({ from: 14, to:22 });
    expect(backup).toHaveBeenCalledOnce();
    expect(db.prepare('select code,name from dictionary_items').all()).toEqual([{code:'02',name:'历史品牌'}]);
    expect(db.prepare('select max(version) as v from schema_migrations').get()).toEqual({v: fail ? 14 : 22});
    expect((db.pragma('table_info(dictionary_items)') as {name:string}[]).some(c=>c.name==='deleted_at')).toBe(!fail);
    expect(db.pragma('foreign_key_check')).toEqual([]);
  } finally { db.close(); }
});
