const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

/** Ask once per installation, then reuse the chosen database. Never reset old data. */
async function prepareProductionProfile({ appData, installationId, chooseMode, chooseDatabase, initializeDatabase, databaseSafety, forceSelection = false, beforeSwitch, verifyStartup, currentDataDir, confirmDatabase, activate, onProgress }) {
  const home = path.join(appData, 'DrawingNumberPlanner');
  const config = path.join(home, 'profile.json');
  const pending = path.join(home, 'profile-switch-pending.json');
  const restorePending = () => {
    if (!fs.existsSync(pending)) return;
    const previous = JSON.parse(fs.readFileSync(pending, 'utf8'));
    if (previous.exists) {
      const temporary = path.join(home, `.profile-restore-${randomUUID()}.tmp`);
      try { fs.writeFileSync(temporary, Buffer.from(previous.bytes, 'base64'), {flag:'wx'}); fs.renameSync(temporary, config); }
      finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
    } else if (fs.existsSync(config)) fs.unlinkSync(config);
    fs.unlinkSync(pending);
  };
  const rejectLink = file => {
    if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) {
      throw Error('数据配置不能使用链接，请选择原始数据库目录。');
    }
  };
  const validateDatabase = file => {
    rejectLink(file);
    if (!fs.existsSync(file)) throw Error('已选数据库不存在，请恢复原文件；不会自动创建空库。');
    const header = Buffer.alloc(16);
    const fd = fs.openSync(file, 'r');
    try { fs.readSync(fd, header, 0, 16, 0); }
    finally { fs.closeSync(fd); }
    if (header.toString('ascii') !== 'SQLite format 3\0') throw Error('所选文件不是有效的 SQLite 数据库。');
    return safety.validateProductionDatabase(file);
  };

  const safety = databaseSafety ?? require('./initialize-empty-acceptance.cjs');
  rejectLink(home);
  rejectLink(config);
  rejectLink(pending);
  restorePending();
  let saved;
  if (fs.existsSync(config)) {
    saved = JSON.parse(fs.readFileSync(config, 'utf8'));
    if (!saved || typeof saved.dataDir !== 'string' || !path.isAbsolute(saved.dataDir)) {
      throw Error('保存的数据目录无效，不会创建替代空库。');
    }
    // Portable packages have no installation marker and keep the stable profile.
    if (!forceSelection && (!installationId || saved.installationId === installationId)) {
      rejectLink(saved.dataDir);
      await onProgress?.('正在检查已保存的数据库');
      validateDatabase(path.join(saved.dataDir, 'planner.db'));
      return fs.realpathSync.native(saved.dataDir);
    }
  }

  const mode = await chooseMode();
  if (mode === 'cancel') return null;
  const protectCurrent = async () => {
    if (beforeSwitch) await beforeSwitch();
    const current = currentDataDir ?? saved?.dataDir;
    if (current) {
      rejectLink(current);
      rejectLink(path.join(current, 'planner.db'));
      // Missing/corrupt current databases cannot supply a verified backup.
      // Preserve the profile and let native recovery/reselection be retried.
      await onProgress?.('正在备份当前数据库');
      safety.backupProductionDatabase(current);
    }
  };
  let data;
  if (mode === 'existing') {
    let file = await chooseDatabase();
    if (!file) return null;
    rejectLink(file);
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'planner.db');
    if (path.basename(file).toLowerCase() !== 'planner.db') {
      throw Error('请选择旧版数据目录中的 planner.db，保留 settings.json 和 backups 等原文件。');
    }
    rejectLink(path.dirname(file));
    data = fs.realpathSync.native(path.dirname(file));
    // The service opens this fixed name. A case-insensitive basename check is
    // insufficient on a case-sensitive volume and must never select a new file.
    let selectedFile, runtimeFile;
    try {
      selectedFile = fs.realpathSync.native(file);
      runtimeFile = fs.realpathSync.native(path.join(data, 'planner.db'));
    } catch {
      throw Error('请选择数据目录中实际存在的 planner.db，不会创建替代空库。');
    }
    if (selectedFile !== runtimeFile) {
      throw Error('所选数据库与服务使用的 planner.db 不一致，不会创建替代空库。');
    }
    file = runtimeFile;
    await onProgress?.('正在检查旧数据库的完整性与兼容性');
    const summary = validateDatabase(file);
    if (confirmDatabase && !await confirmDatabase({path:file, ...summary})) return null;
    await protectCurrent();
    await onProgress?.('正在准备所选数据库');
    await safety.prepareExistingProductionDatabase(file);
  } else if (mode === 'fresh') {
    await protectCurrent();
    fs.mkdirSync(home, { recursive: true });
    const defaultData = path.join(home, 'data');
    rejectLink(defaultData);
    if (fs.existsSync(defaultData)) data = fs.mkdtempSync(path.join(home, 'data-'));
    else {
      fs.mkdirSync(defaultData);
      data = defaultData;
    }
    try {
      await initializeDatabase(path.join(data, 'planner.db'));
      validateDatabase(path.join(data, 'planner.db'));
    } catch (error) {
      fs.writeFileSync(path.join(data, 'first-start-error.txt'), String(error));
      throw error;
    }
  } else throw Error('数据目录选择无效');

  if (verifyStartup) await verifyStartup(data);
  fs.mkdirSync(home, { recursive: true });
  const next = { ...saved, dataDir: data };
  if (installationId) next.installationId = installationId;
  // Rename within one directory keeps the previous profile intact on write failure.
  const temporary = path.join(home, `.profile-${randomUUID()}.tmp`);
  if (activate) {
    const journal = path.join(home, `.profile-journal-${randomUUID()}.tmp`);
    try {
      fs.writeFileSync(journal, JSON.stringify({exists:fs.existsSync(config), bytes:fs.existsSync(config) ? fs.readFileSync(config).toString('base64') : ''}), {flag:'wx'});
      fs.renameSync(journal, pending);
    } finally { if (fs.existsSync(journal)) fs.unlinkSync(journal); }
  }
  try {
    fs.writeFileSync(temporary, JSON.stringify(next, null, 2), { flag: 'wx' });
    fs.renameSync(temporary, config);
    if (activate) await activate(data);
    if (activate) fs.unlinkSync(pending);
  } catch (error) {
    if (activate) restorePending();
    throw error;
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  return data;
}
module.exports = { prepareProductionProfile };
