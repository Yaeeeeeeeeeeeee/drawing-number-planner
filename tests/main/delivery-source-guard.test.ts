import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
// @vitest-environment node
import {it,expect} from 'vitest';
import {assertDesktopLayoutOnly, assertRendererIconDependencyOnly} from '../../scripts/p4-delivery-source-guard';
const base="window({\n    backgroundColor: '#FFFFFF',\n    show: false,\n    nodeIntegration: false,\n});\n  installRecoveryControls();\n  loadDesktopSurface();\n";
const visibilityOnly=base.replace("    show: false,","    // Keep native recovery available via Alt, without a permanently visible menu row.\n    autoHideMenuBar: true,\n    show: false,").replace('  installRecoveryControls();','  installRecoveryControls();\n  mainWindow.setMenuBarVisibility(false);');
it('accepts the unchanged source and only the requested visibility additions',()=>{expect(()=>assertDesktopLayoutOnly(base,base)).not.toThrow();expect(()=>assertDesktopLayoutOnly(base,visibilityOnly.replaceAll('\n','\r\n'))).not.toThrow();});
it('rejects weakening security or deleting recovery while allowing menu visibility',()=>{expect(()=>assertDesktopLayoutOnly(base,visibilityOnly.replace('nodeIntegration: false','nodeIntegration: true'))).toThrow(/Unexpected desktop/);expect(()=>assertDesktopLayoutOnly(base,visibilityOnly.replace('  installRecoveryControls();\n',''))).toThrow(/Unexpected desktop/);});

it('accepts exactly the pinned renderer icon dependency and rejects unrelated package or lock changes', () => {
  const old = (file: string) => execFileSync('git', ['show', `8dc2112b596cebc045a121f6e5126c8059a6c4e0:${file}`], {encoding:'utf8'});
  const candidatePackage = readFileSync('package.json','utf8');
  const candidateLock = readFileSync('pnpm-lock.yaml','utf8');
  const check = (pkg = candidatePackage, lock = candidateLock) => assertRendererIconDependencyOnly(old('package.json'), pkg, old('pnpm-lock.yaml'), lock);
  expect(() => check()).not.toThrow();
  const releasePackage=JSON.parse(candidatePackage);releasePackage.version='1.0.0';
  expect(() => check(JSON.stringify(releasePackage))).not.toThrow();
  releasePackage.version='2.0.0';
  expect(() => check(JSON.stringify(releasePackage))).toThrow();
  expect(() => check(candidatePackage.replace('1.59.0','1.60.0'))).toThrow();
  expect(() => check(candidatePackage.replace('^13.0.3','^14.0.0'))).toThrow();
  expect(() => check(candidatePackage, candidateLock.replace('sha512-5qgMyy','sha512-wrong'))).toThrow();
  expect(() => check(candidatePackage, candidateLock.replace('lockfileVersion:', 'changedVersion:'))).toThrow();
  expect(() => check(candidatePackage, candidateLock + '\nextra: true\n')).toThrow();
});
