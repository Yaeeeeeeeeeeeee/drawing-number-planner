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

function insertHistorical(sequence: number): number {
  const suffix = String(sequence).padStart(3, '0');
  return Number(database.prepare(`insert into historical_drawing_numbers
    (full_code, brand_code, product_size_code, appearance_code, color_code, main_category_code,
     project_item_code, sequence, first_seen_at, last_seen_at)
    values (?, '02', '0404', '01', '0', '04', '01', ?, '2026-08-26', '2026-08-26')`)
    .run(`02.0404.010.0401${suffix}`, sequence).lastInsertRowid);
}

function insertMissingPdf(historicalDrawingId: number): void {
  const relativePath = '01.洗碗机\\SKU-T40\\03.量产后的变更文件\\00.首批大货\\missing.pdf';
  database.prepare(`insert into pdf_files
    (relative_path, path_key, file_name, historical_drawing_id, match_status, detected_codes_json,
     conversion_type, size_bytes, modified_at, scanned_at, is_present)
    values (?, lower(?), 'missing.pdf', ?, 'matched', '[]', 'outlined', 1,
      '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z', 0)`)
    .run(relativePath, relativePath, historicalDrawingId);
}

describe('OccupiedNumberRepository', () => {
  it('finds a number recorded only by historical scanning', () => {
    insertHistorical(7);
    expect(repository.hasFullCode('02.0404.010.0401007')).toBe(true);
    expect(repository.findMaxSequence('02.0404.010.0401')).toBe(7);
  });

  it('keeps a historical number occupied without any present pdf', () => {
    const historicalDrawingId = insertHistorical(7);
    insertMissingPdf(historicalDrawingId);

    expect(database.prepare('select is_present as isPresent from pdf_files').get()).toEqual({ isPresent: 0 });
    expect(repository.hasFullCode('02.0404.010.0401007')).toBe(true);
    expect(repository.findMaxSequence('02.0404.010.0401')).toBe(7);
  });

  it('keeps an inactive historical number occupied for duplicate checks and sequence selection', () => {
    insertHistorical(8);
    database.prepare("update historical_drawing_numbers set status = 'inactive' where sequence = 8").run();

    expect(repository.hasFullCode('02.0404.010.0401008')).toBe(true);
    expect(repository.findMaxSequence('02.0404.010.0401')).toBe(8);
  });

  it('occupies normal and retained records but exposes only explicitly released sequences', () => {
    insertHistorical(1);
    const releasedTwo = insertHistorical(2);
    const releasedSeven = insertHistorical(7);
    const retainedEight = insertHistorical(8);
    database.prepare(`update historical_drawing_numbers set deleted_at = '2026-09-22',
      deletion_mode = 'release', deleted_full_code = full_code, deleted_previous_status = status,
      full_code = '__deleted__:historical:' || id where id in (?, ?)`).run(releasedTwo, releasedSeven);
    database.prepare(`update historical_drawing_numbers set deleted_at = '2026-09-22',
      deletion_mode = 'retain_occupied', deleted_full_code = full_code, deleted_previous_status = status
      where id = ?`).run(retainedEight);

    expect(repository.hasFullCode('02.0404.010.0401001')).toBe(true);
    expect(repository.hasFullCode('02.0404.010.0401002')).toBe(false);
    expect(repository.hasFullCode('02.0404.010.0401007')).toBe(false);
    expect(repository.hasFullCode('02.0404.010.0401008')).toBe(true);
    expect(repository.listReleasedSequences('02.0404.010.0401')).toEqual([2, 7]);
    expect(repository.findMaxSequence('02.0404.010.0401')).toBe(8);
  });
});
