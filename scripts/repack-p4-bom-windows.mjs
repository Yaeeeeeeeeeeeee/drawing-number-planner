// Delivery tooling only: preserve an already delivered sample and Windows runtime.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
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
git('diff','--quiet',baseRevision,revision,'--','package.json','pnpm-lock.yaml','src/db','src/main');
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
fs.cpSync(base,output,{recursive:true});
const app=path.join(output,'resources/app');
for(const name of ['Windows-smoke-outcome.txt','windows-verification.json','Windows启动烟测.png','Windows-P4文件详情.png','Windows-P4图号详情.png','delivery-manifest.json'])fs.rmSync(path.join(output,name),{force:true});
const dep=createRequire(path.join(source,'package.json'));
const {build}=dep('esbuild');
const banner="import {createRequire as __packageRequire} from 'node:module'; const require=__packageRequire(import.meta.url);";
for(const entry of ['main','service'])await build({entryPoints:[path.join(source,'src',entry,entry==='main'?'index.ts':'entry.ts')],outfile:path.join(app,'dist',entry,entry==='main'?'index.js':'entry.js'),bundle:true,platform:'node',format:'esm',target:'node24',external:['electron','better-sqlite3'],nodePaths:[path.join(source,'node_modules')],banner:{js:banner},logLevel:'warning'});
fs.rmSync(path.join(app,'dist/renderer'),{recursive:true,force:true});
fs.cpSync(path.join(source,'dist/renderer'),path.join(app,'dist/renderer'),{recursive:true});
fs.copyFileSync(path.join(source,'dist/main/preload.cjs'),path.join(app,'dist/main/preload.cjs'));
const title='图号规划器 P4 BOM 验收版 · '+revision.slice(0,7);
const entry=fs.readFileSync(path.join(source,'scripts/acceptance-entry.cjs'),'utf8').replace('const version=',`app.on('browser-window-created', (_event, window) => {\n window.on('page-title-updated', event => { event.preventDefault(); window.setTitle(${JSON.stringify(title)}); });\n window.once('ready-to-show', () => window.setTitle(${JSON.stringify(title)}));\n});\nconst version=`);
fs.writeFileSync(path.join(app,'acceptance-entry.cjs'),entry);
fs.writeFileSync(path.join(app,'acceptance-version.json'),JSON.stringify({revision,workspace:originalVersion.workspace},null,2));
const afterSeed=files(path.join(app,'acceptance-seed'));
if(JSON.stringify(beforeSeed)!==JSON.stringify(afterSeed)||JSON.stringify(beforeSeed)!==JSON.stringify(files(oldSeed)))throw Error('Existing sample changed; refusing delivery');
const instructions=`P4 BOM Windows x64 免安装测试包\r\n应用版本：${revision}\r\n\r\n1. 关闭旧测试版，完整解压到新文件夹，不覆盖正式版或旧测试目录。\r\n2. 双击 图号规划器验收版.exe，不需要Git、Node或开发服务器。不能只移动exe。\r\n3. 标题应为 ${title}。进入 BOM管理 → 查询BOM → 查看 2026-09-28 的记录。\r\n4. 记下记录数、业务日期和原提交时间，编辑一个项目并保存，核对记录数不增加、内容更新、原日期/提交时间不变。点击当前编辑标签不得转成新增。再核对批次只显名称、BOM详情无复制按钮、无二维码关联行，以及最大化/缩小布局。\r\n\r\n数据说明：复用旧P4交付中的原有隔离样例，未新增/复制业务记录制造效果。原样例仅有一版BOM，因此新增/删除/修改差异无法用此样例完整验收，不把首条记录冒充多版本对照。\r\n本包不打开正式数据库；首次复制原有隔离样例到AppData\\DrawingNumberPlannerAcceptance\\${revision.slice(0,7)}。旧测试版、正式版及旧数据不覆盖。可以编辑本包专属运行目录内的隔离样例进行验收；不要选择正式数据库或正式资料目录，不扫描、清理、删除或打包。修复不会自动删除用户已有重复记录。\r\n本包为未签名目录包，不是安装器或正式发布。WindowsCI结果见 windows-verification.json，不代表Windows系统DPI/跨屏及真实业务数据验收。\r\n如浏览器拦截下载，不关闭安全防护；请提供拦截详情以核对。\r\n`;
fs.writeFileSync(path.join(output,'先看这里-验收说明.txt'),instructions);
fs.writeFileSync(path.join(output,'验收说明.txt'),instructions);
fs.writeFileSync(path.join(output,'sample-reuse-verification.json'),JSON.stringify({revision,baseRevision,sourceRun:38697339387,sourceArtifact:11955251774,unchanged:true,files:afterSeed,note:'Unmodified pre-existing isolated sample. No new records or synthetic density; one BOM version only.'},null,2));
fs.writeFileSync(path.join(output,'delivery-manifest.json'),JSON.stringify({revision,platform:'win32-x64',baseRevision,files:files(output)},null,2));
console.log(JSON.stringify({revision,output,executable:path.join(output,'图号规划器验收版.exe'),sampleUnchanged:true}));
