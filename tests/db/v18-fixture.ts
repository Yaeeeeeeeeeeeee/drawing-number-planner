import {openDatabase} from '../../src/db/database';
import {migrateDatabase} from '../../src/db/migrations';
/** Reconstruct the old constraints explicitly; ledger-only downgrades are not old schemas. */
export function createV18Fixture(){
 const db=openDatabase(':memory:');migrateDatabase(db,{databaseExists:false,createBackup(){}});
 db.pragma('foreign_keys = OFF');
 const sql=(db.prepare("select sql from sqlite_master where name='products'").get() as {sql:string}).sql;
 db.exec('drop table products');db.exec(sql.replace(/\)\s*$/,', UNIQUE (brand_id, model))'));
 db.exec('CREATE UNIQUE INDEX products_sku_unique ON products(sku COLLATE NOCASE) WHERE sku IS NOT NULL');
 db.exec('drop table pdf_product_assignments; drop table pdf_product_assignment_audit; delete from schema_migrations where version=19');
 db.pragma('foreign_keys = ON');return db;
}
