import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Cross-platform policy check. Actual Inno execution against old/fresh custom
// targets is verified separately by the Windows delivery workflow.
describe('empty Windows installer data policy', () => {
  it.each(['scripts/p4-windows-installer.iss', 'scripts/comprehensive-windows-installer.iss'])('requires a fresh location without deleting old bundled or personal data (%s)', (filename) => {
    const installer = readFileSync(filename, 'utf8');
    expect(installer).toMatch(/^UsePreviousAppDir=no$/m);
    expect(installer).toMatch(/^DisableDirPage=no$/m);
    expect(installer).toContain("DirExists(AddBackslash(Directory) + 'resources\\app\\acceptance-seed')");
    expect(installer).toContain('HasOldAcceptanceSeed(WizardDirValue)');
    expect(installer).toContain("RequestedDirectory := ExpandConstant('{param:DIR|}')");
    expect(installer).toContain('HasOldAcceptanceSeed(RequestedDirectory)');
    expect(installer).toContain("HasOldAcceptanceSeed(ExpandConstant('{app}'))");
    expect(installer).not.toMatch(/\[InstallDelete\]|DelTree\s*\(|DeleteFile\s*\(|RemoveDir\s*\(/i);
  });
});
