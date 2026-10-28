// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { createV19Fixture } from './v19-fixture';
import { schemaVersionTwenty } from '../../src/db/schema.sql';
import { schemaVersionTwentyOne } from '../../src/db/schema-v21-force-release';
import { schemaVersionTwentyTwo } from '../../src/db/schema-v22-email';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';
import { createDatabaseBackup } from '../../src/db/backup';
function oldDatabase(){
 const db=createV19Fixture(); db.exec(schemaVersionTwenty); db.exec(schemaVersionTwentyOne); db.exec(schemaVersionTwentyTwo);
 db.exec(`insert into schema_migrations(version,applied_at) values(20,'old'),(21,'old'),(22,'old');
 insert into outbound_contacts(company,contact_name,email,default_recipient_type,status,notes,created_at,updated_at) values('原厂家','原联系人','original@example.test','cc','inactive','备注','创建','修改');
 update outbound_email_templates set manufacturer='原厂家',scenario='原场景',body_template='旧正文 {{signature}}';
 insert into dictionary_items(type,code,name,created_at) values('brand','91','品牌','创建'),('product_size','9191','尺寸','创建');
 insert into products(brand_id,product_size_id,model,product_category,created_at) select (select id from dictionary_items where code='91'),(select id from dictionary_items where code='9191'),'旧型号','类别','创建';
 insert into outbound_packages(product_id,material_type,package_mode,package_name,zip_relative_path,status,created_at) values((select max(id) from products),'initial','current_complete','旧包','旧包.zip','completed','创建');
 insert into outbound_email_drafts(package_id,template_id,signature_id,recipients_json,cc_json,subject,body,created_at,updated_at) values((select max(id) from outbound_packages),(select min(id) from outbound_email_templates),(select min(id) from outbound_signatures),'["frozen@example.test"]','[]','旧主题','旧正文快照','创建','修改');`);
 return db;
}
function snapshot(db:PlannerDatabase){return (db.prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name").all() as {name:string}[]).map(({name})=>({name,columns:(db.pragma(`table_info("${name}")`) as {name:string}[]).map(row=>row.name),rows:db.prepare(`select * from "${name}" order by rowid`).all()}));}
function assertPreserved(db:PlannerDatabase,before:ReturnType<typeof snapshot>){for(const table of before){if(table.name==='schema_migrations')continue;expect(db.prepare(`select ${table.columns.map(name=>'"'+name+'"').join(',')} from "${table.name}" order by rowid`).all(),table.name).toEqual(table.rows);}}
it('backs up a populated schema22 on disk before upgrading original columns with only empty link/configuration additions',async()=>{
 const root=mkdtempSync(join(tmpdir(),'planner-v23-'));const source=oldDatabase();let db:PlannerDatabase|undefined;
 try{await source.backup(join(root,'planner.db'));source.close();db=openDatabase(join(root,'planner.db'));const before=snapshot(db);let backupPath='';
 const backup=vi.fn(()=>{expect(db!.prepare('select max(version) as version from schema_migrations').get()).toEqual({version:22});expect(db!.prepare("select name from sqlite_master where name='outbound_template_contact_links'").get()).toBeUndefined();return backupPath=createDatabaseBackup(db!,join(root,'planner.db'),join(root,'backups'),'migration');});
 expect(migrateDatabase(db,{databaseExists:true,createBackup:backup})).toEqual({from:22,to:23});expect(backup).toHaveBeenCalledOnce();assertPreserved(db,before);
 expect(db.prepare('select * from outbound_template_contact_links').all()).toEqual([]);expect(db.prepare('select distinct contacts_configured from outbound_email_templates').all()).toEqual([{contacts_configured:0}]);expect(db.pragma('foreign_key_check')).toEqual([]);
 expect(db.prepare('select distinct import_sources_json from outbound_email_templates').all()).toEqual([{import_sources_json:'[]'}]);
 for(const value of ['{}','null','invalid'])expect(()=>db!.prepare('update outbound_email_templates set import_sources_json=?').run(value)).toThrow();
 const saved=openDatabase(backupPath);try{expect(snapshot(saved)).toEqual(before);expect(saved.pragma('integrity_check',{simple:true})).toBe('ok');}finally{saved.close();}
 expect(migrateDatabase(db,{databaseExists:true,createBackup:backup})).toEqual({from:23,to:23});expect(backup).toHaveBeenCalledOnce();
 }finally{if(db?.open)db.close();if(source.open)source.close();rmSync(root,{recursive:true,force:true});}
});
it.each(['abort','corrupt'])('rolls back the new table, flag, ledger and all data on schema23 %s',failure=>{
 const db=oldDatabase();try{db.exec(failure==='abort'?"create trigger fail23 before insert on schema_migrations when new.version=23 begin select raise(abort,'fail schema23');end":"create trigger fail23 after insert on schema_migrations when new.version=23 begin update outbound_contacts set notes='changed';end");const before=snapshot(db);const schema=db.prepare('select type,name,sql from sqlite_master order by type,name').all();const backup=vi.fn();
 expect(()=>migrateDatabase(db,{databaseExists:true,createBackup:backup})).toThrow(failure==='abort'?'fail schema23':'V5迁移历史内容校验失败');expect(backup).toHaveBeenCalledOnce();expect(snapshot(db)).toEqual(before);expect(db.prepare('select type,name,sql from sqlite_master order by type,name').all()).toEqual(schema);expect(db.pragma('foreign_key_check')).toEqual([]);
 }finally{db.close();}
});
it('retains the partial-schema22 compatibility patches within the same backed-up upgrade',()=>{
 const db=oldDatabase();try{db.exec('drop index material_batches_relative_path_nocase_unique; alter table bom_item_assets drop column deleted_at');const before=snapshot(db);const backup=vi.fn();
 expect(migrateDatabase(db,{databaseExists:true,createBackup:backup})).toEqual({from:22,to:23});expect(backup).toHaveBeenCalledOnce();assertPreserved(db,before);expect((db.pragma('table_info(bom_item_assets)') as {name:string}[]).some(item=>item.name==='deleted_at')).toBe(true);expect(db.prepare("select name from sqlite_master where name='material_batches_relative_path_nocase_unique'").get()).toBeTruthy();
 }finally{db.close();}
});
