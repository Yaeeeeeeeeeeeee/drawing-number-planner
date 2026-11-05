// Delivery-only initialization; never accepts or resets an existing database.
import { closeSync, openSync } from 'node:fs';
import { openDatabase } from '../src/db/database.js';
import { migrateDatabase } from '../src/db/migrations.js';

export function initializeEmptyAcceptanceDatabase(databasePath: string): void {
  // Exclusive creation is the safety boundary: a marked installation never calls
  // this initializer, and an existing database cannot be truncated or cleared.
  closeSync(openSync(databasePath, 'wx'));
  const database = openDatabase(databasePath);
  try {
    migrateDatabase(database, { databaseExists: false, createBackup: () => { throw new Error('Fresh initialization must not touch existing data'); } });
    database.transaction(() => {
      // These are the migration's editable demonstration mail records, including
      // personal signature details. Keep Schema and built-in QR purpose definitions.
      database.prepare('DELETE FROM outbound_email_templates').run();
      database.prepare('DELETE FROM outbound_signatures').run();
      const tables = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as Array<{ name: string }>;
      for (const { name } of tables) {
        if (['schema_migrations', 'qr_purposes', 'qr_purpose_product_categories'].includes(name)) continue;
        const count = database.prepare(`SELECT COUNT(*) AS count FROM "${name.replaceAll('"', '""')}"`).get() as { count: number };
        if (count.count !== 0) throw new Error(`Fresh business table must be empty: ${name}`);
      }
    })();
    database.pragma('wal_checkpoint(TRUNCATE)');
  } finally {
    database.close();
  }
}
