export type FileScanChangeType = 'added' | 'missing' | 'moved' | 'changed' | 'unchanged';

export interface IndexedFileSnapshot {
  id: number;
  relativePath: string;
  pathKey: string;
  fileName: string;
  sizeBytes: number;
  modifiedAt: string;
  contentSha256: string | null;
  isPresent: boolean;
}

export interface CurrentFileSnapshot {
  relativePath: string;
  pathKey: string;
  fileName: string;
  sizeBytes: number;
  modifiedAt: string;
  contentSha256: string | null;
}

export interface FileScanDifference {
  type: FileScanChangeType;
  relativePath: string;
  previousRelativePath: string | null;
  previousFileId: number | null;
}

function byPath<T extends { pathKey: string }>(left: T, right: T): number {
  return left.pathKey.localeCompare(right.pathKey, 'en-US');
}

export function diffFileScan(previous: IndexedFileSnapshot[], current: CurrentFileSnapshot[]): FileScanDifference[] {
  const priorByPath = new Map(previous.filter((file) => file.isPresent).map((file) => [file.pathKey, file]));
  const currentByPath = new Map(current.map((file) => [file.pathKey, file]));
  const differences: FileScanDifference[] = [];
  const missing = previous.filter((file) => file.isPresent && !currentByPath.has(file.pathKey)).sort(byPath);
  const added = current.filter((file) => !priorByPath.has(file.pathKey)).sort(byPath);

  for (const file of current.filter((item) => priorByPath.has(item.pathKey)).sort(byPath)) {
    const prior = priorByPath.get(file.pathKey)!;
    const contentChanged = prior.contentSha256
      ? prior.contentSha256 !== file.contentSha256
      : prior.sizeBytes !== file.sizeBytes || prior.modifiedAt !== file.modifiedAt;
    differences.push({ type: contentChanged ? 'changed' : 'unchanged',
      relativePath: file.relativePath, previousRelativePath: null, previousFileId: prior.id });
  }

  const missingByHash = new Map<string, IndexedFileSnapshot[]>();
  const addedByHash = new Map<string, CurrentFileSnapshot[]>();
  for (const file of missing) if (file.contentSha256) missingByHash.set(file.contentSha256, [...(missingByHash.get(file.contentSha256) ?? []), file]);
  for (const file of added) if (file.contentSha256) {
    addedByHash.set(file.contentSha256, [...(addedByHash.get(file.contentSha256) ?? []), file]);
  }
  const movedPriorIds = new Set<number>(); const movedPathKeys = new Set<string>();
  for (const [hash, priorCandidates] of missingByHash) {
    const currentCandidates = addedByHash.get(hash) ?? [];
    if (priorCandidates.length === 1 && currentCandidates.length === 1) {
      const prior = priorCandidates[0]; const file = currentCandidates[0];
      differences.push({ type: 'moved', relativePath: file.relativePath, previousRelativePath: prior.relativePath, previousFileId: prior.id });
      movedPriorIds.add(prior.id); movedPathKeys.add(file.pathKey);
    }
  }
  for (const file of added) if (!movedPathKeys.has(file.pathKey)) {
    differences.push({ type: 'added', relativePath: file.relativePath, previousRelativePath: null, previousFileId: null });
  }
  for (const file of missing) if (!movedPriorIds.has(file.id)) {
    differences.push({ type: 'missing', relativePath: file.relativePath, previousRelativePath: null, previousFileId: file.id });
  }
  return differences;
}
