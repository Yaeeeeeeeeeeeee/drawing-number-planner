import { expect, it, vi } from 'vitest';
import { migrateDatabase } from '../../src/db/migrations';
import { DrawingQueryService } from '../../src/core/drawings/drawing-query-service';
import { OccupiedNumberRepository } from '../../src/core/planning/occupied-number-repository';
import { createV19Fixture } from './v19-fixture';

function fixture() {
  const db = createV19Fixture();
  db.exec(`insert into dictionary_items(id,type,code,name,parent_id,created_at) values
    (1,'brand','02','Brand',null,'old'),(2,'product_size','0209','Size',null,'old'),
    (3,'appearance','01','Original',null,'old'),(4,'appearance','02','Reuse',null,'old'),
    (5,'color','0','White',null,'old'),(6,'main_category','04','Print',null,'old'),
    (7,'project_item','01','Logo',6,'old');
    insert into products(id,sku,brand_id,product_size_id,default_appearance_id,model,product_category,created_at)
      values(1,'SKU',1,2,3,'MODEL','Category','old');
    insert into product_identity_members(raw_product_id,canonical_product_id) values(1,1);
    insert into product_identity_state(product_id,revision) values(1,1);
    insert into product_appearance_versions(id,product_id,version_number,appearance_id,label,status,created_at)
      values(1,1,1,3,'Original','current','old'),(2,1,2,4,'Reuse','draft','old');
    insert into drawing_numbers(id,full_code,display_name,product_id,appearance_id,color_id,main_category_id,
      project_item_id,brand_code,product_size_code,appearance_code,color_code,main_category_code,project_item_code,
      sequence,status,created_at) values(1,'02.0209.010.0401001','Logo',1,3,5,6,7,'02','0209','01','0','04','01',1,'active','old');
    insert into drawing_appearance_bindings(origin,record_id,product_id,appearance_version_id,source,revision,updated_at)
      values('planned',1,1,1,'planning',1,'old');
    insert into drawing_appearance_usages(origin,record_id,product_id,appearance_version_id,reason,created_at)
      values('planned',1,1,2,'Explicit reuse','old');
    insert into drawing_appearance_usage_audit(origin,record_id,product_id,appearance_version_id,reason,evidence_json,created_at)
      values('planned',1,1,2,'Explicit reuse','{}','old');
    insert into pdf_files(relative_path,file_name,drawing_id,match_status,detected_codes_json,conversion_type,size_bytes,
      modified_at,scanned_at,is_present) values('original.pdf','original.pdf',1,'matched','[]','outlined',12,'old','old',1);
    create index custom_drawing_index on drawing_numbers(notes);
    create trigger custom_drawing_trigger after update of notes on drawing_numbers begin select 1; end;`);
  return db;
}

it('upgrades only the status guard with one backup and preserves all rows, schema objects, reuse and occupation', () => {
  const db = fixture();
  try {
    expect(() => db.prepare("update drawing_numbers set status='voided' where id=1").run()).toThrow('图号被外观复用引用');
    const tables = (db.prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%' and name<>'schema_migrations' order by name").all() as {name:string}[]).map(row=>row.name);
    const before = tables.map(table=>{const rows=db.prepare(`select * from "${table}" order by rowid`).all() as Record<string,unknown>[];return table==='outbound_email_templates'?rows.map(({manufacturer,scenario,contacts_configured,import_sources_json,...original})=>original):rows;});
    const objects = db.prepare("select type,name,sql from sqlite_master where name<>'drawing_usage_planned_update' order by type,name").all();
    const backup = vi.fn(() => expect(db.prepare('select max(version) as v from schema_migrations').get()).toEqual({v:19}));
    expect(migrateDatabase(db, {databaseExists:true,createBackup:backup})).toEqual({from:19,to:23});
    expect(backup).toHaveBeenCalledOnce();
    expect(tables.map(table=>{const rows=db.prepare(`select * from "${table}" order by rowid`).all() as Record<string,unknown>[];return table==='outbound_email_templates'?rows.map(({manufacturer,scenario,contacts_configured,import_sources_json,...original})=>original):rows;})).toEqual(before);
    for(const object of objects as Array<{type:string;name:string;sql:string|null}>){if(['drawing_usage_historical_update','outbound_email_templates'].includes(object.name))continue;expect(db.prepare('select type,name,sql from sqlite_master where type=? and name=?').get(object.type,object.name)).toEqual(object);}
    const service = new DrawingQueryService(db);
    expect(service.transition(1,'voided')).toMatchObject({status:'voided',fullCode:'02.0209.010.0401001',occupied:true});
    expect(service.previewDeletion(1).releaseEligible).toBe(false);
    expect(new OccupiedNumberRepository(db).hasFullCode('02.0209.010.0401001')).toBe(true);
    expect(service.transition(1,'active').status).toBe('active');
    expect(tables.map(table=>{const rows=db.prepare(`select * from "${table}" order by rowid`).all() as Record<string,unknown>[];return table==='outbound_email_templates'?rows.map(({manufacturer,scenario,contacts_configured,import_sources_json,...original})=>original):rows;})).toEqual(before);
    for (const sql of ["update drawing_numbers set full_code='02.0209.010.0401009' where id=1",
      'update drawing_numbers set id=99 where id=1','update drawing_numbers set product_id=99 where id=1',
      "update drawing_numbers set deleted_at='now' where id=1", "update drawing_numbers set deletion_mode='release' where id=1",
      'delete from drawing_numbers where id=1', 'delete from drawing_appearance_usages']) {
      expect(()=>db.exec(sql)).toThrow();
    }
    expect(db.pragma('foreign_key_check')).toEqual([]);
    expect(db.pragma('foreign_keys',{simple:true})).toBe(1);
    expect(migrateDatabase(db,{databaseExists:true,createBackup:backup})).toEqual({from:23,to:23});
    expect(backup).toHaveBeenCalledOnce();
  } finally { db.close(); }
});

it.each(['abort','corrupt'])('rolls back the complete trigger migration on %s with old rows and foreign keys intact', failure => {
  const db = fixture();
  try {
    db.exec(failure==='abort'
      ? "create trigger fail20 before insert on schema_migrations when new.version=20 begin select raise(abort,'rollback20');end"
      : "create trigger fail20 after insert on schema_migrations when new.version=20 begin update drawing_numbers set notes='changed';end");
    const schema = db.prepare('select type,name,sql from sqlite_master order by type,name').all();
    const drawing = db.prepare('select * from drawing_numbers').all();
    const backup = vi.fn();
    expect(()=>migrateDatabase(db,{databaseExists:true,createBackup:backup})).toThrow(failure==='abort'?'rollback20':'图号状态迁移历史内容校验失败');
    expect(backup).toHaveBeenCalledOnce();
    expect(db.prepare('select type,name,sql from sqlite_master order by type,name').all()).toEqual(schema);
    expect(db.prepare('select * from drawing_numbers').all()).toEqual(drawing);
    expect(db.prepare('select max(version) as v from schema_migrations').get()).toEqual({v:19});
    expect(db.pragma('foreign_key_check')).toEqual([]);
    expect(db.pragma('foreign_keys',{simple:true})).toBe(1);
    expect(()=>db.exec("update drawing_numbers set status='voided' where id=1")).toThrow('图号被外观复用引用');
  } finally { db.close(); }
});
