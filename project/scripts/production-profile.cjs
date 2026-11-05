const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

/** Ask once per installation, then reuse the chosen database. Never reset old data. */
async function prepareProductionProfile({ appData, installationId, chooseMode, chooseDatabase, initializeDatabase }) {
  const home = path.join(appData, 'DrawingNumberPlanner');
  const config = path.join(home, 'profile.json');
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
    // A retained signature alone does not prove a usable database. Read the
    // schema/pages without migrating or writing the selected database.
    let database;
    try {
      const Database = require('better-sqlite3');
      database = new Database(file, { readonly: true, fileMustExist: true });
      const result = database.pragma('quick_check', { simple: true });
      if (result !== 'ok') throw Error(String(result));
    } catch (error) {
      throw Error(`所选数据库无法读取或已损坏：${error.message}。不会修改原文件。`);
    } finally {
      if (database) database.close();
    }
  };

  rejectLink(home);
  rejectLink(config);
  let saved;
  if (fs.existsSync(config)) {
    saved = JSON.parse(fs.readFileSync(config, 'utf8'));
    if (!saved || typeof saved.dataDir !== 'string' || !path.isAbsolute(saved.dataDir)) {
      throw Error('保存的数据目录无效，不会创建替代空库。');
    }
    // Portable packages have no installation marker and keep the stable profile.
    if (!installationId || saved.installationId === installationId) {
      rejectLink(saved.dataDir);
      validateDatabase(path.join(saved.dataDir, 'planner.db'));
      return fs.realpathSync.native(saved.dataDir);
    }
  }

  const mode = await chooseMode();
  if (mode === 'cancel') return null;
  let data;
  if (mode === 'existing') {
    const file = await chooseDatabase();
    if (!file) return null;
    if (path.basename(file).toLowerCase() !== 'planner.db') {
      throw Error('请选择旧版数据目录中的 planner.db，保留 settings.json 和 backups 等原文件。');
    }
    rejectLink(path.dirname(file));
    validateDatabase(file);
    data = fs.realpathSync.native(path.dirname(file));
  } else if (mode === 'fresh') {
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

  fs.mkdirSync(home, { recursive: true });
  const next = { ...saved, dataDir: data };
  if (installationId) next.installationId = installationId;
  // Rename within one directory keeps the previous profile intact on write failure.
  const temporary = path.join(home, `.profile-${randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporary, JSON.stringify(next, null, 2), { flag: 'wx' });
    fs.renameSync(temporary, config);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  return data;
}
module.exports = { prepareProductionProfile };
