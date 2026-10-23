import {createV18Fixture} from './v18-fixture';
import {afterEach,expect,it,vi} from 'vitest';
import {openDatabase,type PlannerDatabase} from '../../src/db/database';
import {migrateDatabase} from '../../src/db/migrations';
import {DictionaryService} from '../../src/core/dictionaries/dictionary-service';
import {ProductService} from '../../src/core/products/product-service';
import {ensureProductAppearance} from '../../src/core/products/appearance-identity';
let db:PlannerDatabase;afterEach(()=>db?.close());
function v17(){
 db=createV18Fixture();
 const dictionary=new DictionaryService(db),brand=dictionary.create({type:'brand',code:'02',name:'Brand'}),size=dictionary.create({type:'product_size',code:'0404',name:'Size'}),appearance=dictionary.create({type:'appearance',code:'01',name:'First'});
 const product=new ProductService(db).create({sku:'LEGACY',model:'ZC100',brandId:brand.id,productSizeId:size.id,defaultAppearanceId:appearance.id,productCategory:'Test'});ensureProductAppearance(db,product.id);
 const version=(db.prepare('select id from product_appearance_versions where product_id=?').get(product.id) as {id:number}).id;
 const sql=(db.prepare("select sql from sqlite_master where name='drawing_appearance_bindings'").get() as {sql:string}).sql;
 const objects=db.prepare("select sql from sqlite_master where tbl_name='drawing_appearance_bindings' and sql is not null and type in ('index','trigger')").all() as Array<{sql:string}>;
 db.exec('drop table drawing_appearance_bindings');db.exec(sql.replace(/appearance_version_id\s+INTEGER/i,'appearance_version_id INTEGER NOT NULL'));for(const object of objects)db.exec(object.sql);
 db.prepare("insert into drawing_appearance_bindings values('historical',82,?,?, 'confirmed',7,'2026-10-01')").run(product.id,version);
 db.exec('delete from schema_migrations where version=18; create index legacy_binding_product on drawing_appearance_bindings(product_id); create trigger legacy_binding_update after update on drawing_appearance_bindings begin select 1; end');
 return {product,version};
}
it('upgrades v17 product-only compatibility after backup without changing any old binding, audit or schema guards',()=>{
 const {product}=v17();const before=db.prepare('select * from drawing_appearance_bindings').all(),backup=vi.fn();
 expect(migrateDatabase(db,{databaseExists:true,createBackup:backup})).toEqual({from:17,to:19});expect(backup).toHaveBeenCalledTimes(1);expect(db.prepare('select * from drawing_appearance_bindings').all()).toEqual(before);
 expect(db.prepare("select name from sqlite_master where name in ('legacy_binding_product','legacy_binding_update','drawing_usage_primary_binding_update') order by name").all()).toHaveLength(3);
 db.prepare("insert into drawing_appearance_bindings values('historical',83,?,null,'confirmed',1,'now')").run(product.id);
 expect(db.pragma('foreign_key_check')).toEqual([]);expect(migrateDatabase(db,{databaseExists:true,createBackup:backup})).toEqual({from:19,to:19});expect(backup).toHaveBeenCalledTimes(1);
});
it('rolls back the entire constraint change if migration history cannot be recorded',()=>{
 v17();const before=db.prepare('select * from drawing_appearance_bindings').all();db.exec("create trigger reject_v18 before insert on schema_migrations when new.version=18 begin select raise(abort,'test rollback'); end");
 expect(()=>migrateDatabase(db,{databaseExists:true,createBackup:()=>undefined})).toThrow('test rollback');expect(db.prepare('select * from drawing_appearance_bindings').all()).toEqual(before);expect((db.pragma('table_info(drawing_appearance_bindings)') as Array<{name:string;notnull:number}>).find(row=>row.name==='appearance_version_id')?.notnull).toBe(1);expect(db.prepare('select max(version) as v from schema_migrations').get()).toEqual({v:17});
});
