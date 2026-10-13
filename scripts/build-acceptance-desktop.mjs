import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
if(process.argv.length!==5)throw Error('Expected verified source, isolated sample, new output directory');
const [sourceArg,sampleArg,output]=process.argv.slice(2).map(value=>path.resolve(value));
const verifiedSource=fs.realpathSync.native(sourceArg);
const sample=fs.realpathSync.native(sampleArg);
const project=process.cwd();
const git=(root)=>execFileSync('git',['-c',`safe.directory=${root}`,'-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
const revision=git(verifiedSource);
execFileSync('git',['-c',`safe.directory=${project}`,'-C',project,'merge-base','--is-ancestor',revision,'HEAD']);
execFileSync('git',['-c',`safe.directory=${project}`,'-C',project,'diff','--quiet',revision,'--','src','package.json','pnpm-lock.yaml','vite.config.ts','tsconfig.json','tsconfig.main.json']);
execFileSync('git',['-c',`safe.directory=${verifiedSource}`,'-C',verifiedSource,'diff','--quiet','HEAD','--','src','package.json','pnpm-lock.yaml','vite.config.ts','tsconfig.json','tsconfig.main.json']);
if(fs.existsSync(output))throw Error('Refusing to overwrite a desktop delivery');
if(!path.basename(sample).startsWith('planner-second-acceptance-preview-'))throw Error('Only an isolated preview sample is accepted');
const sourceSettings=JSON.parse(fs.readFileSync(path.join(sample,'settings.json'),'utf8'));
const rejectLinks=dir=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(fs.lstatSync(file).isSymbolicLink())throw Error('Linked sample paths are not accepted');if(entry.isDirectory())rejectLinks(file);}};
rejectLinks(sample);
const relativeWorkspace=path.relative(sample,fs.realpathSync.native(sourceSettings.workspaceRoot));
if(relativeWorkspace.startsWith('..')||path.isAbsolute(relativeWorkspace))throw Error('Sample workspace is outside isolated data');
const dep=createRequire(path.join(verifiedSource,'package.json'));
const {build}=dep('esbuild');
const runtime=path.dirname(dep('electron'));
fs.cpSync(runtime,output,{recursive:true});
fs.renameSync(path.join(output,'resources','default_app.asar'),path.join(output,'resources','default_app.asar.disabled'));
const app=path.join(output,'resources','app');fs.mkdirSync(app,{recursive:true});
const banner="import {createRequire as __packageRequire} from 'node:module'; const require=__packageRequire(import.meta.url);";
for(const entry of ['main','service'])await build({
 entryPoints:[path.join(project,'src',entry,entry==='main'?'index.ts':'entry.ts')],
 outfile:path.join(app,'dist',entry,entry==='main'?'index.js':'entry.js'),
 bundle:true,platform:'node',format:'esm',target:'node24',external:['electron','better-sqlite3'],
 nodePaths:[path.join(verifiedSource,'node_modules')],banner:{js:banner},logLevel:'warning',
});
fs.cpSync(path.join(verifiedSource,'dist','renderer'),path.join(app,'dist','renderer'),{recursive:true});
fs.copyFileSync(path.join(verifiedSource,'dist','main','preload.cjs'),path.join(app,'dist','main','preload.cjs'));
const sqlite=path.dirname(dep.resolve('better-sqlite3/package.json'));
const sqliteTarget=path.join(app,'node_modules','better-sqlite3');
fs.cpSync(sqlite,sqliteTarget,{recursive:true,filter:file=>!path.relative(sqlite,file).split(path.sep).includes('node_modules')});
const seed=path.join(app,'acceptance-seed');fs.cpSync(sample,seed,{recursive:true});
fs.writeFileSync(path.join(seed,'settings.json'),JSON.stringify({...sourceSettings,workspaceRoot:relativeWorkspace,outboundOutputRoot:'outbound'},null,2));
fs.writeFileSync(path.join(app,'package.json'),JSON.stringify({name:'drawing-planner-acceptance',version:'0.1.0',type:'module',main:'acceptance-entry.cjs'},null,2));
fs.copyFileSync(path.join(project,'scripts','acceptance-entry.cjs'),path.join(app,'acceptance-entry.cjs'));
fs.writeFileSync(path.join(app,'acceptance-version.json'),JSON.stringify({revision,workspace:relativeWorkspace},null,2));
fs.renameSync(path.join(output,'electron.exe'),path.join(output,'图号规划器验收版.exe'));
fs.writeFileSync(path.join(output,'验收说明.txt'),`图号规划器桌面验收版\r\n版本：${revision}\r\n双击“图号规划器验收版.exe”。不需要安装 Node 或连接开发服务器。\r\n首次运行复制隔离样例到 Windows 本地应用数据下 DrawingNumberPlannerAcceptance；后续保留验收操作。不会打开正式数据库。\r\n请勿把资料根目录或输出目录切换到正式资料。\r\n已知：7项旧Mock测试失败；完整恢复应用最终效果仍待验收；本版不是正式发布验收完成。\r\n保留整个目录，不能单独移动exe。\r\n`);
console.log(JSON.stringify({revision,executable:path.join(output,'图号规划器验收版.exe'),directory:output}));
