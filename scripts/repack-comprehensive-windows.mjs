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
const dependencyBaseline = '8dc2112b596cebc045a121f6e5126c8059a6c4e0';
const baseRevision = '33cbbe15f86bf5ff18bd6900ffe3f1f18ea34354';
const baseInstallerSha256 = '0803cafaa91d28f79c9e0bfd0b51d7956cdd9b672ad9d076d157cb6dbd307f38';
const [sourceArg, baseArg, outputArg, installerArg] = process.argv.slice(2);
if (!sourceArg || !baseArg || !outputArg || !installerArg) throw Error('Expected pinned source, recovered stable package, NEW output and pinned base installer');
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
// This authorized release includes approved v16–v19 migrations; native verification checks the old-schema upgrade.
const mainSource=git('show',`${revision}:src/main/index.ts`);
for(const security of ['contextIsolation: true','nodeIntegration: false','sandbox: true','installRecoveryControls()'])if(!mainSource.includes(security))throw Error('Desktop security/recovery setting missing: '+security);
assertRendererIconDependencyOnly(git('show',`${dependencyBaseline}:package.json`),git('show',`${revision}:package.json`),git('show',`${dependencyBaseline}:pnpm-lock.yaml`),git('show',`${revision}:pnpm-lock.yaml`));
if (fs.existsSync(output) || inside(base, output) || inside(output, base) || inside(source,output) || inside(output,source)) throw Error('Output must be a new separate delivery directory');
if(hash(installerArg)!==baseInstallerSha256)throw Error('Published base installer SHA256 mismatch');
const originalVersion=JSON.parse(fs.readFileSync(path.join(base,'resources/app/acceptance-version.json'),'utf8'));
if(originalVersion.revision!==baseRevision||originalVersion.applicationVersion!=='1.2.0'||originalVersion.bundledSample!==false)throw Error('Only the verified v1.2.0 stable runtime may be reused');
if(!fs.existsSync(path.join(base,'图号规划器.exe')))throw Error('Verified stable Windows executable is missing');
const manifest=JSON.parse(fs.readFileSync(path.join(base,'delivery-manifest.json'),'utf8'));
if(manifest.revision!==baseRevision || manifest.platform!=='win32-x64')throw Error('Stable runtime manifest does not match');
const runtimeVerification=verifyManifest(base,manifest);
if(fs.existsSync(path.join(base,'resources/app/acceptance-seed')))throw Error('Stable base must not contain sample data');
const beforeBase=files(base);
// Reject links before copying the package, including runtime and native modules.
files(base);
fs.cpSync(base,output,{recursive:true});
const app=path.join(output,'resources/app');
const applicationVersion=JSON.parse(fs.readFileSync(path.join(source,'package.json'),'utf8')).version;
const packagedManifest=JSON.parse(fs.readFileSync(path.join(app,'package.json'),'utf8'));
packagedManifest.version=applicationVersion;
fs.writeFileSync(path.join(app,'package.json'),JSON.stringify(packagedManifest,null,2)+'\n');
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
fs.writeFileSync(path.join(app,'acceptance-version.json'),JSON.stringify({revision,applicationVersion,schemaVersion:23,profile:'stable-user-selected',bundledSample:false},null,2));
// The stable base already has the production executable name.
if(fs.existsSync(path.join(app,'acceptance-seed')))throw Error('Example data must not be included');
for(const entry of files(output))if(/\.(db|sqlite|sqlite3|pdf)(-wal|-shm)?$/i.test(entry.path))throw Error('Database/PDF data must not be bundled: '+entry.path);
if(JSON.stringify(beforeBase)!==JSON.stringify(files(base)))throw Error('Verified stable runtime must remain untouched');
const instructions=`图号规划器 Windows x64
版本：${applicationVersion}\n源码：${revision}

安装版为中文向导，允许自定义安装目录。每次安装或升级后首次启动时：
1. 升级用户先关闭旧版程序，选择旧数据目录中的 planner.db（可在旧版AppData数据目录找到）。
2. 程序保留原 settings.json 与磁盘PDF路径，升级前在原数据目录 backups 中建立迁移备份。失败会回滚事务，不会清空数据库。
3. 选择创建新数据库会自动建立独立空库，不要求选择文件；原库和资料保留。本包不含示例业务数据。
4. 每次成功安装后询问一次使用旧库或新库；普通重启使用上次选择。稳定配置保留在 AppData\\DrawingNumberPlanner\\profile.json，不按软件SHA创建空库。
5. 本版允许重复SKU/型号，以内部产品ID区分。产品默认外观仅用于新规划，不改旧图号。启动不归并产品；PDF可多选人工归纳并预览冲突，重扫保留确认。
6. 不删除原始PDF。普通删除保留原占号保护；独立强制释放需先查看影响并明确确认，历史身份及快照保留。请核对历史BOM、二维码、外发快照，必要时关闭程序，用backups中的迁移前planner.db备份替换原库；旧程序不应打开已升级的新库。
7. 安装目录仅存程序。卸载不会删除业务数据。

免安装版：完整解压到新目录，双击图号规划器.exe，不能只移动EXE。
`;
fs.writeFileSync(path.join(output,'先看这里-验收说明.txt'),instructions);
fs.writeFileSync(path.join(output,'验收说明.txt'),instructions);
fs.writeFileSync(path.join(output,'upgrade-profile-verification.json'),JSON.stringify({revision,baseRevision,sourceRun:40527223187,sourceRelease:'v1.2.0',sourceAsset:'DrawingNumberPlanner-1.2.0-Windows-x64-Setup.exe',baseInstallerSha256,runtimeVerification,stableProfile:true,schemaVersion:23,bundledSample:false,originalRuntimeUnchanged:JSON.stringify(beforeBase)===JSON.stringify(files(base)),note:'Verified runtime reused. Source includes approved migrations. Selected existing database is backed up and upgraded; never reset.'},null,2));
fs.writeFileSync(path.join(output,'delivery-manifest.json'),JSON.stringify({revision,platform:'win32-x64',baseRevision,files:files(output)},null,2));
verifyManifest(output,JSON.parse(fs.readFileSync(path.join(output,'delivery-manifest.json'),'utf8')));
console.log(JSON.stringify({revision,output,executable:path.join(output,'图号规划器.exe'),stableProfile:true,schemaVersion:23,bundledSample:false}));
