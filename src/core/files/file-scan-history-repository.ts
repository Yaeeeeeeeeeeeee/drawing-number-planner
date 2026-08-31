import type { PlannerDatabase } from '../../db/database.js';
import type { FileScanChangeView, FileScanChangesView, FileScanRunView } from './file-types.js';

interface ScanRunRow {
  id: number; completedAt: string; currentTotal: number; added: number; missing: number;
  moved: number; changed: number; unchanged: number;
}

function toScanRun(row: ScanRunRow): FileScanRunView {
  return { id: row.id, completedAt: row.completedAt, currentTotal: row.currentTotal,
    added: row.added, missing: row.missing, moved: row.moved, changed: row.changed, unchanged: row.unchanged };
}

export class FileScanHistoryRepository {
  constructor(private readonly db: PlannerDatabase) {}

  latest(): FileScanRunView | null {
    const row = this.db.prepare(`select id, completed_at as completedAt, total_current as currentTotal,
      added_count as added, missing_count as missing, moved_count as moved, changed_count as changed,
      unchanged_count as unchanged from file_scan_runs order by id desc limit 1`).get() as ScanRunRow | undefined;
    return row ? toScanRun(row) : null;
  }

  changes(id: number): FileScanChangesView | null {
    const scan = this.db.prepare(`select id, completed_at as completedAt, total_current as currentTotal,
      added_count as added, missing_count as missing, moved_count as moved, changed_count as changed,
      unchanged_count as unchanged from file_scan_runs where id = ?`).get(id) as ScanRunRow | undefined;
    if (!scan) return null;
    const rows = this.db.prepare(`select id, change_type as type, relative_path as relativePath,
      previous_relative_path as previousRelativePath, file_name as fileName, full_code as fullCode
      from file_scan_changes where scan_run_id = ? and index_kind = 'pdf'
        and change_type in ('added', 'missing', 'moved', 'changed') order by id`).all(id) as FileScanChangeView[];
    const changes: FileScanChangesView['changes'] = { added: [], missing: [], changed: [] };
    for (const row of rows) {
      if (row.type === 'added') changes.added.push(row);
      else if (row.type === 'missing') changes.missing.push(row);
      else changes.changed.push(row);
    }
    return { scan: toScanRun(scan), changes };
  }
}
