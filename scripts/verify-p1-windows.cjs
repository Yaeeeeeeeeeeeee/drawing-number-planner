// Actual Windows Electron smoke verification, never operates on a formal database.
const fs=require('node:fs'),path=require('node:path');
const {createRequire}=require('node:module');
const revision='7d9e7b74ee1222c9b789946dd69d94f89704bfe7';
const [source,executable]=process.argv.slice(2);
const dep=createRequire(path.join(path.resolve(source),'package.json'));
const {_electron}=dep('@playwright/test');
(async()=>{
 const app=await _electron.launch({executablePath:path.resolve(executable),timeout:45000});
 try{
  const page=await app.firstWindow();await page.getByRole('heading',{name:'图号规划',exact:true}).waitFor({timeout:25000});
  await page.getByRole('option',{name:/PREVIEWF60/}).waitFor({state:'attached'});
  const root=await app.evaluate(({app})=>app.getPath('userData'));
  if(path.basename(root)!=='7d9e7b7'||!root.includes('DrawingNumberPlannerAcceptance'))throw Error('Wrong isolated userData');
  if(fs.readFileSync(path.join(root,'.acceptance-version'),'utf8')!==revision)throw Error('Wrong runtime version marker');
  const title=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].getTitle());
  if(!title.includes('7d9e7b7'))throw Error('Wrong visible version identity');
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
  fs.writeFileSync(path.join(directory,'windows-verification.json'),JSON.stringify({revision,root,title,health,measurements,scope:'Windows CI startup only; human DPI/cross-monitor acceptance pending'},null,2));
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
