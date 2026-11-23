import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'vite';
import {expect,test} from '@playwright/test';
import {startServer} from '../../src/server/start-server';
import {openDatabase} from '../../src/db/database';
import {DictionaryService} from '../../src/core/dictionaries/dictionary-service';
import {ProductService} from '../../src/core/products/product-service';
import {existsSync} from 'node:fs';
if(existsSync('/usr/bin/chromium')) test.use({launchOptions:{executablePath:'/usr/bin/chromium'}});
test('groups actual scanned files and retains checked files through folding',async({page})=>{
 test.setTimeout(60_000);
 const data=mkdtempSync(join(tmpdir(),'pdf-list-e2e-')),root=join(data,'library');mkdirSync(root);writeFileSync(join(data,'settings.json'),JSON.stringify({workspaceRoot:root}));
 const server=await startServer({port:0,dataDir:data,allowedOrigins:['http://127.0.0.1:5176']});
 const vite=await createServer({configFile:'vite.config.ts',server:{host:'127.0.0.1',port:5176,strictPort:true,proxy:{'/api':server.url}}}),db=openDatabase(join(data,'planner.db'));
 try {
  const dict=new DictionaryService(db),brand=dict.create({type:'brand',code:'02',name:'SAMKYO'}),size=dict.create({type:'product_size',code:'0305',name:'冰柜'}),appearance=dict.create({type:'appearance',code:'01',name:'外观'}),main=dict.create({type:'main_category',code:'02',name:'铭牌类'});
  dict.create({type:'color',code:'0',name:'白色'});dict.create({type:'project_item',code:'01',name:'铭牌',parentId:main.id});
  new ProductService(db).create({sku:'SKDZU070JP',model:'ZU70SD',brandId:brand.id,productSizeId:size.id,defaultAppearanceId:appearance.id,productCategory:'冰柜'});
  const base=join(root,'冰柜/SKDZU070JP-ZU70SD'),source=join(base,'02.未转曲源文件'),batch=join(base,'03.量产后的变更文件（已量产的产品看最新日期）');
  const dirs=[source,join(batch,'06.20260309'),join(batch,'00.首批大货'),join(batch,'06.20260309')];dirs.forEach(dir=>mkdirSync(dir,{recursive:true}));
  const code='02.0305.010.0201001',stem=`${code}-SAMKYO-ZU70SD白色-铭牌`,names=[`${stem}.pdf`,`${stem}（转曲）.pdf`,`${stem}-历史（转曲）.pdf`,`${stem}.pdf`];
  const stream='BT /F1 12 Tf 20 100 Td (SAMKYO ZU70SD material) Tj ET',objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let pdf='%PDF-1.4\n';const offsets:number[]=[];objects.forEach((object,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${object}\nendobj\n`;});const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 6\n0000000000 65535 f \n${offsets.map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;const bytes=Buffer.from(pdf);
  const paths=dirs.map((dir,i)=>join(dir,names[i]));paths.forEach(path=>writeFileSync(path,bytes));
  // Startup's watcher can acquire the scan before the manual category request.
  await expect.poll(async () => {
    const response=await fetch(server.url+'/api/packaging/scan-category',{method:'POST',headers:{'content-type':'application/json','x-planner-token':server.token,origin:'http://127.0.0.1:5176'},body:JSON.stringify({category:'冰柜'})});
    if(response.status!==409) expect(response.status, await response.text()).toBe(200);
    return response.status;
  }).toBe(200);
  await vite.listen();await page.setViewportSize({width:1600,height:900});await page.goto('http://127.0.0.1:5176/');
  const nav=page.getByRole('navigation',{name:'主导航'});if(!await nav.isVisible())await page.getByRole('button',{name:'展开导航',exact:true}).click();await nav.getByRole('button',{name:'PDF 文件中心',exact:true}).click();
  const group=page.getByRole('button',{name:/已加载 2 个版本/});await expect(group).toBeVisible();await expect(page.getByRole('checkbox',{name:`选择 ${names[0]}`,exact:true})).toHaveCount(2);const before=db.prepare('select * from pdf_files order by id').all();await expect(page.getByRole('checkbox',{name:`选择 ${names[2]}`})).toHaveCount(0);
  await group.click();await page.getByRole('checkbox',{name:`选择 ${names[2]}`}).check();await group.click();await expect(page.getByText('已选 1 条',{exact:true})).toBeVisible();
  const evidence=join(process.cwd(),'test-results/confirmed-requirements');mkdirSync(evidence,{recursive:true});await page.screenshot({path:join(evidence,'pdf-list-folded.png')});
  await page.getByRole('searchbox',{name:'文件关键词',exact:true}).fill('历史');await expect(page.getByText('已选 1 条',{exact:true})).toHaveCount(0);await expect(page.getByRole('checkbox',{name:`选择 ${names[2]}`})).toBeVisible();await page.screenshot({path:join(evidence,'pdf-list-history-search.png')});const last = page.getByRole('checkbox',{name:`选择 ${names[2]}`});
  const footer = await page.getByRole('status',{name:'当前列表加载进度'}).boundingBox();
  const lastBox = await last.boundingBox();
  expect(lastBox!.y + lastBox!.height).toBeLessThanOrEqual(footer!.y);
  await last.check();await page.getByRole('button',{name:'待关联产品'}).click();await expect(page.getByText('已选 1 条',{exact:true})).toHaveCount(0);
  expect(db.prepare('select * from pdf_files order by id').all()).toEqual(before);paths.forEach(path=>expect(readFileSync(path)).toEqual(bytes));
 }finally{await vite.close();await server.close();db.close();rmSync(data,{recursive:true,force:true});}
});
