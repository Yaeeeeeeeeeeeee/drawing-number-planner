import { expect, it, vi } from 'vitest';
import { openDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';
import {createV15Fixture} from './v15-fixture';
it('adds identity/version schema without seeded business data',()=>{const db=openDatabase(':memory:');try{expect(migrateDatabase(db,{databaseExists:false,createBackup(){throw Error('fresh backup')}})).toEqual({from:0,to:20});expect(db.prepare('select * from product_appearance_versions').all()).toEqual([]);expect(db.pragma('foreign_key_check')).toEqual([]);}finally{db.close();}});
it.each([false,true])('v15 upgrade preserves old columns, IDs, occupancy and backup first; rollback=%s',fail=>{
 const db=createV15Fixture();try{
 db.exec(`insert into dictionary_items(id,type,code,name,created_at) values(1,'brand','02','品牌','2026-01-01'),(2,'product_size','0209','尺寸','2026-01-01'),(3,'appearance','01','外观','2026-01-01');
 insert into products(id,sku,brand_id,product_size_id,default_appearance_id,model,product_category,created_at) values(5,'SKU',1,2,3,'M1','冰柜','2026-01-01');
 insert into product_qr_codes(id,product_id,purpose_id,name,target_url,status,created_at,updated_at) values(7,5,1,'原QR','https://example.com/1234567','active','2026-01-01','2026-01-02');
 insert into bom_versions(id,product_id,version_number,business_change_date,created_at) values(8,5,1,'2026-01-02','2026-01-01');
 insert into bom_current(product_id,version_id,updated_at) values(5,8,'2026-01-02');
 insert into historical_drawing_numbers(full_code,brand_code,product_size_code,appearance_code,color_code,main_category_code,project_item_code,sequence,product_id,first_seen_at,last_seen_at) values('02.0209.010.0401001','02','0209','01','0','04','01',1,5,'2026-01-01','2026-01-02');`);
 db.exec(`insert into qr_code_files(id,relative_path,path_key,file_name,mime_type,size_bytes,modified_at,qr_code_id,match_status,first_seen_at,last_seen_at) values(21,'二维码/QR.pdf','二维码/qr.pdf','QR.pdf','application/pdf',123,'2026-01-01',7,'matched','2026-01-01','2026-01-02');
 insert into material_batches(id,relative_path,product_directory,name,recognition_status,product_id,first_seen_at,last_seen_at) values(31,'旧目录/原批次','旧目录','原批次','recognized',5,'2026-01-01','2026-01-02');
 insert into pdf_files(id,relative_path,path_key,file_name,match_status,detected_codes_json,conversion_type,size_bytes,modified_at,scanned_at,is_present,material_batch_id,historical_drawing_id) values(41,'旧目录/原批次/文件.pdf','旧目录/原批次/文件.pdf','文件.pdf','matched','[]','source',123,'2026-01-01','2026-01-02',1,31,1);
 insert into outbound_packages(id,product_id,material_type,package_mode,selected_material_batch_id,package_name,zip_relative_path,status,created_at,product_identity_json) values(51,5,'initial','change_only',31,'旧冻结包','外发/旧.zip','completed','2026-01-02','{"sku":"SKU","model":"M1","frozen":"旧身份"}');`);
 const tables=(db.prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%' and name<>'schema_migrations' order by name").all() as {name:string}[]).map(r=>r.name);
 const before=tables.map(t=>({t,rows:db.prepare(`select * from "${t}" order by rowid`).all() as Record<string,unknown>[],cols:(db.pragma(`table_info(${t})`) as {name:string}[]).map(c=>c.name)}));
 if(fail)db.exec("create trigger fail_v16 before insert on schema_migrations when new.version=16 begin select raise(abort,'v16-failed'); end");
 const backup=vi.fn(()=>{expect(db.prepare('select max(version) as v from schema_migrations').get()).toEqual({v:15});expect(db.prepare("select name from sqlite_master where name='product_appearance_versions'").get()).toBeUndefined();});
 const run=()=>migrateDatabase(db,{databaseExists:true,createBackup:backup});if(fail)expect(run).toThrow('v16-failed');else expect(run()).toEqual({from:15,to:20});
 expect(backup).toHaveBeenCalledOnce();for(const {t,rows,cols} of before)expect(db.prepare(`select ${cols.map(c=>'"'+c+'"').join(',')} from "${t}" order by rowid`).all()).toEqual(rows);
 expect(db.prepare('select max(version) as v from schema_migrations').get()).toEqual({v:fail?15:20});expect(db.pragma('foreign_key_check')).toEqual([]);
 if(!fail){expect(db.prepare('select appearance_version_id from bom_versions').get()).toEqual({appearance_version_id:null});expect(db.prepare('select * from drawing_appearance_bindings').all()).toEqual([]);expect(db.prepare('select product_id,status from product_appearance_versions').all()).toEqual([{product_id:5,status:'current'}]);}
 if(!fail){const noBackup=vi.fn();expect(migrateDatabase(db,{databaseExists:true,createBackup:noBackup})).toEqual({from:20,to:20});expect(noBackup).not.toHaveBeenCalled();for(const {t,rows,cols} of before)expect(db.prepare(`select ${cols.map(c=>'"'+c+'"').join(',')} from "${t}" order by rowid`).all()).toEqual(rows);}
 }finally{db.close();}
});
it('v15 to v17 rolls back the complete upgrade when the final ledger write fails',()=>{
 const db=createV15Fixture();try{
  db.exec("create trigger fail_final_upgrade before insert on schema_migrations when new.version=17 begin select raise(abort,'final-upgrade-failed'); end");
  const schema=db.prepare("select type,name,sql from sqlite_master order by type,name").all();const ledger=db.prepare('select * from schema_migrations order by version').all();
  const backup=vi.fn(()=>expect(db.prepare('select max(version) as v from schema_migrations').get()).toEqual({v:15}));
  expect(()=>migrateDatabase(db,{databaseExists:true,createBackup:backup})).toThrow('final-upgrade-failed');expect(backup).toHaveBeenCalledOnce();
  expect(db.prepare("select type,name,sql from sqlite_master order by type,name").all()).toEqual(schema);expect(db.prepare('select * from schema_migrations order by version').all()).toEqual(ledger);expect(db.pragma('foreign_key_check')).toEqual([]);
 }finally{db.close();}
});
it('v15 backup failure leaves even schema objects untouched',()=>{
 const db=createV15Fixture();try{
  const before=db.prepare('select type,name,sql from sqlite_master order by type,name').all();
  expect(()=>migrateDatabase(db,{databaseExists:true,createBackup(){throw Error('v15-backup-failed');}})).toThrow('v15-backup-failed');
  expect(db.prepare('select type,name,sql from sqlite_master order by type,name').all()).toEqual(before);expect(db.prepare('select max(version) as v from schema_migrations').get()).toEqual({v:15});
 }finally{db.close();}
});
