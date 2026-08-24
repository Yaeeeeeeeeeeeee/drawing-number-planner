import type { PlannerDatabase } from '../../db/database.js';
import { composeDrawingCode, composeDrawingPrefix, formatDisplayName } from './code-generator.js';
import { PlanningError } from './planning-errors.js';
import { PlanningRepository } from './planning-repository.js';
import type { PlannedRow, PlanningInput, PlanningPreview, ReservePlanningInput, ReservedDrawing } from './planning-types.js';

export class PlanningService {
  private readonly repository: PlanningRepository;
  constructor(private readonly database: PlannerDatabase) { this.repository = new PlanningRepository(database); }

  private validateInput(input: PlanningInput): void {
    if (input.rows.length < 1 || input.rows.length > 100) {
      throw new PlanningError('INVALID_PLAN', '每批必须包含 1 至 100 个项目');
    }
    const clientIds = input.rows.map((row) => row.clientId.trim());
    if (clientIds.some((id) => !id) || new Set(clientIds).size !== clientIds.length) {
      throw new PlanningError('INVALID_PLAN', '批次行标识不能为空或重复');
    }
  }

  preview(input: PlanningInput): PlanningPreview {
    this.validateInput(input);
    const context = this.repository.resolveContext(input);
    const nextByPrefix = new Map<string, number>();
    const rows: PlannedRow[] = context.rows.map((row) => {
      const parts = {
        brandCode: context.brandCode, productSizeCode: context.productSizeCode,
        appearanceCode: context.appearanceCode, colorCode: row.colorCode,
        mainCategoryCode: row.mainCategoryCode, projectItemCode: row.projectItemCode,
      };
      const prefix = composeDrawingPrefix(parts);
      const sequence = nextByPrefix.get(prefix) ?? this.repository.findMaxSequence(prefix) + 1;
      if (sequence > 999) throw new PlanningError('SEQUENCE_EXHAUSTED', `编码前缀 ${prefix} 的流水号已用完`);
      const fullCode = composeDrawingCode(parts, sequence);
      if (this.repository.hasFullCode(fullCode)) {
        throw new PlanningError('DRAWING_CODE_CONFLICT', `图号 ${fullCode} 已存在`);
      }
      nextByPrefix.set(prefix, sequence + 1);
      return {
        clientId: row.clientId, fullCode, prefix, sequence, available: true,
        displayName: formatDisplayName({ brandName: context.brandName, model: context.model,
          colorName: row.colorName, projectItemName: row.projectItemName }),
      };
    });
    return { productId: context.productId, appearanceId: context.appearanceId, rows };
  }

  reserve(input: ReservePlanningInput): ReservedDrawing[] {
    const run = this.database.transaction(() => {
      const planningInput: PlanningInput = {
        productId: input.productId,
        ...(input.appearanceId === undefined ? {} : { appearanceId: input.appearanceId }),
        rows: input.rows.map(({ expectedFullCode: _expected, ...row }) => row),
      };
      const preview = this.preview(planningInput);
      if (preview.rows.some((row, index) => row.fullCode !== input.rows[index].expectedFullCode)) {
        throw new PlanningError('PLAN_STALE', '推荐图号已变化，请重新查重后再占号');
      }
      const context = this.repository.resolveContext(planningInput);
      try {
        return preview.rows.map((planned, index) => this.repository.insertReserved(context, context.rows[index], planned));
      } catch (error) {
        if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
          throw new PlanningError('DRAWING_CODE_CONFLICT', '图号已被占用，请重新查重');
        }
        throw error;
      }
    });
    return run.immediate();
  }
}
