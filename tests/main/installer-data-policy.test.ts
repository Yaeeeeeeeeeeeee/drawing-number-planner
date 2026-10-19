import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Cross-platform policy check. Actual Inno execution against old/fresh custom
// targets is verified separately by the Windows delivery workflow.
describe('empty Windows installer data policy', () => {
  it('requires a fresh location instead of deleting old bundled or personal data', () => {
    const installer = readFileSync('scripts/p4-windows-installer.iss', 'utf8');
    expect(installer).toContain('DefaultDirName={localappdata}\\Programs\\DrawingNumberPlannerP4-Empty');
    expect(installer).toMatch(/^UsePreviousAppDir=no$/m);
    expect(installer).toMatch(/^DisableDirPage=no$/m);
    expect(installer).toContain("DirExists(AddBackslash(Directory) + 'resources\\app\\acceptance-seed')");
    expect(installer).toContain('HasOldAcceptanceSeed(WizardDirValue)');
    expect(installer).toContain("HasOldAcceptanceSeed(ExpandConstant('{app}'))");
    expect(installer).not.toMatch(/\[InstallDelete\]|DelTree\s*\(|DeleteFile\s*\(|RemoveDir\s*\(/i);
  });
});
