// Windows Electron acceptance smoke using only the package's existing isolated sample.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createRequire}=require('node:module');
const {DatabaseSync}=require('node:sqlite');
const revision=process.env.PLANNER_ACCEPTANCE_REVISION??'d4a6359c26f6dd8534c99d1b4d0328ca1a2d9dd5';
if(!/^[0-9a-f]{40}$/.test(revision))throw Error('Explicit pinned revision required');
const [sourceArg,executableArg]=process.argv.slice(2);
const source=path.resolve(sourceArg),executable=path.resolve(executableArg),directory=path.dirname(executable);
const dep=createRequire(path.join(source,'package.json'));const {_electron}=dep('@playwright/test');
function snapshot(file){const db=new DatabaseSync(file,{readOnly:true});try{const tables={};for(const {name} of db.prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name").all()){const rows=db.prepare(`select * from "${name.replaceAll('"','""')}" order by rowid`).all();tables[name]={count:rows.length,sha256:crypto.createHash('sha256').update(rows.map(r=>JSON.stringify(r)+'\n').join('')).digest('hex')};}return tables;}finally{db.close();}}
const seedFile=path.join(directory,'resources/app/acceptance-seed/planner.db');const before=snapshot(seedFile);
(async()=>{const app=await _electron.launch({executablePath:executable,timeout:45000});try{
 const page=await app.firstWindow();await page.getByRole('heading',{name:'图号规划',exact:true}).waitFor({timeout:30000});
 const root=await app.evaluate(({app})=>app.getPath('userData'));
 if(path.basename(root)!==revision.slice(0,7)||!root.includes('DrawingNumberPlannerAcceptance')||fs.readFileSync(path.join(root,'.acceptance-version'),'utf8')!==revision)throw Error('Incorrect isolation/version');
 const title=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getTitle());if(!title.includes('P4 BOM')||!title.includes(revision.slice(0,7)))throw Error('Incorrect visible package identity');
 const health=await page.evaluate(async()=>(await fetch('/api/health')).status);if(health!==200)throw Error('Service health failed');
 const writes=[];page.on('request',request=>{if(request.url().includes('/api/')&&!['GET','HEAD'].includes(request.method())&&!request.url().endsWith('/api/session'))writes.push(request.method()+' '+request.url());});
 if(await page.getByRole('button',{name:'展开导航',exact:true}).isVisible())await page.getByRole('button',{name:'展开导航',exact:true}).click();
 await page.getByRole('button',{name:'BOM 管理',exact:true}).click();await page.getByRole('button',{name:'查询 BOM',exact:true}).click();
 await page.getByRole('button',{name:'查看 BOM 1',exact:true}).click();await page.getByText('首次记录，无历史版本可对照',{exact:true}).waitFor();
 if(await page.getByRole('columnheader',{name:'上一条记录',exact:true}).count())throw Error('First record must not show a blank historical column');
 const count=await page.locator('.bom-history-project').count();if(count!==before.bom_items.count)throw Error('Existing item count lost');
 await page.getByRole('button',{name:'全部收起',exact:true}).click();if(await page.locator('.bom-history-toggle[aria-expanded="true"]').count())throw Error('Collapse all failed');
 await page.getByRole('button',{name:'全部展开',exact:true}).click();if(await page.locator('.bom-history-toggle[aria-expanded="true"]').count()!==count)throw Error('Expand all failed');
 // Wait for the real image endpoint to resolve availability; no simulated image states.
 await page.waitForFunction(()=>![...document.querySelectorAll('.bom-history-asset [role="status"]')].some(el=>el.textContent.includes('正在')));
 const attachments=await page.locator('.bom-history-asset').evaluateAll(nodes=>nodes.map(node=>({name:node.querySelector('strong')?.textContent,status:node.querySelector('[role="status"]')?.textContent,openEnabled:!node.querySelector('button[aria-label^="打开附件位置"]')?.disabled,pathDefaultHidden:!node.querySelector('details')?.open})));
 for(const a of attachments)if(!a.status||a.status.includes('正在')||!a.pathDefaultHidden)throw Error('Attachment state or default path disclosure failed');
 // Actual isolated save, never a mock or a POST creating another version.
 const original=await page.evaluate(async()=> (await fetch('/api/boms/versions/1')).json());
 await page.getByRole('button',{name:'编辑 BOM 1',exact:true}).click();await page.getByLabel('第 1 行材质',{exact:true}).waitFor();
 if(!await page.getByLabel('业务变更日期',{exact:true}).isDisabled())throw Error('Original business date must be locked');
 await page.getByRole('button',{name:'编辑 BOM',exact:true}).click();
 await page.getByLabel('第 1 行材质',{exact:true}).fill('Windows隔离验收：仅修改材质');await page.getByRole('button',{name:'保存修改',exact:true}).click();
 await page.getByLabel('所选 BOM 记录',{exact:true}).getByText('Windows隔离验收：仅修改材质',{exact:true}).waitFor();
 const saved=await page.evaluate(async()=> (await fetch('/api/boms/versions/1')).json());
 const listed=await page.evaluate(async()=> (await fetch('/api/boms/query')).json());
 if(saved.id!==original.id||saved.createdAt!==original.createdAt||saved.businessChangeDate!==original.businessChangeDate||listed.items.length!==before.bom_versions.count||saved.items[0].material!=='Windows隔离验收：仅修改材质')throw Error('Edit created a record, changed immutable metadata or failed to persist');
 if(await page.getByRole('rowheader',{name:'二维码关联',exact:true}).count())throw Error('QR row remains in BOM detail');
 const batchRows=await page.getByRole('rowheader',{name:'生效批次',exact:true}).evaluateAll(nodes=>nodes.map(n=>({details:n.parentElement.querySelectorAll('details').length,text:n.parentElement.textContent})));
 if(batchRows.some(row=>row.details||/关联编号|原始名称|完整路径/.test(row.text)))throw Error('Batch field is not compact');
 if(await page.getByRole('button',{name:/复制/}).count())throw Error('BOM copy controls must be absent');
 await page.getByText(saved.items[0].fullCode,{exact:true}).first().waitFor();
 const display=await app.evaluate(({screen,BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];const d=screen.getDisplayMatching(w.getBounds());w.maximize();return{bounds:d.bounds,workArea:d.workArea,scaleFactor:d.scaleFactor};});await page.waitForTimeout(300);
 const maximized=await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio}));maximized.isMaximized=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isMaximized());
 await page.locator('[aria-label="所选 BOM 记录"]').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(directory,'Windows-BOM-最大化.png')});
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].unmaximize());await page.waitForTimeout(200);
 const measurements=[];
 for(const [width,height] of [[3840,2160],[2560,1440],[1920,1080],[1366,768],[1100,760],[720,600]]){
  await app.evaluate(({BrowserWindow},size)=>{const w=BrowserWindow.getAllWindows()[0];w.setContentSize(...size);},[width,height]);await page.waitForTimeout(250);
  const m=await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,overflow:document.documentElement.scrollWidth>innerWidth+1,detailWidth:document.querySelector('.bom-history-comparison').getBoundingClientRect().width,copyBelow:[...document.querySelectorAll('.bom-value-copy')].filter(e=>{const text=e.querySelector('.bom-value-text')?.getBoundingClientRect(),copy=e.querySelector('button')?.getBoundingClientRect();return copy?.width>0&&text&&(copy.left<text.right-1||copy.top>text.bottom+1);}).length,outside:[...document.querySelectorAll('.bom-history-comparison button')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.left<0||r.right>innerWidth+1);}).length}));
  if(m.width!==width||m.height!==height||m.overflow||m.outside||m.copyBelow)throw Error('Actual Windows content viewport failed: '+JSON.stringify(m));measurements.push(m);
  if([3840,1920,1100].includes(width)){await page.locator('[aria-label="所选 BOM 记录"]').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(directory,`Windows-BOM-${width}.png`)});}
 }
 const after=snapshot(path.join(root,'planner.db'));for(const name of Object.keys(before))if(!['bom_versions','bom_items'].includes(name)&&JSON.stringify(before[name])!==JSON.stringify(after[name]))throw Error('Unrelated table changed: '+name);
 for(const name of Object.keys(before))if(before[name].count!==after[name].count)throw Error('Record count changed: '+name);
 if(JSON.stringify(before)!==JSON.stringify(snapshot(seedFile)))throw Error('Packaged original sample changed');if(writes.length!==1||!writes[0].includes('PUT ')||!writes[0].endsWith('/api/boms/versions/1'))throw Error('Unexpected writes or creation request: '+JSON.stringify(writes));
 fs.writeFileSync(path.join(directory,'windows-verification.json'),JSON.stringify({revision,root,title,health,display,maximized,physical4kMaximizedVerified:maximized.isMaximized&&display.bounds.width>=3840&&display.bounds.height>=2160,measurements,attachments,before,after,countsUnchanged:true,unrelatedTablesUnchanged:true,edit:{originalId:original.id,savedId:saved.id,originalDate:original.businessChangeDate,savedDate:saved.businessChangeDate,originalCreatedAt:original.createdAt,savedCreatedAt:saved.createdAt},writes,scope:'Actual Windows Electron, controlled edit of one existing isolated sample; no new records, no production data operations. Native CI content sizes/maximized display recorded separately from physical user 4K/DPI acceptance.'},null,2));
}finally{await app.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
