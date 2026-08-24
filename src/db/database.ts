import Database from 'better-sqlite3';

export type PlannerDatabase = Database.Database;

export function openDatabase(path: string): PlannerDatabase {
  const database = new Database(path);
  database.pragma('foreign_keys = ON');
  if (path !== ':memory:') {
    database.pragma('journal_mode = WAL');
  }
  return database;
}
