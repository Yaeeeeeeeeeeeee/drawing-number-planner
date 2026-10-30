import {expect,it,vi} from 'vitest';
import {applyAppearanceVersionSchema,migrateDatabase} from '../../src/db/migrations';
import {createV15Fixture} from './v15-fixture';
function v16(){const db=createV15Fixture();db.transaction(()=>{applyAppearanceVersionSchema(db);db.exec("insert into schema_migrations(version,applied_at) values(16,'2026-10-20')");})();return db;}
function snapshot(db:ReturnType<typeof v16>){return Object.fromEntries((db.prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name").all() as {name:string}[]).map(({name})=>[name,db.prepare(`select * from "${name}" order by rowid`).all()]));}
it.each([false,true])('v16 ->17 backs up first and preserves all rows; rollback=%s',fail=>{const db=v16();try{
 db.exec("insert into historical_drawing_numbers(full_code,brand_code,product_size_code,appearance_code,color_code,main_category_code,project_item_code,sequence,first_seen_at,last_seen_at) values('02.0209.010.0401001','02','0209','01','0','04','01',1,'then','now')");
 const before=snapshot(db);if(fail)db.exec("create trigger fail17 before insert on schema_migrations when new.version=17 begin select raise(abort,'fail17');end");
 const backup=vi.fn(()=>{expect(db.prepare('select max(version) as v from schema_migrations').get()).toEqual({v:16});expect(db.prepare("select name from sqlite_master where name='outbound_batch_scopes'").get()).toBeUndefined();});
 const upgrade=()=>migrateDatabase(db,{databaseExists:true,createBackup:backup});if(fail)expect(upgrade).toThrow('fail17');else expect(upgrade()).toEqual({from:16,to:24});expect(backup).toHaveBeenCalledOnce();
 const after=snapshot(db);for(const [table,rows] of Object.entries(before))if(table!=='schema_migrations')expect(table==='outbound_email_templates'?(after[table] as Record<string,unknown>[]).map(({manufacturer,scenario,contacts_configured,import_sources_json,...original})=>original):after[table]).toEqual(rows);
 if(fail){expect(after).toEqual(before);expect(db.prepare("select name from sqlite_master where name='outbound_batch_scopes'").get()).toBeUndefined();}else{
  const same=snapshot(db);const noBackup=vi.fn();expect(migrateDatabase(db,{databaseExists:true,createBackup:noBackup})).toEqual({from:24,to:24});expect(noBackup).not.toHaveBeenCalled();expect(snapshot(db)).toEqual(same);for(const t of ['outbound_batch_scopes','outbound_batch_scope_audit','outbound_v2_snapshots','drawing_appearance_usages','drawing_appearance_usage_audit'])expect(db.prepare(`select * from ${t}`).all()).toEqual([]);
 }expect(db.pragma('foreign_key_check')).toEqual([]);expect(db.pragma('integrity_check',{simple:true})).toBe('ok');
 }finally{db.close();}});
it('failed v17 backup makes no schema change',()=>{const db=v16();try{const before=snapshot(db);expect(()=>migrateDatabase(db,{databaseExists:true,createBackup(){throw Error('backup-failed');}})).toThrow('backup-failed');expect(snapshot(db)).toEqual(before);expect(db.prepare("select name from sqlite_master where name='outbound_v2_snapshots'").get()).toBeUndefined();}finally{db.close();}});
it('detects and rolls back ledger-boundary changes to old occupancy rows',()=>{const db=v16();try{
 db.exec("insert into historical_drawing_numbers(full_code,brand_code,product_size_code,appearance_code,color_code,main_category_code,project_item_code,sequence,first_seen_at,last_seen_at) values('02.0209.010.0401001','02','0209','01','0','04','01',1,'then','now');create trigger corrupt17 after insert on schema_migrations when new.version=17 begin update historical_drawing_numbers set full_code='tampered';end");
 const before=snapshot(db);expect(()=>migrateDatabase(db,{databaseExists:true,createBackup(){}})).toThrow('外发V2迁移历史内容校验失败');expect(snapshot(db)).toEqual(before);expect(db.prepare("select name from sqlite_master where name='outbound_batch_scopes'").get()).toBeUndefined();
 }finally{db.close();}});
it('upgrades the durable PDF decision enum while preserving rows, custom objects and ID high-water',()=>{const db=v16();try{
 db.exec(`insert into pdf_file_decisions(id,workspace_key,path_key,content_sha256,decision,updated_at) values(90,'workspace','deleted.pdf','old','ignore','then');
 delete from pdf_file_decisions where id=90;
 insert into pdf_file_decisions(id,workspace_key,path_key,content_sha256,decision,updated_at) values(7,'workspace','retained.pdf','hash','ignore','then');
 create index decision_workspace_lookup on pdf_file_decisions(workspace_key);
 create trigger decision_protect_delete before delete on pdf_file_decisions begin select raise(abort,'preserve-decision'); end;`);
 const before=db.prepare('select * from pdf_file_decisions').all();
 expect(()=>db.prepare("update pdf_file_decisions set decision='needs_review'").run()).toThrow('CHECK constraint failed');
 migrateDatabase(db,{databaseExists:true,createBackup(){expect(db.prepare('select * from pdf_file_decisions').all()).toEqual(before);}});
 expect(db.prepare('select * from pdf_file_decisions').all()).toEqual(before);
 expect(db.prepare("select name from sqlite_master where name in ('decision_workspace_lookup','decision_protect_delete') order by name").all()).toEqual([{name:'decision_protect_delete'},{name:'decision_workspace_lookup'}]);
 db.prepare("update pdf_file_decisions set decision='needs_review' where id=7").run();expect(db.prepare('select decision from pdf_file_decisions where id=7').get()).toEqual({decision:'needs_review'});
 const next=db.prepare("insert into pdf_file_decisions(workspace_key,path_key,content_sha256,decision,updated_at) values('workspace','new.pdf','new','restored','now')").run();expect(Number(next.lastInsertRowid)).toBeGreaterThan(90);
 expect(()=>db.prepare('delete from pdf_file_decisions where id=7').run()).toThrow('preserve-decision');expect(db.pragma('foreign_key_check')).toEqual([]);
 }finally{db.close();}});
