// @vitest-environment node
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { afterEach, it, expect, vi } from 'vitest';
import Database from 'better-sqlite3';
import { initializeEmptyAcceptanceDatabase } from '../../scripts/initialize-empty-acceptance.js';
import { openDatabase } from '../../src/db/database';

const require = createRequire(import.meta.url);
const { prepareProductionProfile } = require('../../scripts/production-profile.cjs');
const roots: string[] = [];
const originalDatabases = new Map<string, Buffer>();
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  originalDatabases.clear();
});

function createHistoryFolder(old: string) {
  mkdirSync(join(old, 'backups'), { recursive: true });
  const database = new Database(join(old, 'planner.db'));
  try { database.exec("CREATE TABLE history(value TEXT); INSERT INTO history VALUES ('historybytes');"); }
  finally { database.close(); }
  originalDatabases.set(old, readFileSync(join(old, 'planner.db')));
  writeFileSync(join(old, 'settings.json'), 'external workspace');
  writeFileSync(join(old, 'backups', 'history.db'), 'old backup');
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'planner-profile-'));
  roots.push(root);
  const appData = join(root, 'appdata');
  const home = join(appData, 'DrawingNumberPlanner');
  const config = join(home, 'profile.json');
  const old = join(root, 'old');
  createHistoryFolder(old);
  const input = {
    appData,
    chooseMode: async () => 'existing',
    chooseDatabase: async () => join(old, 'planner.db'),
    initializeDatabase: initializeEmptyAcceptanceDatabase,
  };
  return { root, home, config, old, input };
}

function expectOldPreserved(old: string) {
  expect(readFileSync(join(old, 'planner.db'))).toEqual(originalDatabases.get(old));
  expect(readFileSync(join(old, 'settings.json'), 'utf8')).toBe('external workspace');
  expect(readFileSync(join(old, 'backups', 'history.db'), 'utf8')).toBe('old backup');
}

it('portable launches reuse the explicitly selected folder without a repeated prompt', async () => {
  const { old, input } = fixture();
  expect(await prepareProductionProfile(input)).toBe(old);
  expect(await prepareProductionProfile({ ...input, chooseMode: () => { throw Error('unexpected prompt'); } })).toBe(old);
  expectOldPreserved(old);
});

it('asks once after each installation including a same-version reinstall and remembers only the completed choice', async () => {
  const { old, input, config } = fixture();
  let prompts = 0;
  const chooseMode = async () => { prompts++; return 'existing'; };
  for (const installationId of ['install-1', 'install-1', 'install-2-same-version', 'install-2-same-version', 'install-3-upgrade']) {
    expect(await prepareProductionProfile({ ...input, chooseMode, installationId })).toBe(old);
  }
  expect(prompts).toBe(3);
  expect(JSON.parse(readFileSync(config, 'utf8'))).toEqual({ dataDir: old, installationId: 'install-3-upgrade' });
  expectOldPreserved(old);
});

it('asks once when an installed app first encounters a legacy profile without an installation marker', async () => {
  const { old, input, config } = fixture();
  await prepareProductionProfile(input);
  let prompts = 0;
  expect(await prepareProductionProfile({ ...input, installationId: 'first-marker', chooseMode: async () => { prompts++; return 'existing'; } })).toBe(old);
  expect(prompts).toBe(1);
  expect(await prepareProductionProfile({ ...input, installationId: 'first-marker', chooseMode: () => { throw Error('unexpected prompt'); } })).toBe(old);
  expectOldPreserved(old);
  expect(JSON.parse(readFileSync(config, 'utf8')).installationId).toBe('first-marker');
});

it('creates an empty first database without a file chooser and reuses it on ordinary launches', async () => {
  const { home, input } = fixture();
  const data = await prepareProductionProfile({ ...input, installationId: 'install-1', chooseMode: async () => 'fresh', chooseDatabase: () => { throw Error('fresh must not choose a file'); } });
  expect(data).toBe(join(home, 'data'));
  const database = openDatabase(join(data, 'planner.db'));
  try { expect(database.prepare('SELECT COUNT(*) AS count FROM products').get()).toEqual({ count: 0 }); }
  finally { database.close(); }
  expect(await prepareProductionProfile({ ...input, installationId: 'install-1', chooseMode: () => { throw Error('unexpected prompt'); } })).toBe(data);
});

