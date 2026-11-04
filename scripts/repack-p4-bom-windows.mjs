// Delivery tooling only: reuse verified Windows runtime; omit all acceptance example data.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { assertDesktopLayoutOnly, assertRendererIconDependencyOnly } from './p4-delivery-source-guard.ts';
const revision = process.env.PLANNER_ACCEPTANCE_REVISION ?? 'd4a6359c26f6dd8534c99d1b4d0328ca1a2d9dd5';
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
git('diff','--quiet',baseRevision,revision,'--','src/db');
assertRendererIconDependencyOnly(git('show',`${baseRevision}:package.json`),git('show',`${revision}:package.json`),git('show',`${baseRevision}:pnpm-lock.yaml`),git('show',`${revision}:pnpm-lock.yaml`));
const desktopChanges=git('diff','--name-only',baseRevision,revision,'--','src/main').split('\n').filter(Boolean);
if(desktopChanges.some(file=>file!=='src/main/index.ts'))throw Error('Unexpected desktop module change');
assertDesktopLayoutOnly(git('show',`${baseRevision}:src/main/index.ts`),git('show',`${revision}:src/main/index.ts`));
if (fs.existsSync(output) || inside(base, output) || inside(output, base) || inside(source,output) || inside(output,source)) throw Error('Output must be a new separate delivery directory');
const originalVersion=JSON.parse(fs.readFileSync(path.join(base,'resources/app/acceptance-version.json'),'utf8'));
if(originalVersion.revision!==baseRevision)throw Error('Only the explicitly identified existing P4 package may be reused');
if(!fs.existsSync(path.join(base,'图号规划器验收版.exe')))throw Error('Existing Windows executable is missing');
const manifest=JSON.parse(fs.readFileSync(path.join(base,'delivery-manifest.json'),'utf8'));
if(manifest.revision!==baseRevision || manifest.platform!=='win32-x64')throw Error('Existing runtime manifest does not match');
for(const entry of manifest.files){const p=path.resolve(base,entry.path);if(!inside(base,p)||hash(p)!==entry.sha256)throw Error('Existing package manifest check failed: '+entry.path);}
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
const title='图号规划器 P4 整合验收版 · '+revision.slice(0,7);
const entry=fs.readFileSync(path.join(source,'scripts/acceptance-entry.cjs'),'utf8').replace('const version=',`app.on('browser-window-created', (_event, window) => {\n window.on('page-title-updated', event => { event.preventDefault(); window.setTitle(${JSON.stringify(title)}); });\n window.once('ready-to-show', () => window.setTitle(${JSON.stringify(title)}));\n});\nconst version=`);
fs.writeFileSync(path.join(app,'acceptance-entry.cjs'),entry);
fs.copyFileSync(path.join(source,'scripts/prepare-acceptance-data.cjs'),path.join(app,'prepare-acceptance-data.cjs'));
fs.writeFileSync(path.join(app,'acceptance-version.json'),JSON.stringify({revision,emptyStart:true},null,2));
if(fs.existsSync(path.join(app,'acceptance-seed')))throw Error('Example data must not be included');
if(JSON.stringify(beforeSeed)!==JSON.stringify(files(oldSeed)))throw Error('Original package sample must remain untouched');
const instructions=`P4 Windows x64 整合验收包
版本：${revision}

完整解压到新文件夹，双击 图号规划器验收版.exe。无需Git、Node或开发服务器；保留整个目录，不能仅移动exe。

验收范围：
1. BOM管理→查询BOM：编辑原记录，确认总数、原业务日期/提交时间不变，修改正确保存；详情无复制按钮/二维码关联行，批次仅显名称。
2. 产品档案：八列紧凑表格，资料状态跳转对应产品/用途，返回保留筛选，编辑中保留原管理能力。
3. 图号库：产品与批次导航、实际使用范围、回收站；点击图号查看紧凑抽屉，管理图号在同抽屉编辑，取消暂存PDF不写入。历史批次不以当前文件替代；未记录版本不伪造。
4. 外发资料：邮件配置的模板/签名/联系人互斥列表，新建/编辑/保存/取消；未保存切换拒绝/确认；返回工作台刷新选择项且保留手工邮件。原文件核对、打包、命名及历史规则不变。
5. 4K最大化/普通/窄窗口核对，无重叠、不可达按钮或整页溢出；物理Windows系统DPI/跨屏需本机人工核对。

本包不包含示例数据库、样例产品、图号、BOM或PDF。首次启动由现有迁移创建空业务库，并清除新库内预设的示例邮件模板和个人签名；仅保留二维码用途等系统定义，请从无业务数据界面开始使用。
首次建立AppData\\DrawingNumberPlannerAcceptance\\${revision.slice(0,7)}隔离目录；不导入旧版样例，不打开正式数据库，不覆盖旧版数据。再次启动保留你已创建的内容，不会自动清空。卸载或更换安装路径不删除个人业务数据和磁盘PDF。
安装版为中文向导，可在“选择目标位置”中指定安装路径；免安装版须保留完整目录。本包未签名，是候选验收版，不是正式发布。自动化报告与Windows截图在包内；不代表真实业务数据或物理4K/DPI人工验收完成。
`;
fs.writeFileSync(path.join(output,'先看这里-验收说明.txt'),instructions);
fs.writeFileSync(path.join(output,'验收说明.txt'),instructions);
fs.writeFileSync(path.join(output,'empty-start-verification.json'),JSON.stringify({revision,baseRevision,sourceRun:38697339387,sourceArtifact:11955251774,emptyStart:true,bundledSample:false,originalSampleUnchanged:JSON.stringify(beforeSeed)===JSON.stringify(files(oldSeed)),note:'Only verified Windows runtime reused. No acceptance seed is delivered; existing per-version data is never reset.'},null,2));
fs.writeFileSync(path.join(output,'delivery-manifest.json'),JSON.stringify({revision,platform:'win32-x64',baseRevision,files:files(output)},null,2));
console.log(JSON.stringify({revision,output,executable:path.join(output,'图号规划器验收版.exe'),emptyStart:true,bundledSample:false}));
