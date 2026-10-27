/** Only the explicitly requested native menu visibility changes are permitted. */
export function assertDesktopLayoutOnly(base: string, candidate: string): void {
  const normalize = (value: string) => value.replaceAll('\r\n','\n').trim();
  const reverted = normalize(candidate)
    .replace('    // Keep native recovery available via Alt, without a permanently visible menu row.\n    autoHideMenuBar: true,\n','')
    .replace('  mainWindow.setMenuBarVisibility(false);\n','');
  if (reverted !== normalize(base)) throw new Error('Unexpected desktop source change; only native menu visibility is permitted');
}

/** Permit renderer icons and the approved stable app version without runtime upgrades. */
export function assertRendererIconDependencyOnly(basePackage: string, candidatePackage: string, baseLock: string, candidateLock: string): void {
  const normalize = (value: string) => value.replaceAll('\r\n', '\n');
  const base = JSON.parse(basePackage), candidate = JSON.parse(candidatePackage);
  if (candidate.version !== base.version && !['1.0.0','1.1.0','1.1.1'].includes(candidate.version)) throw new Error('Unexpected application release version');
  candidate.version = base.version;
  if (candidate.dependencies?.['lucide-react'] !== '1.59.0') throw new Error('Unexpected icon dependency version');
  delete candidate.dependencies['lucide-react'];
  if (JSON.stringify(base) !== JSON.stringify(candidate)) throw new Error('Unexpected package change beyond renderer icons');
  const additions = [
    '      lucide-react:\n        specifier: 1.59.0\n        version: 1.59.0(@types/react@19.2.18)(react@19.2.8)\n',
    "  lucide-react@1.59.0:\n    resolution: {integrity: sha512-5qgMyyCPU6OvnKpLS2t693+ZtiqA8oaSweWoUows0BLFKFf6V75m4+CptpmohZHpD5IuOVIBXHBBiv2vpLJmtw==}\n    peerDependencies:\n      '@types/react': '*'\n      react: ^16.5.1 || ^17.0.0 || ^18.0.0 || ^19.0.0\n    peerDependenciesMeta:\n      '@types/react':\n        optional: true\n\n",
    "  lucide-react@1.59.0(@types/react@19.2.18)(react@19.2.8):\n    dependencies:\n      react: 19.2.8\n    optionalDependencies:\n      '@types/react': 19.2.18\n\n",
  ];
  let reverted = normalize(candidateLock);
  for (const addition of additions) {
    if (reverted.split(addition).length !== 2) throw new Error('Unexpected renderer icon lock entry');
    reverted = reverted.replace(addition, '');
  }
  if (reverted !== normalize(baseLock)) throw new Error('Unexpected lockfile change beyond renderer icons');
}
