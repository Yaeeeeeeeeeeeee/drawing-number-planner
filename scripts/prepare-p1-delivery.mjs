// Delivery tooling only. Builds an explicitly pinned source; P1 remains the default.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
const revision=process.env.PLANNER_ACCEPTANCE_REVISION ?? '7d9e7b74ee1222c9b789946dd69d94f89704bfe7';
const phase=process.env.PLANNER_ACCEPTANCE_PHASE ?? 'P1';
if(!/^[0-9a-f]{40}$/.test(revision)||!['P1','P2'].includes(phase))throw Error('Explicit full SHA and P1/P2 phase required');
const [sourceArg, outputArg]=process.argv.slice(2);
if(!sourceArg||!outputArg)throw Error('Usage: node prepare-p1-delivery.mjs <clean pinned source> <new output>');
const source=fs.realpathSync.native(sourceArg), output=path.resolve(outputArg);
const git=(...args)=>execFileSync('git',['-C',source,...args],{encoding:'utf8'}).trim();
if(git('rev-parse','HEAD')!==revision)throw Error('Refusing a source other than the pinned revision '+revision);
if(git('status','--porcelain'))throw Error('Source must be clean; no files will be reset or overwritten');
if(fs.existsSync(output))throw Error('Refusing to overwrite an existing delivery directory');
const sample=await new Promise((resolve,reject)=>{
 const child=spawn(process.execPath,['--import','tsx','scripts/preview-second-acceptance.ts'],{cwd:source,stdio:['ignore','pipe','pipe']});
 let pending='',data=null,errorOutput='';
 const timer=setTimeout(()=>{child.kill();reject(Error('Isolated sample setup timed out'));},60000);
 child.stderr.on('data',chunk=>{errorOutput+=chunk.toString();});
 child.stdout.on('data',chunk=>{
  pending+=chunk.toString();let index;
  while((index=pending.indexOf('\n'))>=0){const line=pending.slice(0,index);pending=pending.slice(index+1);
   try{const value=JSON.parse(line);if(value.dataDir){data=value.dataDir;child.kill('SIGTERM');}}catch{}
  }
 });
 child.on('error',error=>{clearTimeout(timer);reject(error);});
 child.on('exit',()=>{clearTimeout(timer);if(data)resolve(data);else reject(Error(errorOutput||'No isolated sample produced'));});
});
const actualSample=fs.realpathSync.native(sample),relative=path.relative(fs.realpathSync.native(os.tmpdir()),actualSample);
if(relative.startsWith('..')||path.isAbsolute(relative)||!path.basename(actualSample).startsWith('planner-second-acceptance-preview-'))throw Error('Not an isolated sample');
// Windows SIGTERM may stop without handlers. Read/checkpoint the owned sample before copying.
const {createRequire}=await import('node:module');const dep=createRequire(path.join(source,'package.json'));
const Database=dep('better-sqlite3');const db=new Database(path.join(actualSample,'planner.db'));
if(db.pragma('integrity_check',{simple:true})!=='ok')throw Error('Isolated sample integrity check failed');
db.pragma('wal_checkpoint(TRUNCATE)');db.close();
execFileSync(process.execPath,[path.join(source,'scripts/build-acceptance-desktop.mjs'),source,actualSample,output],{cwd:source,stdio:'inherit'});
const app=path.join(output,'resources','app');
// Visible identity is confined to the acceptance bootstrap, not production Main code.
const entry=path.join(app,'acceptance-entry.cjs');
const title=`图号规划器 ${phase} 验收版 · ${revision.slice(0,7)}`;
fs.writeFileSync(entry,fs.readFileSync(entry,'utf8').replace("const version=",`app.on('browser-window-created', (_event, window) => {\n window.on('page-title-updated', event => { event.preventDefault(); window.setTitle(${JSON.stringify(title)}); });\n window.once('ready-to-show', () => window.setTitle(${JSON.stringify(title)}));\n});\nconst version=`));
fs.writeFileSync(path.join(output,'验收说明.txt'),`${phase} Windows x64 独立验收目录包\r\n源提交：${revision}\r\n双击图号规划器验收版.exe，保留整个目录。首次启动使用隔离样例；数据位于系统appData下DrawingNumberPlannerAcceptance/${revision.slice(0,7)}，与旧8bd386a隔离。\r\n启动前关闭旧验收实例以释放4317端口，不结束未知进程。不要切换到正式数据库或资料目录。\r\n标题应显示${phase}验收版及${revision.slice(0,7)}；resources/app/acceptance-version.json和隔离目录.acceptance-version必须匹配完整源提交。\r\n验收失败：关闭当前验收版，重新打开保留的旧版本目录。不要把当前验收数据库交给旧版，不reset、不覆盖、不清理正式数据。\r\n这是未签名目录包，不是安装器或最终发布。Windows运行验证以同目录windows-verification.json为准，缺少该文件表示尚未完成Windows启动烟测。完整DPI和跨屏人工验收另行进行。\r\n`);
const crypto=await import('node:crypto');const files=[];
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else files.push({path:path.relative(output,file).split(path.sep).join('/'),sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')});}}
walk(output);fs.writeFileSync(path.join(output,'delivery-manifest.json'),JSON.stringify({revision,electron:dep('electron/package.json').version,sqlite:dep('better-sqlite3/package.json').version,platform:'win32-x64',files},null,2));
console.log(JSON.stringify({revision,output,sample:actualSample,note:'Windows runtime verification is a separate step'}));
