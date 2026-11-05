export const OUTBOUND_ZIP_LIMIT_BYTES = 50_000_000;
export const OUTBOUND_ZIP_TARGET_BYTES = 49_000_000;

export function partitionOutboundFiles<T extends { sizeBytes: number }>(files: readonly T[]): T[][] {
  const parts: T[][] = [];
  let current: T[] = [];
  let bytes = 0;
  for (const file of files) {
    if (!Number.isSafeInteger(file.sizeBytes) || file.sizeBytes < 0) throw new Error('文件大小无效，请重新检查文件。');
    if (current.length && bytes + file.sizeBytes > OUTBOUND_ZIP_TARGET_BYTES) {
      parts.push(current); current = []; bytes = 0;
    }
    current.push(file); bytes += file.sizeBytes;
  }
  if (current.length) parts.push(current);
  return parts;
}
