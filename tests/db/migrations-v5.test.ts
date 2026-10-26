import { expect, it, vi } from 'vitest';
import { createV19Fixture } from './v19-fixture';
import { schemaVersionTwenty } from '../../src/db/schema.sql';
import { migrateDatabase } from '../../src/db/migrations';
function oldDatabase(){const db=createV19Fixture();db.exec(schemaVersionTwenty);db.exec("insert into schema_migrations(version,applied_at) values(20,'old'); create index user_template_name on outbound_email_templates(name);");return db;}
it('upgrades a v20 database after one backup while retaining original template content and IDs',()=>{
 const db=oldDatabase();try{
  const rows=db.prepare('select * from outbound_email_templates order by id').all() as Record<string,unknown>[];
  const backup=vi.fn(()=>expect(db.prepare('select max(version) as v from schema_migrations').get()).toEqual({v:20}));
  expect(migrateDatabase(db,{databaseExists:true,createBackup:backup})).toEqual({from:20,to:22});expect(backup).toHaveBeenCalledOnce();
  const upgraded=db.prepare('select * from outbound_email_templates order by id').all() as Record<string,unknown>[];
  for(const [index,row] of rows.entries()){for(const key of Object.keys(row))expect(upgraded[index][key]).toEqual(row[key]);expect(upgraded[index]).toMatchObject({manufacturer:null,scenario:null});}
  expect(db.prepare("select name from sqlite_master where name='user_template_name'").get()).toBeTruthy();expect(db.pragma('foreign_key_check')).toEqual([]);
  expect(migrateDatabase(db,{databaseExists:true,createBackup:backup})).toEqual({from:22,to:22});expect(backup).toHaveBeenCalledOnce();
 }finally{db.close();}
});
it.each([21,22])('rolls back all V5 changes and original data if migration %s fails',version=>{
 const db=oldDatabase();try{db.exec(`create trigger fail_v5 before insert on schema_migrations when new.version=${version} begin select raise(abort,'V5 rollback');end;`);
 const before=db.prepare('select type,name,sql from sqlite_master order by type,name').all();const templates=db.prepare('select * from outbound_email_templates').all();
 expect(()=>migrateDatabase(db,{databaseExists:true,createBackup:vi.fn()})).toThrow('V5 rollback');
 expect(db.prepare('select type,name,sql from sqlite_master order by type,name').all()).toEqual(before);expect(db.prepare('select * from outbound_email_templates').all()).toEqual(templates);expect(db.pragma('foreign_key_check')).toEqual([]);
 }finally{db.close();}
});
