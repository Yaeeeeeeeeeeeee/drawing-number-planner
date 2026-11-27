/** Presentation only. File operations use the original name and path. */
export function pdfFileName(name: string): string {
  return name.replace(/\.pdf$/i, '');
}
