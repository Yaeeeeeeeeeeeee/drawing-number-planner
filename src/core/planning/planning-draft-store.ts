import { randomUUID } from 'node:crypto';
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import type { PlanningDraftInput, PlanningDraftMode, PlanningDraftRecord } from './planning-types.js';
export type { PlanningDraftInput, PlanningDraftMode, PlanningDraftRecord } from './planning-types.js';

const optionalId = z.number().int().nonnegative().optional();
const identity = z.object({ origin: z.enum(['planned', 'historical']), id: z.number().int().positive() });
export const planningDraftInputSchema = z.object({
  step: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]), activeProductId: optionalId,
  groups: z.array(z.object({ productId: z.number().int().nonnegative(), appearanceId: optionalId, appearanceVersionId: optionalId,
    rows: z.array(z.object({ clientId: z.string().max(100), colorId: optionalId, mainCategoryId: optionalId,
      projectItemId: optionalId, notes: z.string().max(1000).optional(), shareWhite: z.boolean().optional(), whiteBase: identity.optional() })).max(100),
  })).max(100),
});
const storedDraftSchema = z.object({ revision: z.number().int().positive(), updatedAt: z.iso.datetime(), input: planningDraftInputSchema });
const fileSchema = z.object({ version: z.literal(1),
  revisions: z.object({ new: z.number().int().nonnegative().optional(), batch: z.number().int().nonnegative().optional() }).default({}),
  modes: z.object({ new: storedDraftSchema.optional(), batch: storedDraftSchema.optional() }),
});
type DraftFile = z.infer<typeof fileSchema>;
export class PlanningDraftError extends Error {
  constructor(public readonly code: 'DRAFT_STALE' | 'DRAFT_UNREADABLE' | 'INVALID_DRAFT', message: string) { super(message); }
}
/** Used by backups as well: invalid source data must never be silently replaced. */
export function parsePlanningDraftFile(contents: string): DraftFile {
  try {
    const parsed = fileSchema.parse(JSON.parse(contents));
    for (const mode of ['new', 'batch'] as const) {
      if (parsed.modes[mode] && (parsed.revisions[mode] ?? parsed.modes[mode]!.revision) < parsed.modes[mode]!.revision) throw new Error('invalid revision');
    }
    return parsed;
  } catch { throw new PlanningDraftError('DRAFT_UNREADABLE', '规划草稿文件无效或无法读取，请保留原文件后检查'); }
}
export class PlanningDraftStore {
  constructor(private readonly path: string) {}
  private load(): DraftFile {
    let text: string;
    try { text = readFileSync(this.path, 'utf8'); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, revisions: {}, modes: {} };
      throw new PlanningDraftError('DRAFT_UNREADABLE', '规划草稿文件无法读取，请保留原文件后检查');
    }
    return parsePlanningDraftFile(text);
  }
  read(mode: PlanningDraftMode): PlanningDraftRecord | null {
    return this.state(mode).draft;
  }
  state(mode: PlanningDraftMode): {draft: PlanningDraftRecord | null; revision: number} {
    const file = this.load(), draft = file.modes[mode];
    return {draft: draft ? { ...draft, requiresCheck: true } : null, revision: file.revisions[mode] ?? draft?.revision ?? 0};
  }
  private mutate<T>(operation: (file: DraftFile) => T): T {
    mkdirSync(dirname(this.path), { recursive: true });
    // Calls are synchronous within the application's service process: revision read,
    // comparison and atomic replacement cannot interleave with another request.
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    try {
      const file = this.load();
      const result = operation(file);
      const fd = openSync(temporary, 'wx');
      try { writeFileSync(fd, `${JSON.stringify(file, null, 2)}\n`); fsyncSync(fd); }
      finally { closeSync(fd); }
      renameSync(temporary, this.path);
      return result;
    } finally {
      try { unlinkSync(temporary); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
  }
  private checkRevision(file: DraftFile, mode: PlanningDraftMode, expectedRevision?: number): number {
    const revision = file.revisions[mode] ?? file.modes[mode]?.revision ?? 0;
    if ((expectedRevision !== undefined && expectedRevision !== revision) || (revision > 0 && expectedRevision === undefined)) {
      throw new PlanningDraftError('DRAFT_STALE', '草稿已被其他操作更新，请重新读取后再保存或删除');
    }
    return revision;
  }
  save(mode: PlanningDraftMode, input: PlanningDraftInput, expectedRevision?: number): PlanningDraftRecord {
    const parsed = planningDraftInputSchema.safeParse(input);
    if (!parsed.success) throw new PlanningDraftError('INVALID_DRAFT', '草稿输入无效');
    return this.mutate(file => {
      const revision = this.checkRevision(file, mode, expectedRevision) + 1;
      const draft = { revision, updatedAt: new Date().toISOString(), input: parsed.data };
      file.modes[mode] = draft; file.revisions[mode] = revision;
      return { ...draft, requiresCheck: true };
    });
  }
  delete(mode: PlanningDraftMode, expectedRevision?: number): number {
    return this.mutate(file => {
      const revision = this.checkRevision(file, mode, expectedRevision);
      if (file.modes[mode]) { delete file.modes[mode]; file.revisions[mode] = revision + 1; }
      return file.revisions[mode] ?? revision;
    });
  }
}
