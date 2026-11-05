import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

import { FileError } from './file-errors.js';
import { validateWorkspaceRoot } from './workspace-paths.js';

export interface WorkspaceSettings { workspaceRoot: string | null }

export class WorkspaceSettingsStore {
  constructor(private readonly path: string) {}

  get(): WorkspaceSettings {
    try {
      const text = readFileSync(this.path, 'utf8');
      const value = JSON.parse(text) as unknown;
      if (!value || typeof value !== 'object' || typeof (value as { workspaceRoot?: unknown }).workspaceRoot !== 'string') {
        throw new Error('invalid shape');
      }
      return { workspaceRoot: (value as { workspaceRoot: string }).workspaceRoot };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { workspaceRoot: null };
      throw new FileError('SETTINGS_INVALID', '本机设置文件无法读取', { cause: error });
    }
  }

  setWorkspaceRoot(input: string): WorkspaceSettings {
    const workspaceRoot = validateWorkspaceRoot(input);
    const outboundOutputRoot = this.getOutboundOutputRoot();
    this.write({ workspaceRoot, ...(outboundOutputRoot ? { outboundOutputRoot } : {}) });
    return { workspaceRoot };
  }

  getOutboundOutputRoot(): string | null {
    try {
      const value = JSON.parse(readFileSync(this.path, 'utf8')) as { outboundOutputRoot?: unknown };
      if (value.outboundOutputRoot === undefined) return null;
      if (typeof value.outboundOutputRoot !== 'string') throw new Error('invalid outbound output root');
      return value.outboundOutputRoot;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw new FileError('SETTINGS_INVALID', '本机设置文件无法读取', { cause: error });
    }
  }

  setOutboundOutputRoot(input: string): string {
    const outboundOutputRoot = validateWorkspaceRoot(input);
    const workspaceRoot = this.get().workspaceRoot;
    if (!workspaceRoot) throw new FileError('WORKSPACE_NOT_CONFIGURED', '请先设置资料根目录');
    this.write({ workspaceRoot, outboundOutputRoot });
    return outboundOutputRoot;
  }

  private write(value: { workspaceRoot: string; outboundOutputRoot?: string }): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const temporary = `${this.path}.${process.pid}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
      renameSync(temporary, this.path);
    } catch (error) {
      rmSync(temporary, { force: true });
      throw new FileError('SETTINGS_INVALID', '本机设置文件无法保存', { cause: error });
    }
  }
}
