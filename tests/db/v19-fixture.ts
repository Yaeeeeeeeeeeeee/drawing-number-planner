import {stripV5Schema} from './strip-v5-schema';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';
import { schemaVersionSeventeen } from '../../src/db/schema.sql';

export function restoreV19DrawingUsageTrigger(db: PlannerDatabase) {
  const sql = schemaVersionSeventeen.match(/CREATE TRIGGER drawing_usage_planned_update[\s\S]*?END;/)?.[0];
  if (!sql) throw new Error('Historical drawing usage trigger fixture is missing');
  db.exec('drop trigger drawing_usage_planned_update');
  db.exec(sql);
}

export function createV19Fixture() {
  const db = openDatabase(':memory:');
  migrateDatabase(db, { databaseExists: false, createBackup() {} });
  stripV5Schema(db);
  restoreV19DrawingUsageTrigger(db);
  db.prepare('delete from schema_migrations where version > 19').run();
  return db;
}
