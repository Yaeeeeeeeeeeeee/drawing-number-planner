import Database from 'better-sqlite3';
import {dirname,join} from 'node:path';
import {copyFileSync,existsSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createDatabaseBackup} from '../db/backup.js';
import {migrateDatabase} from '../db/migrations.js';

function integrity(database: Database.Database): void {
  if (database.pragma('integrity_check', {simple:true}) !== 'ok'
    || (database.pragma('foreign_key_check') as unknown[]).length) {
    throw new Error('数据库完整性或外键校验失败，不会切换数据库');
  }
}
function ledger(database: Database.Database): void {
  const versions = database.prepare('SELECT version, applied_at FROM schema_migrations ORDER BY version').all() as {version:number;applied_at:string}[];
  const latest = versions.at(-1)?.version;
  if (!latest || latest > 25) throw new Error(`数据库版本 ${latest ?? '未知'} 不受当前版本支持（最高25）`);
  if (versions.length !== latest || versions.some((row,index) => row.version !== index+1 || typeof row.applied_at !== 'string' || !row.applied_at.trim())) {
    throw new Error('无法识别数据库迁移来源，拒绝初始化或修补');
  }
  for (const table of ['products','drawing_numbers','dictionary_items']) database.prepare(`SELECT * FROM ${table} LIMIT 0`).all();
}
type Column = {name:string;type:string;pk:number;notnull:number};
const quote = (value:string) => '"'+value.replaceAll('"','""')+'"';
const normalizeSql = (sql:string) => sql.trim().replace(/\s+/gu,' ');
function uniqueKeys(db: Database.Database, table:string): string[] {
  return (db.pragma(`index_list(${quote(table)})`) as {name:string;unique:number;partial:number}[])
    .filter(index => index.unique === 1).map(index => {
      const sql = (db.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND name=?").get(index.name) as {sql:string|null}).sql;
      return JSON.stringify({predicate:index.partial ? normalizeSql(sql?.match(/\bWHERE\b(.*)$/isu)?.[1] ?? '') : null,columns:
        (db.pragma(`index_xinfo(${quote(index.name)})`) as {name:string;coll:string;key:number}[])
          .filter(column => column.key === 1).map(column => [column.name,column.coll.toUpperCase()])});
    });
}
function foreignKeys(db: Database.Database, table:string): string[] {
  return (db.pragma(`foreign_key_list(${quote(table)})`) as {table:string;from:string;to:string;on_update:string;on_delete:string;match:string}[])
    .map(row => JSON.stringify([row.table,row.from,row.to,row.on_update,row.on_delete,row.match]));
}
function triggers(db: Database.Database): {name:string;sql:string}[] {
  return (db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger'").all() as {name:string;sql:string}[])
    .map(row => ({name:row.name,sql:normalizeSql(row.sql)}));
}
let supportedSchema: {tables:{name:string;columns:Column[];uniqueKeys:string[];foreignKeys:string[]}[];triggers:{name:string;sql:string}[]} | undefined;
function assertCurrentStructure(database: Database.Database): void {
  if (!supportedSchema) {
    const expected = new Database(':memory:');
    try {
      migrateDatabase(expected,{databaseExists:false,createBackup(){}});
      supportedSchema = {tables:(expected.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as {name:string}[])
        .map(({name}) => ({name,columns:expected.pragma(`table_info(${quote(name)})`) as Column[],uniqueKeys:uniqueKeys(expected,name),foreignKeys:foreignKeys(expected,name)})),triggers:triggers(expected)};
    } finally { expected.close(); }
  }
  for (const table of supportedSchema.tables) {
    const columns = database.pragma(`table_info(${quote(table.name)})`) as Column[];
    const actualKeys = uniqueKeys(database,table.name);
    if (table.uniqueKeys.some(key => !actualKeys.includes(key))) throw new Error(`数据库唯一性约束不兼容：${table.name}`);
    const actualForeignKeys = foreignKeys(database,table.name);
    if (table.foreignKeys.some(key => !actualForeignKeys.includes(key))) throw new Error(`数据库外键约束不兼容：${table.name}`);
    for (const column of table.columns) {
      if (!columns.some(actual => actual.name === column.name && actual.type === column.type && actual.pk === column.pk && actual.notnull === column.notnull)) {
        throw new Error(`数据库结构不兼容：${table.name}.${column.name}`);
      }
    }
  }
  const actualTriggers = triggers(database);
  for (const trigger of supportedSchema.triggers) {
    if (!actualTriggers.some(actual => actual.name === trigger.name && actual.sql === trigger.sql)) throw new Error(`数据库保护触发器不兼容：${trigger.name}`);
  }
}
/** Validate the exact SQLite handle before any production migration or journal change. */
export function validateProductionDatabaseConnection(database: Database.Database): void {
  integrity(database); ledger(database);
  const snapshot = database.serialize();
  // Serialization includes committed WAL pages; deserialize needs a private
  // rollback-journal header instead of trying to find the source WAL on disk.
  snapshot[18] = 1; snapshot[19] = 1;
  const rehearsal = new Database(snapshot);
  try {
    migrateDatabase(rehearsal,{databaseExists:true,createBackup(){}});
    integrity(rehearsal); assertCurrentStructure(rehearsal);
  } finally { rehearsal.close(); }
}
/** Read-only source; migration rehearsal runs entirely in memory, including WAL data. */
export function validateProductionDatabase(file: string): void {
  // Validate an isolated copy so even damaged WAL headers cannot create sidecars
  // beside an untrusted selection. Existing WAL pages participate in the rehearsal.
  const scratch = mkdtempSync(join(tmpdir(),'planner-db-check-'));
  let database: Database.Database | undefined;
  try {
    const snapshotFile = join(scratch,'planner.db');
    copyFileSync(file,snapshotFile);
    if (existsSync(file+'-wal')) copyFileSync(file+'-wal',snapshotFile+'-wal');
    database = new Database(snapshotFile,{fileMustExist:true});
    validateProductionDatabaseConnection(database);
  } finally { database?.close(); rmSync(scratch,{recursive:true,force:true}); }
}
/** Reuse the protected transaction and independently verified migration backup. */
export function prepareExistingProductionDatabase(file: string): void {
  validateProductionDatabase(file);
  const database = new Database(file,{fileMustExist:true});
  try {
    validateProductionDatabaseConnection(database);
    database.pragma('foreign_keys = ON');
    migrateDatabase(database,{databaseExists:true,createBackup:()=>createDatabaseBackup(database,file,join(dirname(file),'backups'),'migration')});
    integrity(database);
  } finally { database.close(); }
}
export function backupProductionDatabase(directory: string): string {
  const file = join(directory,'planner.db');
  const database = new Database(file,{readonly:true,fileMustExist:true});
  try { return createDatabaseBackup(database,file,join(directory,'backups'),'restore'); }
  finally { database.close(); }
}
