/** Only the explicitly requested native menu visibility changes are permitted. */
export function assertDesktopLayoutOnly(base: string, candidate: string): void {
  const normalize = (value: string) => value.replaceAll('\r\n','\n').trim();
  const reverted = normalize(candidate)
    .replace('    // Keep native recovery available via Alt, without a permanently visible menu row.\n    autoHideMenuBar: true,\n','')
    .replace('  mainWindow.setMenuBarVisibility(false);\n','');
  if (reverted !== normalize(base)) throw new Error('Unexpected desktop source change; only native menu visibility is permitted');
}
