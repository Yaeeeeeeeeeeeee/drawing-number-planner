import type { PlannerDatabase } from '../../db/database.js';

export class OccupiedNumberRepository {
  constructor(private readonly database: PlannerDatabase) {}

  findMaxSequence(prefix: string): number {
    const row = this.database.prepare(`select max(sequence) as sequence from (
      select sequence from drawing_numbers
      where (deleted_at is null or deletion_mode = 'retain_occupied')
        and substr(coalesce(deleted_full_code, full_code), 1, length(coalesce(deleted_full_code, full_code)) - 3) = ?
      union all
      select sequence from historical_drawing_numbers
      where (deleted_at is null or deletion_mode = 'retain_occupied')
        and substr(coalesce(deleted_full_code, full_code), 1, length(coalesce(deleted_full_code, full_code)) - 3) = ?
    )`).get(prefix, prefix) as { sequence: number | null };
    return row.sequence ?? 0;
  }

  hasFullCode(fullCode: string): boolean {
    const row = this.database.prepare(`select exists(
      select 1 from drawing_numbers
      where (deleted_at is null or deletion_mode = 'retain_occupied')
        and coalesce(deleted_full_code, full_code) = ?
      union all
      select 1 from historical_drawing_numbers
      where (deleted_at is null or deletion_mode = 'retain_occupied')
        and coalesce(deleted_full_code, full_code) = ?
    ) as occupied`).get(fullCode, fullCode) as { occupied: number };
    return row.occupied === 1;
  }

  listReleasedSequences(prefix: string): number[] {
    const rows = this.database.prepare(`select sequence, deleted_full_code as full_code from drawing_numbers
      where deleted_at is not null and deletion_mode = 'release' and deleted_full_code is not null
        and substr(deleted_full_code, 1, length(deleted_full_code) - 3) = ?
      union all
      select sequence, deleted_full_code as full_code from historical_drawing_numbers
      where deleted_at is not null and deletion_mode = 'release' and deleted_full_code is not null
        and substr(deleted_full_code, 1, length(deleted_full_code) - 3) = ?
      order by sequence`).all(prefix, prefix) as Array<{ sequence: number; full_code: string }>;
    return [...new Set(rows
      .filter((row) => !this.hasFullCode(row.full_code))
      .map((row) => row.sequence))];
  }
}
