import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { OccupiedNumberRepository } from '../../src/core/planning/occupied-number-repository';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';

let database: PlannerDatabase;
let repository: OccupiedNumberRepository;

beforeEach(() => {
  database = openDatabase(':memory:');
  migrateDatabase(database, { databaseExists: false, createBackup: () => undefined });
  repository = new OccupiedNumberRepository(database);
});
afterEach(() => database.close());

function insertHistorical(sequence: number) {
  const suffix = String(sequence).padStart(3, '0');
  database.prepare(`insert into historical_drawing_numbers
    (full_code, brand_code, product_size_code, appearance_code, color_code, main_category_code,
     project_item_code, sequence, first_seen_at, last_seen_at)
    values (?, '02', '0404', '01', '0', '04', '01', ?, '2026-08-26', '2026-08-26')`)
    .run(`02.0404.010.0401${suffix}`, sequence);
}

describe('OccupiedNumberRepository', () => {
  it('finds a number recorded only by historical scanning', () => {
    insertHistorical(7);
    expect(repository.hasFullCode('02.0404.010.0401007')).toBe(true);
    expect(repository.findMaxSequence('02.0404.010.0401')).toBe(7);
  });

  it('keeps a historical number occupied without any present pdf', () => {
    insertHistorical(7);
    expect(database.prepare('select count(*) as count from pdf_files').get()).toEqual({ count: 0 });
    expect(repository.findMaxSequence('02.0404.010.0401')).toBe(7);
  });
});
