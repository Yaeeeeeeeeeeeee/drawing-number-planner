import { parseDrawingCode } from '../drawings/drawing-code.js';
import type { MaterialBatchService } from '../files/material-batch-service.js';
import type {
  MaterialSetBatchInput,
  MaterialSetFileInput,
  OutboundMaterialSelection,
} from './outbound-types.js';

export class MaterialBatchOrderAmbiguousError extends Error {
  readonly code = 'MATERIAL_BATCH_ORDER_AMBIGUOUS';

  constructor(readonly sequenceNumber: number) {
    super(`资料批次序号 ${String(sequenceNumber).padStart(2, '0')} 存在多个批次，无法自动判断顺序`);
    this.name = 'MaterialBatchOrderAmbiguousError';
  }
}

export class MaterialBatchNotEligibleError extends Error {
  readonly code = 'MATERIAL_BATCH_NOT_ELIGIBLE';

  constructor() {
    super('所选资料批次不存在，或不是该产品可用的已识别批次');
    this.name = 'MaterialBatchNotEligibleError';
  }
}

function slotKeyOf(fullCode: string): string | null {
  return parseDrawingCode(fullCode)?.prefix ?? null;
}

function preferredFile(files: MaterialSetFileInput[]): MaterialSetFileInput | null {
  return files.find((file) => file.isPresent) ?? null;
}

function selectionFrom(
  slotKey: string,
  fullCode: string,
  batch: MaterialSetBatchInput,
  file: MaterialSetFileInput | null,
  change: OutboundMaterialSelection['change'],
): OutboundMaterialSelection {
  return {
    slotKey,
    fullCode,
    sourceBatchId: batch.id,
    sourceBatchName: batch.name,
    sourceBatchSequence: batch.sequenceNumber,
    pdfIndexId: file?.pdfIndexId ?? null,
    fileName: file?.fileName ?? null,
    relativePath: file?.relativePath ?? null,
    contentSha256: file?.contentSha256 ?? null,
    status: file ? 'normal' : 'missing',
    change,
    conflictFullCodes: [],
  };
}

/**
 * Folds ordered, recognized material batches into the effective material set.
 * The ordering and file rows are supplied by MaterialBatchService; this function
 * deliberately does not inspect file timestamps.
 */
export function resolveCurrentMaterialSet(batches: MaterialSetBatchInput[]): OutboundMaterialSelection[] {
  const sequenceCounts = new Map<number, number>();
  for (const batch of batches) sequenceCounts.set(batch.sequenceNumber, (sequenceCounts.get(batch.sequenceNumber) ?? 0) + 1);
  const ambiguous = [...sequenceCounts.entries()].find(([, count]) => count > 1);
  if (ambiguous) throw new MaterialBatchOrderAmbiguousError(ambiguous[0]);

  const current = new Map<string, OutboundMaterialSelection>();
  for (const batch of [...batches].sort((left, right) => left.sequenceNumber - right.sequenceNumber || left.id - right.id)) {
    const grouped = new Map<string, Map<string, MaterialSetFileInput[]>>();
    for (const file of batch.files) {
      const slotKey = slotKeyOf(file.fullCode);
      if (!slotKey) continue;
      let codes = grouped.get(slotKey);
      if (!codes) {
        codes = new Map();
        grouped.set(slotKey, codes);
      }
      codes.set(file.fullCode, [...(codes.get(file.fullCode) ?? []), file]);
    }

    const touched = new Set<string>();
    for (const [slotKey, codes] of grouped) {
      touched.add(slotKey);
      const hasPresentFile = [...codes.values()].some((files) => files.some((file) => file.isPresent));
      const relevantCodes = hasPresentFile
        ? [...codes.entries()].filter(([, files]) => files.some((file) => file.isPresent))
        : [...codes.entries()];
      const fullCodes = relevantCodes.map(([fullCode]) => fullCode).sort();
      if (fullCodes.length > 1) {
        current.set(slotKey, {
          slotKey,
          fullCode: null,
          sourceBatchId: batch.id,
          sourceBatchName: batch.name,
          sourceBatchSequence: batch.sequenceNumber,
          pdfIndexId: null,
          fileName: null,
          relativePath: null,
          contentSha256: null,
          status: 'conflict',
          change: 'conflict',
          conflictFullCodes: fullCodes,
        });
        continue;
      }

      const fullCode = fullCodes[0];
      const sameCodeFiles = codes.get(fullCode) ?? [];
      const file = preferredFile(sameCodeFiles);
      const previous = current.get(slotKey);
      const presentFiles = sameCodeFiles.filter((candidate) => candidate.isPresent);
      const sameBatchContentUncertain = presentFiles.length > 1 && (
        presentFiles.some((candidate) => candidate.contentSha256 === null)
        || new Set(presentFiles.map((candidate) => candidate.contentSha256)).size > 1
      );
      if (sameBatchContentUncertain) {
        current.set(slotKey, {
          ...selectionFrom(slotKey, fullCode, batch, file, 'same_code_changed'),
          status: 'needs_confirmation',
        });
        continue;
      }
      if (!previous || previous.fullCode !== fullCode) {
        current.set(slotKey, selectionFrom(slotKey, fullCode, batch, file, previous ? 'replaced' : 'new'));
        continue;
      }

      if (previous.status === 'needs_confirmation') {
        const repeatsPendingCandidate = file !== null
          && file.contentSha256 !== null
          && previous.contentSha256 !== null
          && file.contentSha256 === previous.contentSha256;
        current.set(slotKey, file !== null && !repeatsPendingCandidate
          ? { ...selectionFrom(slotKey, fullCode, batch, file, 'same_code_changed'), status: 'needs_confirmation' }
          : previous);
        continue;
      }

      if (previous.status === 'missing' && file !== null) {
        current.set(slotKey, {
          ...selectionFrom(slotKey, fullCode, batch, file, 'same_code_changed'),
          status: 'needs_confirmation',
        });
        continue;
      }

      const repeatedContentUncertain = file !== null && previous.pdfIndexId !== null
        && (file.contentSha256 === null || previous.contentSha256 === null
          || file.contentSha256 !== previous.contentSha256);
      if (repeatedContentUncertain) {
        current.set(slotKey, {
          ...selectionFrom(slotKey, fullCode, batch, file, 'same_code_changed'),
          status: 'needs_confirmation',
        });
        continue;
      }

      if (previous.pdfIndexId === null && file !== null) {
        current.set(slotKey, { ...selectionFrom(slotKey, fullCode, batch, file, 'copied'), status: 'carried_forward' });
      } else {
        current.set(slotKey, { ...previous, status: previous.status === 'missing' ? 'missing' : 'carried_forward', change: 'copied' });
      }
    }

    for (const [slotKey, selection] of current) {
      if (!touched.has(slotKey) && selection.status !== 'conflict' && selection.status !== 'missing'
          && selection.status !== 'needs_confirmation') {
        current.set(slotKey, { ...selection, status: 'carried_forward', change: 'carried_forward' });
      }
    }
  }
  return [...current.values()].sort((left, right) => left.slotKey.localeCompare(right.slotKey));
}

export class CurrentMaterialSetService {
  constructor(private readonly materialBatches: MaterialBatchService) {}

  buildCurrentMaterialSet(productId: number, throughBatchId: number): OutboundMaterialSelection[] {
    const batches = this.materialBatches.getMaterialSetBatches(productId, throughBatchId);
    if (!batches) throw new MaterialBatchNotEligibleError();
    return resolveCurrentMaterialSet(batches);
  }
}
