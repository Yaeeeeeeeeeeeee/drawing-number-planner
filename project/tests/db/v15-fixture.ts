import { openDatabase } from '../../src/db/database';
import * as s from '../../src/db/schema.sql';
/** Genuine old structure assembled only from retained v1-v15 SQL, never downgraded from v16. */
export function createV15Fixture(){
 const db=openDatabase(':memory:');
 for(const sql of [s.schemaVersionOne,s.schemaVersionTwo,s.schemaVersionThree,s.schemaVersionFour])db.exec(sql);
 db.exec('alter table products add column sku text');
 for(const sql of [s.schemaVersionFive,s.schemaVersionSix,s.schemaVersionSeven,s.schemaVersionEight,s.schemaVersionNine,s.schemaVersionTen,s.schemaVersionEleven,s.schemaVersionTwelve,s.schemaVersionThirteen,s.schemaVersionFourteen]){
  const triggers=sql===s.schemaVersionTen?(db.prepare("select name,sql from sqlite_master where type='trigger' and sql like '%bom_items%'").all() as {name:string;sql:string}[]):[];
  for(const t of triggers)db.exec(`drop trigger "${t.name}"`);
  db.exec(sql);for(const t of triggers)db.exec(t.sql);
 }
 db.exec(`alter table dictionary_items add column deleted_at text;
 create unique index material_batches_relative_path_nocase_unique on material_batches(relative_path collate nocase);
 create unique index pdf_files_path_key_unique on pdf_files(path_key);
 insert into schema_migrations(version,applied_at) values(15,'2026-10-19');`);
 return db;
}
