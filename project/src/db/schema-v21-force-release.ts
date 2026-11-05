/** V5 releases current occupation while retaining the original immutable drawing identity. */
export const schemaVersionTwentyOne = `
 CREATE TABLE drawing_force_releases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  origin TEXT NOT NULL CHECK(origin IN ('planned','historical')),
  record_id INTEGER NOT NULL CHECK(record_id>0),
  full_code TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
  references_json TEXT NOT NULL CHECK(json_valid(references_json)),
  reason TEXT, created_at TEXT NOT NULL,
  UNIQUE(origin,record_id)
 );
 CREATE TABLE drawing_force_release_files (
  release_id INTEGER NOT NULL REFERENCES drawing_force_releases(id) ON DELETE RESTRICT,
  relative_path TEXT NOT NULL,
  path_key TEXT NOT NULL,
  full_code TEXT NOT NULL,
  PRIMARY KEY(release_id,path_key,full_code)
 );
 CREATE INDEX drawing_force_release_path_idx ON drawing_force_release_files(path_key,full_code);
 ${['drawing_force_releases','drawing_force_release_files'].map(table=>`
 CREATE TRIGGER ${table}_immutable_update BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(ABORT,'强制释放历史不可修改'); END;
 CREATE TRIGGER ${table}_immutable_delete BEFORE DELETE ON ${table} BEGIN SELECT RAISE(ABORT,'强制释放历史不可删除'); END;`).join('')}
 ${(['planned','historical'] as const).map(origin=>{
 const table=origin==='planned'?'drawing_numbers':'historical_drawing_numbers';
 return `
 DROP TRIGGER drawing_usage_${origin}_update;
 CREATE TRIGGER drawing_usage_${origin}_update BEFORE UPDATE OF id,product_id,full_code,status,deleted_at,deletion_mode ON ${table}
 WHEN EXISTS(SELECT 1 FROM drawing_appearance_usages WHERE origin='${origin}' AND record_id=OLD.id)
 AND (NEW.id IS NOT OLD.id OR NEW.product_id IS NOT OLD.product_id OR NEW.full_code IS NOT OLD.full_code
 ${origin==='historical'?"OR NEW.status='voided'":''} OR NEW.deleted_at IS NOT NULL OR NEW.deletion_mode='release')
 AND NOT (NEW.id=OLD.id AND NEW.product_id IS OLD.product_id AND NEW.status=OLD.status
  AND NEW.deleted_at IS NOT NULL AND NEW.deletion_mode='release'
  AND EXISTS(SELECT 1 FROM drawing_force_releases r WHERE r.origin='${origin}' AND r.record_id=OLD.id
   AND r.full_code=NEW.deleted_full_code AND NEW.full_code='__force_released__:${origin}:'||OLD.id||':'||r.id))
 BEGIN SELECT RAISE(ABORT,'图号被外观复用引用'); END;
 CREATE TRIGGER force_${origin}_tombstone_update BEFORE UPDATE ON ${table}
 WHEN OLD.full_code LIKE '__force_released__:%' AND EXISTS(SELECT 1 FROM drawing_force_releases WHERE origin='${origin}' AND record_id=OLD.id)
 BEGIN SELECT RAISE(ABORT,'强制释放原身份不可恢复或改写'); END;
 CREATE TRIGGER force_${origin}_tombstone_delete BEFORE DELETE ON ${table}
 WHEN EXISTS(SELECT 1 FROM drawing_force_releases WHERE origin='${origin}' AND record_id=OLD.id)
 BEGIN SELECT RAISE(ABORT,'强制释放原身份不可删除或复用'); END;
 `;}).join('')}
 ${['pdf_files','bom_items','outbound_package_items'].map(table=>['INSERT','UPDATE OF drawing_id,historical_drawing_id'].map(event=>`
 CREATE TRIGGER force_${table}_${event.startsWith('INSERT')?'insert':'update'} BEFORE ${event} ON ${table}
 WHEN ${event.startsWith('INSERT')?'':`(NEW.drawing_id IS NOT OLD.drawing_id OR NEW.historical_drawing_id IS NOT OLD.historical_drawing_id) AND `}
 EXISTS(SELECT 1 FROM drawing_force_releases r WHERE (r.origin='planned' AND r.record_id=NEW.drawing_id) OR (r.origin='historical' AND r.record_id=NEW.historical_drawing_id))
 BEGIN SELECT RAISE(ABORT,'不能新增指向已强制释放图号的关联'); END;
 `).join('')).join('')}

 ${['INSERT','UPDATE OF drawing_id,historical_drawing_id,relative_path'].map(event=>`
 CREATE TRIGGER force_pdf_quarantine_${event.startsWith('INSERT')?'insert':'update'} BEFORE ${event} ON pdf_files
 WHEN (NEW.drawing_id IS NOT NULL OR NEW.historical_drawing_id IS NOT NULL) AND EXISTS(
  SELECT 1 FROM drawing_force_release_files q WHERE q.path_key=lower(replace(NEW.relative_path,'/','\\'))
  AND (q.full_code=(SELECT full_code FROM drawing_numbers WHERE id=NEW.drawing_id)
    OR q.full_code=(SELECT full_code FROM historical_drawing_numbers WHERE id=NEW.historical_drawing_id)))
 BEGIN SELECT RAISE(ABORT,'旧 PDF 已强制脱钩，不能自动关联到重分配图号'); END;
 `).join('')}
`;
