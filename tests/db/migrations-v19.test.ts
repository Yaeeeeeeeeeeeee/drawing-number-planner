import {expect,it,vi} from 'vitest';
import {createV18Fixture} from './v18-fixture';
import {migrateDatabase} from '../../src/db/migrations';
it.each([false,true])('preserves every old row, custom objects, IDs and high water; rollback=%s',fail=>{
 const db=createV18Fixture();try{
 db.exec(`insert into dictionary_items(id,type,code,name,created_at) values(1,'brand','02','Brand','old'),(2,'product_size','0209','Size','old');
 insert into products(id,sku,brand_id,product_size_id,model,product_category,created_at) values(7,'SKU',1,2,'ZC100','Freezer','old');
 insert into products(id,sku,brand_id,product_size_id,model,product_category,created_at) values(99,'DELETED',1,2,'removed','Freezer','old');delete from products where id=99;
 insert into product_identity_members(raw_product_id,canonical_product_id) values(7,7);
 insert into product_identity_state(product_id,revision) values(7,4);
 insert into historical_drawing_numbers(full_code,brand_code,product_size_code,appearance_code,color_code,main_category_code,project_item_code,sequence,product_id,first_seen_at,last_seen_at) values('02.0209.010.0401001','02','0209','01','0','04','01',1,7,'old','old');
 create index custom_product_index on products(product_category);
 create trigger custom_product_trigger after update on products begin select 1;end;`);
 if(fail)db.exec("create trigger fail19 before insert on schema_migrations when new.version=19 begin select raise(abort,'rollback19');end");
 const tables=(db.prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name").all() as {name:string}[]).map(r=>r.name);
 const before=Object.fromEntries(tables.map(t=>[t,db.prepare(`select * from "${t}" order by rowid`).all()]));
 const schema=db.prepare('select type,name,sql from sqlite_master order by type,name').all();
 const backup=vi.fn(()=>expect(db.prepare('select max(version) as v from schema_migrations').get()).toEqual({v:18}));
 if(fail){expect(()=>migrateDatabase(db,{databaseExists:true,createBackup:backup})).toThrow('rollback19');expect(db.prepare('select type,name,sql from sqlite_master order by type,name').all()).toEqual(schema);}
 else{expect(migrateDatabase(db,{databaseExists:true,createBackup:backup})).toEqual({from:18,to:22});
 expect(db.prepare("select name from sqlite_master where name in ('custom_product_index','custom_product_trigger')").all()).toHaveLength(2);
 const result=db.prepare("insert into products(sku,brand_id,product_size_id,model,product_category,created_at) values('SKU',1,2,'ZC100','Freezer','new')").run();expect(Number(result.lastInsertRowid)).toBe(100);db.prepare('delete from products where id=100').run();}
 for(const table of tables)if(table!=='schema_migrations'||fail)expect(table==='outbound_email_templates'?(db.prepare(`select * from "${table}" order by rowid`).all() as Record<string,unknown>[]).map(({manufacturer,scenario,...original})=>original):db.prepare(`select * from "${table}" order by rowid`).all()).toEqual(before[table]);
 expect(db.pragma('foreign_key_check')).toEqual([]);expect(db.pragma('foreign_keys',{simple:true})).toBe(1);expect(backup).toHaveBeenCalledOnce();
 }finally{db.close();}
});

it('rolls back changes made by a final ledger trigger, restoring constraints and foreign keys',()=>{
 const db=createV18Fixture();try{
 db.exec("create trigger corrupt19 after insert on schema_migrations when new.version=19 begin insert into dictionary_items(type,code,name,created_at) values('brand','bad','bad','bad');end");
 expect(()=>migrateDatabase(db,{databaseExists:true,createBackup(){}})).toThrow('产品身份迁移历史内容校验失败');
 expect(db.prepare('select * from dictionary_items').all()).toEqual([]);
 expect(db.prepare('select max(version) as v from schema_migrations').get()).toEqual({v:18});
 expect(db.pragma('foreign_keys',{simple:true})).toBe(1);
 }finally{db.close();}
});
