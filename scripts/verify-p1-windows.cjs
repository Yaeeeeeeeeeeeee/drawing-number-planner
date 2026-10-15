// Actual Windows Electron smoke verification, never operates on a formal database.
const fs=require('node:fs'),path=require('node:path');
const {createRequire}=require('node:module');
const revision=process.env.PLANNER_ACCEPTANCE_REVISION ?? '7d9e7b74ee1222c9b789946dd69d94f89704bfe7';
if(!/^[0-9a-f]{40}$/.test(revision))throw Error('Invalid acceptance revision');
const [source,executable]=process.argv.slice(2);
const dep=createRequire(path.join(path.resolve(source),'package.json'));
const {_electron}=dep('@playwright/test');
(async()=>{
 const app=await _electron.launch({executablePath:path.resolve(executable),timeout:45000});
 try{
  const page=await app.firstWindow();await page.getByRole('heading',{name:'图号规划',exact:true}).waitFor({timeout:25000});
  await page.getByRole('option',{name:/PREVIEWF60/}).waitFor({state:'attached'});
  const root=await app.evaluate(({app})=>app.getPath('userData'));
  if(path.basename(root)!==revision.slice(0,7)||!root.includes('DrawingNumberPlannerAcceptance'))throw Error('Wrong isolated userData');
  if(fs.readFileSync(path.join(root,'.acceptance-version'),'utf8')!==revision)throw Error('Wrong runtime version marker');
  const title=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getTitle());
  if(!title.includes(revision.slice(0,7)))throw Error('Wrong visible version identity');
  const health=await page.evaluate(async()=>({status:(await fetch('/api/health')).status}));if(health.status!==200)throw Error('Service not healthy');
  const measurements=[];
  for(const [width,height] of [[720,600],[1080,800],[1920,1000]]){
   await app.evaluate(({BrowserWindow},target)=>{const w=BrowserWindow.getAllWindows()[0];w.setSize(...target);},[width+16,height+96]);
   await page.waitForTimeout(300);
   // Adjust outer size by the measured CSS delta; do not assume fixed Windows borders.
   const current=await page.evaluate(()=>[innerWidth,innerHeight]);
   await app.evaluate(({BrowserWindow},{target,current})=>{const w=BrowserWindow.getAllWindows()[0];const [ow,oh]=w.getSize();w.setSize(ow+target[0]-current[0],oh+target[1]-current[1]);},{target:[width,height],current});
   await page.waitForTimeout(300);
   const measured=await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,overflow:document.documentElement.scrollWidth>innerWidth}));
   measurements.push(measured);if(measured.width<width||measured.height<height||measured.overflow)throw Error('Minimum content layout failed');
  }
  const directory=path.dirname(path.resolve(executable));await page.screenshot({path:path.join(directory,'Windows启动烟测.png')});
  if(['P2','P3'].includes(process.env.PLANNER_ACCEPTANCE_PHASE)) {
   await page.locator('.sidebar nav').getByRole('button',{name:'PDF 文件中心',exact:true}).click();
   const file=page.locator('.files-name-button').first();await file.waitFor();const before=await page.locator('.module-list').boundingBox();await file.click();
   await page.getByRole('complementary',{name:'文件详情'}).waitFor();
   if(process.env.PLANNER_ACCEPTANCE_PHASE==='P3'){
    const after=await page.locator('.module-list').boundingBox();if(Math.abs(before.width-after.width)>1)throw Error('P3 file list compressed');
    const cells=await page.locator('.module-list tbody > tr').first().evaluate(row=>[...row.children].map((el,i)=>({i,align:getComputedStyle(el).textAlign,space:getComputedStyle(el).whiteSpace})));
    if(!cells.every(c=>c.align===(c.i===1?'left':'center'))||cells[2].space!=='nowrap'||cells[3].space!=='nowrap')throw Error('P3 PDF alignment failed');
   }
   await page.screenshot({path:path.join(directory,`Windows-${process.env.PLANNER_ACCEPTANCE_PHASE}文件详情.png`)});
  }
  fs.writeFileSync(path.join(directory,'windows-verification.json'),JSON.stringify({revision,root,title,health,measurements,scope:'Windows CI startup only; human DPI/cross-monitor acceptance pending'},null,2));
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
