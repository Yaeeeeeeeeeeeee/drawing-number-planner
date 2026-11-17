// @vitest-environment node
import {DictionaryService} from '../../src/core/dictionaries/dictionary-service';
import {expect,it} from 'vitest';
import {createV19Fixture} from './v19-fixture';
import {schemaVersionTwenty} from '../../src/db/schema.sql';
import {schemaVersionTwentyOne} from '../../src/db/schema-v21-force-release';
import {schemaVersionTwentyTwo} from '../../src/db/schema-v22-email';
import {schemaVersionTwentyThree} from '../../src/db/schema-v23-template-contacts';
import {schemaVersionTwentyFour} from '../../src/db/schema-v24-packaging';
import {schemaVersionTwentyFive} from '../../src/db/schema-v25-task-ui';
import {migrateDatabase} from '../../src/db/migrations';
function old(){const db=createV19Fixture();for(const [i,sql] of [schemaVersionTwenty,schemaVersionTwentyOne,schemaVersionTwentyTwo,schemaVersionTwentyThree,schemaVersionTwentyFour,schemaVersionTwentyFive].entries()){db.exec(sql);db.prepare('insert into schema_migrations values(?,?)').run(i+20,'old');}return db;}
function snapshot(db:ReturnType<typeof old>){return db.prepare("select type,name,tbl_name,sql from sqlite_master where name not like 'sqlite_%' order by type,name").all();}
it('upgrades a BLOB-bearing v25 database under a bounded Node heap without serializing the whole database',async()=>{
 const {mkdtempSync,rmSync,writeFileSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join,resolve}=await import('node:path');
 const {spawnSync}=await import('node:child_process');const {buildSync}=await import('esbuild');
 const dir=mkdtempSync(join(tmpdir(),'v26-bounded-')),db=old();
 try{
  db.exec('create table startup_size_fixture(id integer primary key,payload blob not null)');
  const insert=db.prepare('insert into startup_size_fixture(payload) values(zeroblob(1048576))');for(let i=0;i<128;i++)insert.run();
  await db.backup(join(dir,'planner.db'));db.close();
  const entry=join(dir,'upgrade.cjs');
  buildSync({stdin:{contents:`import {openDatabase} from './src/db/database';import {migrateDatabase} from './src/db/migrations';const db=openDatabase(process.argv[2]);try{const result=migrateDatabase(db,{databaseExists:true,createBackup(){}});if(result.to!==26||db.prepare('select count(*) as n from startup_size_fixture where length(payload)=1048576').get().n!==128||db.pragma('integrity_check')[0].integrity_check!=='ok'||db.pragma('foreign_key_check').length)throw Error('not preserved');}finally{db.close();}`,resolveDir:resolve('.')},outfile:entry,bundle:true,platform:'node',format:'cjs',external:['better-sqlite3'],banner:{js:`const __nativeRequire=require('node:module').createRequire(${JSON.stringify(resolve('package.json'))});`},plugins:[]});
  // Resolve the installed native module from this project, not the disposable fixture directory.
  const {readFileSync}=await import('node:fs');writeFileSync(entry,readFileSync(entry,'utf8').replaceAll('require("better-sqlite3")','__nativeRequire("better-sqlite3")'));
  const child=spawnSync(process.execPath,['--max-old-space-size=96',entry,join(dir,'planner.db')],{encoding:'utf8',timeout:30000});
  expect({status:child.status,error:child.error?.message,stderr:child.stderr.slice(-1400)}).toEqual({status:0,error:undefined,stderr:''});
 }finally{if(db.open)db.close();rmSync(dir,{recursive:true,force:true});}
},40000);
it('upgrades v25 preserving data, indexes, triggers and foreign keys while accepting existing mode',()=>{const db=old();try{const d=new DictionaryService(db),main=d.create({type:'main_category',code:'44',name:'旧类'}),project=d.create({type:'project_item',code:'01',name:'旧项目',parentId:main.id});db.prepare("insert into packaging_project_configs values(?,'none','[]')").run(project.id);db.exec('create index custom_config_mode on packaging_project_configs(mode)');const config=db.prepare('select * from packaging_project_configs').all();const before=snapshot(db);expect(migrateDatabase(db,{databaseExists:true,createBackup(){}})).toEqual({from:25,to:26});expect(db.prepare("select sql from sqlite_master where name='custom_config_mode'").get()).toEqual({sql:(before.find((x:any)=>x.name==='custom_config_mode') as any).sql});expect(db.prepare('select * from packaging_project_configs').all()).toEqual(config);expect(db.pragma('foreign_key_check')).toEqual([]);expect((db.prepare("select sql from sqlite_master where name='packaging_project_configs'").get() as any).sql).toContain("'existing'");}finally{db.close();}});
it('rolls back v26 schema and data on failure',()=>{const db=old();try{db.exec("create trigger fail26 before insert on schema_migrations when new.version=26 begin select raise(abort,'blocked');end");const before=snapshot(db);expect(()=>migrateDatabase(db,{databaseExists:true,createBackup(){}})).toThrow();expect(snapshot(db)).toEqual(before);expect(db.pragma('foreign_key_check')).toEqual([]);}finally{db.close();}});
it('preserves populated v25 task snapshots, references, schema objects and sequence high-water marks across upgrade and reopen',async()=>{
 const {mkdtempSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const {ProductService}=await import('../../src/core/products/product-service');const {PlanningService}=await import('../../src/core/planning/planning-service');const {openDatabase}=await import('../../src/db/database');
 const dir=mkdtempSync(join(tmpdir(),'packaging-v25-')),source=old();let db:ReturnType<typeof openDatabase>|undefined;
 try{
  const d=new DictionaryService(source),brand=d.create({type:'brand',code:'72',name:'历史品牌'}),size=d.create({type:'product_size',code:'7288',name:'历史类别'}),appearance=d.create({type:'appearance',code:'72',name:'历史外观'}),color=d.create({type:'color',code:'7',name:'历史颜色'}),main=d.create({type:'main_category',code:'72',name:'历史主类'}),project=d.create({type:'project_item',code:'01',name:'历史项目',parentId:main.id});
  const product=new ProductService(source).create({sku:'OLD25',model:'OLD25',brandId:brand.id,productSizeId:size.id,defaultAppearanceId:appearance.id,productCategory:'历史类别'});
  const plan=new PlanningService(source),input={productId:product.id,rows:[{clientId:'old',colorId:color.id,mainCategoryId:main.id,projectItemId:project.id}]};
  const reserve=()=>{const preview=plan.preview(input);return plan.reserve({...input,rows:[{...input.rows[0],expectedFullCode:preview.rows[0].fullCode}]})[0];};const first=reserve(),second=reserve();
  source.prepare(`insert into packaging_templates(id,name,main_category_id,project_item_id,brand_ids_json,product_ids_json,fields_json,required_fonts_json,status,file_name,asset_relative_path,sha256,revision,created_at,updated_at) values(15,'原模板',?,?,'[]','[]','[]','[]','active','original.ait','packaging-templates/assets/old.ait','old-hash',4,'created','updated')`).run(main.id,project.id);
  source.prepare("insert into packaging_project_configs values(?,'none','[]')").run(project.id);
  source.prepare(`insert into packaging_tasks(id,product_id,model_snapshot,name,type,state,workspace_key,product_directory,task_directory,created_at,completed_at,error,owned_files_json,deleted_at,deletion_snapshot_json) values('task25',?,'OLD25','历史任务','new','completed','workspace','category/OLD25','category/OLD25/00.临时文件/task25','created','completed','历史提示',?,'deleted',?)`).run(product.id,JSON.stringify([{relativePath:'old.pdf',sha256:'owned'}]),JSON.stringify({action:'deleted',snapshot:{state:'completed',nested:[1,2]}}));
  const insert=source.prepare(`insert into packaging_task_items(id,task_id,drawing_origin,drawing_id,planned_drawing_id,full_code,project_item_id,project_name,color,mode,parameters_json,ratio_locked,template_id,template_snapshot_json,state,error,reviewed_sha256,file_name,relative_path,sha256,template_name,original_relative_path,original_sha256,backup_relative_path,copy_destination_path) values(?,'task25','planned',?,?,?,?,?,'历史颜色',?,'{"length":123}',0,15,?,?, '历史错误','reviewed','old.pdf','temp/old.pdf','hash','历史模板','formal/old.pdf','original','backups/old.pdf','temp/copy.pdf')`);
  const frozen=JSON.stringify({id:15,revision:3,fields:[{objectName:'旧对象',sourceKey:'DRAWING_NO'}],assetRelativePath:'frozen-old.ait'});
  insert.run(41,first.id,first.id,first.fullCode,project.id,'历史项目','manual',frozen,'completed');insert.run(42,second.id,second.id,second.fullCode,project.id,'历史项目','none',frozen,'none');
  source.prepare("insert into packaging_pending_files(id,task_id,file_name,relative_path,sha256,status,reason,item_id) values(61,'task25','old.pdf','temp/old.pdf','hash','linked','历史关联',41)").run();
  source.prepare("insert into packaging_archive_journal values('task25',41,'temp/old.pdf','hash','formal/old.pdf','original','backups/old.pdf','indexed','created')").run();
  source.exec("create index custom_task_item_mode on packaging_task_items(mode); create trigger custom_task_item_update after update on packaging_task_items begin select 1; end; create index custom_config_project on packaging_project_configs(mode,project_item_id); create trigger custom_config_update after update on packaging_project_configs begin select 1; end;");
  // A previously deleted task item left a higher AUTOINCREMENT mark than any surviving ID.
  source.prepare("update sqlite_sequence set seq=900 where name='packaging_task_items'").run();source.prepare("update sqlite_sequence set seq=901 where name='packaging_pending_files'").run();
  const allRows=(database:ReturnType<typeof openDatabase>)=>{const tables=database.prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%' and name<>'schema_migrations' order by name").all() as {name:string}[];return tables.map(({name})=>({name,columns:(database.pragma(`table_info("${name}")`) as {name:string}[]).map(c=>c.name),rows:database.prepare(`select * from "${name}" order by rowid`).all()}));};
  const objects=(database:ReturnType<typeof openDatabase>)=>database.prepare("select type,name,tbl_name,sql from sqlite_master where type in ('index','trigger') and sql is not null order by type,name").all();
  const sequences=(database:ReturnType<typeof openDatabase>)=>database.prepare('select name,seq from sqlite_sequence order by name').all();
  const before=allRows(source),beforeObjects=objects(source),beforeSequences=sequences(source);expect(source.pragma('foreign_key_check')).toEqual([]);await source.backup(join(dir,'planner.db'));source.close();
  db=openDatabase(join(dir,'planner.db'));expect(migrateDatabase(db,{databaseExists:true,createBackup(){}})).toEqual({from:25,to:26});
  const assertPreserved=()=>{for(const table of before)expect(db!.prepare(`select ${table.columns.map(c=>`"${c}"`).join(',')} from "${table.name}" order by rowid`).all()).toEqual(table.rows);expect(objects(db!)).toEqual(beforeObjects);expect(sequences(db!)).toEqual(beforeSequences);expect(db!.pragma('foreign_key_check')).toEqual([]);expect(db!.pragma('integrity_check')).toEqual([{integrity_check:'ok'}]);};
  assertPreserved();db.close();db=openDatabase(join(dir,'planner.db'));expect(migrateDatabase(db,{databaseExists:true,createBackup(){throw Error('unexpected backup');}})).toEqual({from:26,to:26});assertPreserved();
 }finally{if(source.open)source.close();if(db?.open)db.close();rmSync(dir,{recursive:true,force:true});}
});
