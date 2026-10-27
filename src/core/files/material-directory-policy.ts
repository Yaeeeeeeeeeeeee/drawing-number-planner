/** V5 scope is literal; legacy names remain readable in historical records only. */
export function isProductionChangeDirectory(segment: string): boolean {
  return segment === '03.量产后的变更文件';
}
export function isMaterialDirectory(segment: string): boolean {
  return segment === '02.未转曲源文件' || isProductionChangeDirectory(segment);
}
export function isMaterialPdfPath(path: string): boolean {
  const segments = path.split(/[\\/]+/).filter(Boolean);
  return segments.length >= 4 && isMaterialDirectory(segments[2]);
}
export function isSourcePdfPath(path: string): boolean {
  const segments = path.split(/[\\/]+/).filter(Boolean);
  return segments.length >= 4 && segments[2] === '02.未转曲源文件';
}
