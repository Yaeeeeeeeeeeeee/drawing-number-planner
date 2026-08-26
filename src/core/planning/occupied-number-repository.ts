import type { PlannerDatabase } from '../../db/database.js';

export class OccupiedNumberRepository {
  constructor(private readonly database: PlannerDatabase) {}

  findMaxSequence(prefix: string): number {
    const row = this.database.prepare(`select max(sequence) as sequence from (
      select sequence from drawing_numbers where substr(full_code, 1, length(full_code) - 3) = ?
      union all
      select sequence from historical_drawing_numbers where substr(full_code, 1, length(full_code) - 3) = ?
    )`).get(prefix, prefix) as { sequence: number | null };
    return row.sequence ?? 0;
  }

  hasFullCode(fullCode: string): boolean {
    const row = this.database.prepare(`select exists(
      select 1 from drawing_numbers where full_code = ?
      union all
      select 1 from historical_drawing_numbers where full_code = ?
    ) as occupied`).get(fullCode, fullCode) as { occupied: number };
    return row.occupied === 1;
  }
}