it('creates independent empty databases after reinstall without changing any old default database or settings', async () => {
  const { home, config, input } = fixture();
  const old = join(home, 'data');
  createHistoryFolder(old);
  writeFileSync(config, JSON.stringify({ dataDir: old, installationId: 'old-install' }));
  const fresh = { ...input, chooseMode: async () => 'fresh', chooseDatabase: () => { throw Error('fresh must not choose a file'); } };
  const first = await prepareProductionProfile({ ...fresh, installationId: 'reinstall-1' });
  const second = await prepareProductionProfile({ ...fresh, installationId: 'reinstall-2' });
  expect(first).not.toBe(old);
  expect(second).not.toBe(first);
  for (const data of [first, second]) {
    expect(data.startsWith(join(home, 'data-'))).toBe(true);
    const database = openDatabase(join(data, 'planner.db'));
    try { expect(database.prepare('SELECT COUNT(*) AS count FROM products').get()).toEqual({ count: 0 }); }
    finally { database.close(); }
  }
  expectOldPreserved(old);
  expect(JSON.parse(readFileSync(config, 'utf8'))).toEqual({ dataDir: second, installationId: 'reinstall-2' });
});

it('creates a separate empty database when an unconfigured default directory already exists', async () => {
  const { home, input } = fixture();
  const old = join(home, 'data');
  mkdirSync(old, { recursive: true });
  writeFileSync(join(old, 'planner.db'), 'unconfigured history');
  const data = await prepareProductionProfile({ ...input, chooseMode: async () => 'fresh', chooseDatabase: () => { throw Error('fresh must not choose a file'); } });
  expect(data).not.toBe(old);
  expect(readFileSync(join(old, 'planner.db'), 'utf8')).toBe('unconfigured history');
  expect(existsSync(join(data, 'planner.db'))).toBe(true);
});

it('cancels first startup without creating a profile directory', async () => {
  const { home, input } = fixture();
  expect(await prepareProductionProfile({ ...input, installationId: 'install-1', chooseMode: async () => 'cancel' })).toBeNull();
  expect(existsSync(home)).toBe(false);
});

it.each(['cancel', 'file-cancel', 'invalid', 'missing', 'initialization-failure', 'invalid-initialization', 'profile-write-failure'])(
  'preserves the previous profile marker and database on %s after reinstall, and asks again next time', async (failure) => {
    const { root, old, config, home, input } = fixture();
    await prepareProductionProfile({ ...input, installationId: 'install-1' });
    const previous = readFileSync(config);
    const invalid = join(root, 'invalid', 'planner.db');
    mkdirSync(join(root, 'invalid'));
    writeFileSync(invalid, 'not sqlite');
    const attempt = {
      ...input, installationId: 'install-2',
      chooseMode: async () => failure === 'cancel' ? 'cancel' : failure.includes('initialization') ? 'fresh' : 'existing',
      chooseDatabase: async () => failure === 'file-cancel' ? null : failure === 'invalid' ? invalid : failure === 'missing' ? join(root, 'missing', 'planner.db') : join(old, 'planner.db'),
      initializeDatabase: (file: string) => {
        if (failure === 'initialization-failure') throw Error('initialization failed');
        writeFileSync(file, 'invalid initialized database');
      },
    };
    if (failure === 'profile-write-failure') vi.spyOn(require('node:fs'), 'renameSync').mockImplementation(() => { throw Error('profile write failed'); });
    if (failure === 'cancel' || failure === 'file-cancel') expect(await prepareProductionProfile(attempt)).toBeNull();
    else await expect(prepareProductionProfile(attempt)).rejects.toThrow();
    vi.restoreAllMocks();
    expect(readFileSync(config)).toEqual(previous);
    expectOldPreserved(old);
    expect(readdirSync(home).filter(name => name.includes('.tmp'))).toEqual([]);
    let prompts = 0;
    expect(await prepareProductionProfile({ ...input, installationId: 'install-2', chooseMode: async () => { prompts++; return 'existing'; } })).toBe(old);
    expect(prompts).toBe(1);
  },
);

