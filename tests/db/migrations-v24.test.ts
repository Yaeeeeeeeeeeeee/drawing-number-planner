// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { createV19Fixture } from './v19-fixture';
import { schemaVersionTwenty } from '../../src/db/schema.sql';
import { schemaVersionTwentyOne } from '../../src/db/schema-v21-force-release';
import { schemaVersionTwentyTwo } from '../../src/db/schema-v22-email';
import { schemaVersionTwentyThree } from '../../src/db/schema-v23-template-contacts';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';
import { createDatabaseBackup } from '../../src/db/backup';
function v23(){const db=createV19Fixture();for(const sql of [schemaVersionTwenty,schemaVersionTwentyOne,schemaVersionTwentyTwo,schemaVersionTwentyThree])db.exec(sql);db.exec("insert into schema_migrations values(20,'old'),(21,'old'),(22,'old'),(23,'old')");return db;}
function snapshot(db:PlannerDatabase){return (db.prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name").all() as {name:string}[]).map(({name})=>({name,columns:(db.pragma(`table_info("${name}")`) as {name:string}[]).map(c=>c.name),rows:db.prepare(`select * from "${name}" order by rowid`).all()}));}
it('backs up schema23 on disk, preserves every original value and adds durable packaging and scan scope tables',async()=>{
 const root=mkdtempSync(join(tmpdir(),'packaging-v24-'));const source=v23();let db:PlannerDatabase|undefined;
 try{source.exec("insert into dictionary_items(type,code,name,created_at) values('brand','93','Original','old')");await source.backup(join(root,'db.sqlite'));source.close();db=openDatabase(join(root,'db.sqlite'));const before=snapshot(db);let backupPath='';const backup=vi.fn(()=>backupPath=createDatabaseBackup(db!,join(root,'db.sqlite'),join(root,'backups'),'migration'));
 expect(migrateDatabase(db,{databaseExists:true,createBackup:backup})).toEqual({from:23,to:24});expect(backup).toHaveBeenCalledOnce();
 for(const table of before)if(table.name!=='schema_migrations')expect(db.prepare(`select ${table.columns.map(c=>'"'+c+'"').join(',')} from "${table.name}" order by rowid`).all()).toEqual(table.rows);
 for(const name of ['packaging_templates','packaging_dimensions','packaging_rules','packaging_project_configs','packaging_tasks','packaging_task_items','packaging_pending_files','packaging_archive_journal'])expect(db.prepare("select name from sqlite_master where name=?").get(name)).toEqual({name});
 expect((db.pragma('table_info(file_scan_runs)') as {name:string}[]).map(c=>c.name)).toEqual(expect.arrayContaining(['scope_kind','scope_directories_json']));expect(db.pragma('foreign_key_check')).toEqual([]);expect((db.pragma('table_info(packaging_tasks)') as {name:string;dflt_value:string}[]).find(c=>c.name==='workspace_key')?.dflt_value).toBe("''");expect((db.pragma('table_info(packaging_task_items)') as {name:string;dflt_value:string}[]).find(c=>c.name==='ratio_locked')?.dflt_value).toBe('1');
 const saved=openDatabase(backupPath);try{expect(snapshot(saved)).toEqual(before);}finally{saved.close();}expect(migrateDatabase(db,{databaseExists:true,createBackup:backup})).toEqual({from:24,to:24});expect(backup).toHaveBeenCalledOnce();
 }finally{if(source.open)source.close();db?.close();rmSync(root,{recursive:true,force:true});}
});
it.each(['backup','abort','corrupt'])('keeps all original data and schema when schema24 %s fails',failure=>{const db=v23();try{if(failure!=='backup')db.exec(failure==='abort'?"create trigger fail24 before insert on schema_migrations when new.version=24 begin select raise(abort,'fail24');end":"create trigger fail24 after insert on schema_migrations when new.version=24 begin update outbound_email_templates set name='changed';end");const before=snapshot(db),schema=db.prepare('select type,name,sql from sqlite_master order by type,name').all();expect(()=>migrateDatabase(db,{databaseExists:true,createBackup(){if(failure==='backup')throw Error('backup failed');}})).toThrow();expect(snapshot(db)).toEqual(before);expect(db.prepare('select type,name,sql from sqlite_master order by type,name').all()).toEqual(schema);expect(db.pragma('foreign_key_check')).toEqual([]);}finally{db.close();}});
