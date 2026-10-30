import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../../../src/db/database';
import { migrateDatabase } from '../../../src/db/migrations';
import { PackagingCatalogService } from '../../../src/core/packaging/packaging-catalog';
export function setup(){const db=openDatabase(':memory:');migrateDatabase(db,{databaseExists:false,createBackup(){}});const insert=(type:string,code:string,parent:number|null=null)=>Number(db.prepare("insert into dictionary_items(type,code,name,parent_id,created_at) values(?,?,?,?,?)").run(type,code,type,parent,'now').lastInsertRowid);const brand=insert('brand','98'),size=insert('product_size','9898'),main=insert('main_category','98'),project=insert('project_item','98',main);const product=()=>Number(db.prepare("insert into products(brand_id,product_size_id,model,product_category,created_at) values(?,?,'SAME','category','now')").run(brand,size).lastInsertRowid);const first=product(),second=product();const dir=mkdtempSync(join(tmpdir(),'packaging-catalog-'));return{db,dir,brand,main,project,first,second,service:new PackagingCatalogService(db,dir)};}
