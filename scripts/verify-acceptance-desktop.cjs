const {createRequire}=require('node:module');
const path=require('node:path');
const fs=require('node:fs');
const dep=createRequire(path.join(process.argv[2],'package.json'));
const testDep=createRequire(dep.resolve('@playwright/test/package.json'));
const {_electron}=testDep('playwright');
(async()=>{
 const app=await _electron.launch({executablePath:process.argv[3],args:[],timeout:45000});
 try{
  const page=await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  try{await page.getByRole('heading',{name:'图号规划',exact:true}).waitFor({timeout:25000});
   await page.getByRole('option',{name:/PREVIEWF60/}).waitFor({state:'attached',timeout:15000});
  }catch(error){
   console.error('Startup surface',page.url(),await page.locator('body').innerText());
   await page.screenshot({path:path.join(path.dirname(process.argv[3]),'startup-failure.png')});throw error;
  }
  const root=await app.evaluate(({app})=>app.getPath('userData'));
  if(!root.includes('DrawingNumberPlannerAcceptance'))throw Error('Unexpected data directory');
  const health=await page.evaluate(async()=>({status:(await fetch('/api/health')).status}));
  const widths=[];
  for(const width of [1080,1200,1280]){
   await app.evaluate(({BrowserWindow},width)=>BrowserWindow.getAllWindows()[0].setContentSize(width,800),width);
   await page.waitForFunction(width=>innerWidth===width,width);
   widths.push(await page.evaluate(()=>({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth})));
  }
  await page.screenshot({path:path.join(path.dirname(process.argv[3]),'桌面启动验收.png'),fullPage:true});
  const body=await page.locator('body').innerText();
  fs.writeFileSync(path.join(path.dirname(process.argv[3]),'desktop-verification.json'),JSON.stringify({root,url:page.url(),health,widths,body},null,2));
  console.log(JSON.stringify({root,url:page.url(),health,widths,body:body.slice(0,1500)}));
 }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
