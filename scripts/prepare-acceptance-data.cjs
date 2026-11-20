// Delivery bootstrap only. Never resets an existing version's business data.
const fs = require('node:fs');
const path = require('node:path');

function prepareAcceptanceData({ appData, appDirectory, version, initializeDatabase }) {
 if (!/^[0-9a-f]{40}$/.test(version.revision)) throw Error('验收版本标识无效。');
 const base = path.join(appData, 'DrawingNumberPlannerAcceptance');
 const data = path.join(base, version.revision.slice(0, 7));
 const marker = path.join(data, '.acceptance-version');
 const inside = (root, target) => { const relative = path.relative(root, path.resolve(target)); return !relative.startsWith('..') && !path.isAbsolute(relative); };
 for (const directory of [base, data]) if (fs.existsSync(directory) && fs.lstatSync(directory).isSymbolicLink()) throw Error('验收目录不能是链接，不会访问链接目标。');
 if (fs.existsSync(data) && (!fs.existsSync(marker) || fs.lstatSync(marker).isSymbolicLink() || fs.readFileSync(marker, 'utf8') !== version.revision)) throw Error('验收目录缺少对应版本标记，不会覆盖现有目录。');
 if (!fs.existsSync(data)) {
  fs.mkdirSync(base, { recursive: true });
  if (version.emptyStart === true) {
   // Fresh release has no bundled database or material files. Use the existing
   // migrations exactly once and remove only the new DB's demonstration mail rows.
   fs.mkdirSync(data);
   const workspace = path.join(data, 'materials');
   const outbound = path.join(data, 'outbound');
   fs.mkdirSync(workspace); fs.mkdirSync(outbound);
   fs.writeFileSync(path.join(data, 'settings.json'), JSON.stringify({ workspaceRoot: workspace, outboundOutputRoot: outbound }));
   const initialize = initializeDatabase ?? require('./initialize-empty-acceptance.cjs').initializeEmptyAcceptanceDatabase;
   try { initialize(path.join(data, 'planner.db')); }
   catch (error) {
    // Keep the failed new directory for diagnosis; never reset it on retry.
    fs.writeFileSync(path.join(data, 'first-start-error.txt'), String(error.stack || error));
    throw error;
   }
  } else {
   fs.cpSync(path.join(appDirectory, 'acceptance-seed'), data, { recursive: true });
   const settings = JSON.parse(fs.readFileSync(path.join(data, 'settings.json'), 'utf8'));
   const workspace = path.resolve(data, version.workspace);
   if (!inside(data, workspace)) throw Error('样例资料目录超出验收范围。');
   settings.workspaceRoot = workspace; settings.outboundOutputRoot = path.join(data, 'outbound');
   fs.mkdirSync(settings.outboundOutputRoot, { recursive: true });
   fs.writeFileSync(path.join(data, 'settings.json'), JSON.stringify(settings));
  }
  fs.writeFileSync(marker, version.revision);
 }
 const resolved = fs.realpathSync.native(data);
 const settingsPath = path.join(data, 'settings.json');
 if (fs.lstatSync(settingsPath).isSymbolicLink()) throw Error('验收配置不能是链接。');
 const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
 for (const key of ['workspaceRoot', 'outboundOutputRoot']) if (settings[key] && (!fs.existsSync(settings[key]) || !inside(resolved, fs.realpathSync.native(settings[key])))) throw Error('验收资料或输出目录超出隔离范围或已不存在，请恢复为验收目录后再启动。');
 return resolved;
}

module.exports = { prepareAcceptanceData };
