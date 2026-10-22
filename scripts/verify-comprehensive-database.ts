// Verification-only fixture/helper. Bundled into RUNNER_TEMP, never the delivery package.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {createV15Fixture} from '../tests/db/v15-fixture';
import {openDatabase} from '../src/db/database';
import {migrateDatabase} from '../src/db/migrations';
import {createDatabaseBackup} from '../src/db/backup';
const [mode,root]=process.argv.slice(2);if(!root)throw Error('Temporary verification directory required');
const file=path.join(root,'planner.db');
function legacy(db:ReturnType<typeof openDatabase>){return Object.fromEntries((db.prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%' and name<>'schema_migrations' order by name").all() as {name:string}[]).map(({name})=>[name,{columns:(db.pragma(`table_info("${name}")`) as {name:string}[]).map(c=>c.name),rows:db.prepare(`select * from "${name}" order by rowid`).all()}]));}
function verifyLegacy(db:ReturnType<typeof openDatabase>,before:ReturnType<typeof legacy>){for(const [name,{columns,rows}]of Object.entries(before))assert.deepEqual(db.prepare(`select ${columns.map(c=>'"'+c+'"').join(',')} from "${name}" order by rowid`).all(),rows,name);assert.equal(db.pragma('integrity_check',{simple:true}),'ok');assert.deepEqual(db.pragma('foreign_key_check'),[]);}
if(mode==='prepare'){
 fs.mkdirSync(root,{recursive:true});if(fs.existsSync(file))throw Error('Fixture must be a new file');const db=createV15Fixture();try{
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

 fs.writeFileSync(path.join(root,'legacy.json'),JSON.stringify(legacy(db)));
 await db.backup(file);
 }finally{db.close();}
 fs.mkdirSync(path.join(root,'workspace'),{recursive:true});fs.mkdirSync(path.join(root,'outbound'),{recursive:true});
 fs.writeFileSync(path.join(root,'settings.json'),JSON.stringify({workspaceRoot:path.join(root,'workspace'),outboundOutputRoot:path.join(root,'outbound')}));
}else if(mode==='rollback-and-wal'){
 const db=openDatabase(file);try{
 const before=legacy(db);const schema=db.prepare('select type,name,sql from sqlite_master order by type,name').all();
 const reader=openDatabase(file);try{
 reader.exec('begin');reader.prepare('select * from products').all();
 db.prepare("update products set model='WAL已提交型号' where id=5").run();
 const walBackup=createDatabaseBackup(db,file,path.join(root,'wal-backups'),'migration');const backup=openDatabase(walBackup);try{assert.equal((backup.prepare('select model from products where id=5').get() as {model:string}).model,'WAL已提交型号');assert.equal(backup.pragma('integrity_check',{simple:true}),'ok');}finally{backup.close();}
 }finally{reader.exec('rollback');reader.close();}
 db.prepare("update products set model='M1' where id=5").run();
 db.exec("create trigger fail_final_upgrade before insert on schema_migrations when new.version=18 begin select raise(abort,'native-rollback18');end");
 let backupPath='';assert.throws(()=>migrateDatabase(db,{databaseExists:true,createBackup(){backupPath=createDatabaseBackup(db,file,path.join(root,'rollback-backups'),'migration');}}),/native-rollback18/);
 assert.ok(backupPath);assert.equal((db.prepare('select max(version) as v from schema_migrations').get() as {v:number}).v,15);verifyLegacy(db,before);
 db.exec('drop trigger fail_final_upgrade');assert.deepEqual(db.prepare('select type,name,sql from sqlite_master order by type,name').all(),schema);
 fs.writeFileSync(path.join(root,'native-rollback-and-wal.json'),JSON.stringify({walCommittedRowInBackup:true,v15To18FailureRollsBackSchemaAndRows:true,backupBeforeMigration:true}));
 }finally{db.close();}
}else if(mode==='audit-upgrade'){
 const db=openDatabase(file);try{assert.equal((db.prepare('select max(version) as v from schema_migrations').get() as {v:number}).v,18);verifyLegacy(db,JSON.parse(fs.readFileSync(path.join(root,'legacy.json'),'utf8')));
 const backups=fs.readdirSync(path.join(root,'backups')).filter(name=>name.startsWith('migration-')&&name.endsWith('.db'));assert.ok(backups.length>0);let preUpgrade=false;
 for(const name of backups){const backup=openDatabase(path.join(root,'backups',name));try{if((backup.prepare('select max(version) as v from schema_migrations').get() as {v:number}).v===15){verifyLegacy(backup,JSON.parse(fs.readFileSync(path.join(root,'legacy.json'),'utf8')));preUpgrade=true;}}finally{backup.close();}}
 assert.ok(preUpgrade,'Real startup must create a readable, row-preserving v15 backup');
 }finally{db.close();}
}else throw Error('Unknown native verification operation');
console.log(JSON.stringify({mode,root,passed:true}));
