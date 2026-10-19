// @vitest-environment node
import {it,expect} from 'vitest';
import {assertDesktopLayoutOnly} from '../../scripts/p4-delivery-source-guard';
const base="window({\n    backgroundColor: '#FFFFFF',\n    show: false,\n    nodeIntegration: false,\n});\n  installRecoveryControls();\n  loadDesktopSurface();\n";
const visibilityOnly=base.replace("    show: false,","    // Keep native recovery available via Alt, without a permanently visible menu row.\n    autoHideMenuBar: true,\n    show: false,").replace('  installRecoveryControls();','  installRecoveryControls();\n  mainWindow.setMenuBarVisibility(false);');
it('accepts the unchanged source and only the requested visibility additions',()=>{expect(()=>assertDesktopLayoutOnly(base,base)).not.toThrow();expect(()=>assertDesktopLayoutOnly(base,visibilityOnly.replaceAll('\n','\r\n'))).not.toThrow();});
it('rejects weakening security or deleting recovery while allowing menu visibility',()=>{expect(()=>assertDesktopLayoutOnly(base,visibilityOnly.replace('nodeIntegration: false','nodeIntegration: true'))).toThrow(/Unexpected desktop/);expect(()=>assertDesktopLayoutOnly(base,visibilityOnly.replace('  installRecoveryControls();\n',''))).toThrow(/Unexpected desktop/);});