it('refuses an absent previously selected database without silently creating a replacement', async () => {
  const { old, config, input } = fixture();
  await prepareProductionProfile({ ...input, installationId: 'install-1' });
  rmSync(join(old, 'planner.db'));
  const previous = readFileSync(config);
  await expect(prepareProductionProfile({ ...input, installationId: 'install-1', chooseMode: () => { throw Error('unexpected prompt'); } })).rejects.toThrow('不会自动创建空库');
  expect(readFileSync(config)).toEqual(previous);
  expect(existsSync(join(old, 'planner.db'))).toBe(false);
});

it.each(['header-only', 'corrupt-contents', 'damaged-data-page'])(
  'rejects a database with valid SQLite magic but %s before saving the installation choice', async (corruption) => {
    const { root, old, config, input } = fixture();
    await prepareProductionProfile({ ...input, installationId: 'install-1' });
    const previous = readFileSync(config);
    const invalid = join(root, 'invalid');
    createHistoryFolder(invalid);
    const file = join(invalid, 'planner.db');
    let bytes = Buffer.from('SQLite format 3\0' + (corruption === 'corrupt-contents' ? 'corrupt contents' : ''));
    if (corruption === 'damaged-data-page') {
      bytes = readFileSync(file);
      // The history table lives on page 2; its b-tree page type must be 0x0d.
      bytes[4096] = 0x7f;
    }
    writeFileSync(file, bytes);
    const directoryBefore = readdirSync(invalid);
    await expect(prepareProductionProfile({ ...input, installationId: 'install-2', chooseDatabase: async () => file })).rejects.toThrow();
    expect(readFileSync(config)).toEqual(previous);
    expect(readFileSync(file)).toEqual(bytes);
    expect(readdirSync(invalid)).toEqual(directoryBefore);
    expectOldPreserved(old);
    let prompts = 0;
    expect(await prepareProductionProfile({ ...input, installationId: 'install-2', chooseMode: async () => { prompts++; return 'existing'; } })).toBe(old);
    expect(prompts).toBe(1);
  },
);

it.each([true, false])('production entry reads the installer marker outside resources/app (marker present: %s)', async (installed) => {
  const { root, old, input } = fixture();
  await prepareProductionProfile({ ...input, installationId: 'old-install' });
  const installRoot = join(root, 'installed-app');
  const appDirectory = join(installRoot, 'resources', 'app');
  mkdirSync(appDirectory, { recursive: true });
  if (installed) writeFileSync(join(installRoot, 'installation.id'), 'new-install\r\n');
  let prompts = 0;
  let reused: string | undefined;
  const errors: string[] = [];
  const electron = {
    app: {
      whenReady: async () => {},
      getPath: () => input.appData,
      quit: () => {},
      setPath: (_name: string, data: string) => { reused = data; throw Error('test stopped before loading main'); },
    },
    dialog: {
      showMessageBox: async () => { prompts++; return { response: 2 }; },
      showErrorBox: (_title: string, message: string) => { errors.push(message); },
    },
  };
  await runInNewContext(readFileSync(new URL('../../scripts/production-entry.cjs', import.meta.url), 'utf8'), {
    __dirname: appDirectory,
    console: { info: () => {}, error: () => {} },
    require: (name: string) => name === 'electron' ? electron : name === './production-profile.cjs' ? { prepareProductionProfile } : require(name),
  });
  expect(prompts).toBe(installed ? 1 : 0);
  expect(reused).toBe(installed ? undefined : old);
  expect(errors).toEqual(installed ? [] : ['test stopped before loading main']);
  expectOldPreserved(old);
});
