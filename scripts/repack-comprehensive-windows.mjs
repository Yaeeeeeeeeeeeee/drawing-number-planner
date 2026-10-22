// Delivery tooling only: reuse verified Windows runtime; omit all acceptance example data.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import {verifyManifest} from './comprehensive-delivery-integrity.mjs';
import { assertRendererIconDependencyOnly } from './p4-delivery-source-guard.ts';
const revision = process.env.PLANNER_ACCEPTANCE_REVISION ?? '';
if (!/^[0-9a-f]{40}$/.test(revision)) throw Error('Explicit pinned application SHA required');
const baseRevision = '8dc2112b596cebc045a121f6e5126c8059a6c4e0';
const [sourceArg, baseArg, outputArg] = process.argv.slice(2);
if (!sourceArg || !baseArg || !outputArg) throw Error('Expected pinned source, existing delivered P4 package, NEW output');
const source = fs.realpathSync.native(sourceArg), base = fs.realpathSync.native(baseArg), output = path.resolve(outputArg);
const git = (...args) => execFileSync('git', ['-C', source, ...args], {encoding:'utf8'}).trim();
const inside = (root, file) => { const rel = path.relative(root, file); return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel); };
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function files(root) {
  const result=[];
  function walk(dir) { for (const e of fs.readdirSync(dir, {withFileTypes:true})) { const p=path.join(dir,e.name); if(fs.lstatSync(p).isSymbolicLink())throw Error('Linked delivery paths are not accepted'); if(e.isDirectory())walk(p);else if(e.isFile())result.push({path:path.relative(root,p).split(path.sep).join('/'),sha256:hash(p)});else throw Error('Unexpected non-file in delivery'); } }
  walk(root); return result.sort((a,b)=>a.path.localeCompare(b.path));
}
if (git('rev-parse','HEAD') !== revision || git('status','--porcelain')) throw Error('Source must be clean and exactly pinned; no reset or overwrite');
// This authorized release includes additive v16/v17/v18 migrations; native verification checks the old-schema upgrade.
const mainSource=git('show',`${revision}:src/main/index.ts`);
for(const security of ['contextIsolation: true','nodeIntegration: false','sandbox: true','installRecoveryControls()'])if(!mainSource.includes(security))throw Error('Desktop security/recovery setting missing: '+security);
assertRendererIconDependencyOnly(git('show',`${baseRevision}:package.json`),git('show',`${revision}:package.json`),git('show',`${baseRevision}:pnpm-lock.yaml`),git('show',`${revision}:pnpm-lock.yaml`));
if (fs.existsSync(output) || inside(base, output) || inside(output, base) || inside(source,output) || inside(output,source)) throw Error('Output must be a new separate delivery directory');
const originalVersion=JSON.parse(fs.readFileSync(path.join(base,'resources/app/acceptance-version.json'),'utf8'));
if(originalVersion.revision!==baseRevision)throw Error('Only the explicitly identified existing P4 package may be reused');
if(!fs.existsSync(path.join(base,'图号规划器验收版.exe')))throw Error('Existing Windows executable is missing');
const manifest=JSON.parse(fs.readFileSync(path.join(base,'delivery-manifest.json'),'utf8'));
if(manifest.revision!==baseRevision || manifest.platform!=='win32-x64')throw Error('Existing runtime manifest does not match');
const runtimeVerification=verifyManifest(base,manifest,{allowOriginalReports:true});
const oldSeed=path.join(base,'resources/app/acceptance-seed');
const beforeSeed=files(oldSeed);
const workspace=path.resolve(oldSeed,originalVersion.workspace);
if(!inside(oldSeed,workspace)||!fs.statSync(workspace).isDirectory())throw Error('Existing sample workspace must remain isolated');
// Reject links before copying the package, including runtime and native modules.
files(base);
fs.cpSync(base,output,{recursive:true,filter:entry=>{const relative=path.relative(base,entry).split(path.sep).join('/');return relative!=='resources/app/acceptance-seed'&&!relative.startsWith('resources/app/acceptance-seed/');}});
const app=path.join(output,'resources/app');
for(const name of ['Windows-smoke-outcome.txt','windows-verification.json','Windows启动烟测.png','Windows-P4文件详情.png','Windows-P4图号详情.png','delivery-manifest.json','sample-reuse-verification.json'])fs.rmSync(path.join(output,name),{force:true});
const dep=createRequire(path.join(source,'package.json'));
const {build}=dep('esbuild');
const banner="import {createRequire as __packageRequire} from 'node:module'; const require=__packageRequire(import.meta.url);";
for(const entry of ['main','service'])await build({entryPoints:[path.join(source,'src',entry,entry==='main'?'index.ts':'entry.ts')],outfile:path.join(app,'dist',entry,entry==='main'?'index.js':'entry.js'),bundle:true,platform:'node',format:'esm',target:'node24',external:['electron','better-sqlite3'],nodePaths:[path.join(source,'node_modules')],banner:{js:banner},logLevel:'warning'});
await build({entryPoints:[path.join(source,'scripts/initialize-empty-acceptance.ts')],outfile:path.join(app,'initialize-empty-acceptance.cjs'),bundle:true,platform:'node',format:'cjs',target:'node24',external:['better-sqlite3'],nodePaths:[path.join(source,'node_modules')],logLevel:'warning'});
fs.rmSync(path.join(app,'dist/renderer'),{recursive:true,force:true});
fs.cpSync(path.join(source,'dist/renderer'),path.join(app,'dist/renderer'),{recursive:true});
fs.copyFileSync(path.join(source,'dist/main/preload.cjs'),path.join(app,'dist/main/preload.cjs'));
fs.copyFileSync(path.join(source,'scripts/production-entry.cjs'),path.join(app,'acceptance-entry.cjs'));
fs.copyFileSync(path.join(source,'scripts/production-profile.cjs'),path.join(app,'production-profile.cjs'));
fs.writeFileSync(path.join(app,'acceptance-version.json'),JSON.stringify({revision,schemaVersion:18,profile:'stable-user-selected',bundledSample:false},null,2));
fs.renameSync(path.join(output,'图号规划器验收版.exe'),path.join(output,'图号规划器.exe'));
if(fs.existsSync(path.join(app,'acceptance-seed')))throw Error('Example data must not be included');
for(const entry of files(output))if(/\.(db|sqlite|sqlite3|pdf)(-wal|-shm)?$/i.test(entry.path))throw Error('Database/PDF data must not be bundled: '+entry.path);
if(JSON.stringify(beforeSeed)!==JSON.stringify(files(oldSeed)))throw Error('Original package sample must remain untouched');
const instructions=`图号规划器 Windows x64
版本：${revision}

安装版为中文向导，允许自定义安装目录。首次启动时：
1. 升级用户先关闭旧版程序，选择旧数据目录中的 planner.db（可在旧版AppData数据目录找到）。
2. 程序保留原 settings.json 与磁盘PDF路径，升级前在原数据目录 backups 中建立迁移备份。失败会回滚事务，不会清空数据库。
3. 新用户选择创建空数据库；本安装包不含示例产品、图号、PDF、BOM或二维码。
4. 后续版本使用稳定配置 AppData\\DrawingNumberPlanner\\profile.json，保留已选择目录，不按软件SHA创建新空库。
5. ZC100产品归并需要本人在产品档案手工预览并确认，启动不会自动执行。批次归属不明确的历史资料也需人工确认。
6. 不删除原始PDF，不改变历史占号。请核对历史BOM、二维码、外发快照，必要时关闭程序，用backups中的迁移前planner.db备份替换原库；旧程序不应打开已升级的新库。
7. 安装目录仅存程序。卸载不会删除业务数据。

免安装版：完整解压到新目录，双击图号规划器.exe，不能只移动EXE。
`;
fs.writeFileSync(path.join(output,'先看这里-验收说明.txt'),instructions);
fs.writeFileSync(path.join(output,'验收说明.txt'),instructions);
fs.writeFileSync(path.join(output,'upgrade-profile-verification.json'),JSON.stringify({revision,baseRevision,sourceRun:38697339387,sourceArtifact:'P4-Windows-x64-8dc2112',runtimeVerification,stableProfile:true,schemaVersion:18,bundledSample:false,originalSampleUnchanged:JSON.stringify(beforeSeed)===JSON.stringify(files(oldSeed)),note:'Verified runtime reused. Source includes approved migrations. Selected existing database is backed up and upgraded; never reset.'},null,2));
fs.writeFileSync(path.join(output,'delivery-manifest.json'),JSON.stringify({revision,platform:'win32-x64',baseRevision,files:files(output)},null,2));
verifyManifest(output,JSON.parse(fs.readFileSync(path.join(output,'delivery-manifest.json'),'utf8')));
console.log(JSON.stringify({revision,output,executable:path.join(output,'图号规划器.exe'),stableProfile:true,schemaVersion:18,bundledSample:false}));
