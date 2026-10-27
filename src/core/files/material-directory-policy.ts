/** Only known material roots directly below a product; preserve actual folder names. */
export const SOURCE_MATERIAL_DIRECTORY = '02.未转曲源文件';
export const PRODUCTION_CHANGE_DIRECTORIES = [
  '03.量产后的变更文件',
  '03.量产后的变更文件（已量产的产品看最新日期）',
  '03.量产后的变更文件(已量产的产品看最新日期)',
  '03.量产后的变更明细',
  '03.量产后的变更明细（已量产的产品看最新日期）',
  '03.量产后的变更明细(已量产的产品看最新日期)',
] as const;
export const MATERIAL_DIRECTORIES = [SOURCE_MATERIAL_DIRECTORY, ...PRODUCTION_CHANGE_DIRECTORIES];
export function isProductionChangeDirectory(segment: string): boolean {
  return PRODUCTION_CHANGE_DIRECTORIES.some(name => name === segment);
}
export function isMaterialDirectory(segment: string): boolean {
  return segment === SOURCE_MATERIAL_DIRECTORY || isProductionChangeDirectory(segment);
}
export function isMaterialPdfPath(path: string): boolean {
  const segments = path.split(/[\\/]+/).filter(Boolean);
  return segments.length >= 4 && isMaterialDirectory(segments[2]);
}
export function isSourcePdfPath(path: string): boolean {
  const segments = path.split(/[\\/]+/).filter(Boolean);
  return segments.length >= 4 && segments[2] === SOURCE_MATERIAL_DIRECTORY;
}
