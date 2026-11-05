import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'vite';
import {expect,test} from '@playwright/test';
import {startServer} from '../../src/server/start-server';
import {openDatabase} from '../../src/db/database';
import {DictionaryService} from '../../src/core/dictionaries/dictionary-service';
import {ProductService} from '../../src/core/products/product-service';

test('real category scan and501-file selection use two guarded batches without touching files or occupation',async({page})=>{
  test.setTimeout(90_000);
  const data=mkdtempSync(join(tmpdir(),'pdf-batch-workflow-')),root=join(data,'library');mkdirSync(root);
  writeFileSync(join(data,'settings.json'),JSON.stringify({workspaceRoot:root}));
  const server=await startServer({port:0,dataDir:data,allowedOrigins:['http://127.0.0.1:5174']});
  const vite=await createServer({configFile:'vite.config.ts',server:{host:'127.0.0.1',port:5174,strictPort:true,proxy:{'/api':server.url}}}),db=openDatabase(join(data,'planner.db'));
  try{
    const dict=new DictionaryService(db),brand=dict.create({type:'brand',code:'02',name:'SAMKYO'}),size=dict.create({type:'product_size',code:'0305',name:'冰柜'}),appearance=dict.create({type:'appearance',code:'01',name:'外观'}),main=dict.create({type:'main_category',code:'02',name:'铭牌类'});
    dict.create({type:'color',code:'0',name:'白色'});dict.create({type:'project_item',code:'01',name:'铭牌',parentId:main.id});
    const product=new ProductService(db).create({sku:'SKDZU070JP',model:'ZU70SD',brandId:brand.id,productSizeId:size.id,defaultAppearanceId:appearance.id,productCategory:'冰柜'});
    const directory='冰柜/SKDZU070JP-ZU70SD',source=join(root,directory,'02.未转曲源文件'),outlined=join(root,directory,'03.量产后的变更文件（已量产的产品看最新日期）','00.首批大货');mkdirSync(source,{recursive:true});mkdirSync(outlined,{recursive:true});
    const pdf='%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n';
    for(let n=1;n<=500;n++)writeFileSync(join(source,`02.0305.010.0201${String(n).padStart(3,'0')}-SAMKYO-ZU70SD白色-铭牌.pdf`),pdf);
    writeFileSync(join(outlined,'02.0305.010.0201001-SAMKYO-ZU70SD白色-铭牌（转曲）.pdf'),pdf);
    const otherSize=dict.create({type:'product_size',code:'0402',name:'吸尘器'});new ProductService(db).create({sku:'AKVCH010JP',model:'H10',brandId:brand.id,productSizeId:otherSize.id,defaultAppearanceId:appearance.id,productCategory:'吸尘器'});
    mkdirSync(join(root,'吸尘器/AKVCH010JP-H10/02.未转曲源文件'),{recursive:true});writeFileSync(join(root,'吸尘器/AKVCH010JP-H10/02.未转曲源文件/other.pdf'),pdf);
    const request=async(path:string,body?:unknown)=>{const response=await fetch(server.url+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json','x-planner-token':server.token,origin:'http://127.0.0.1:5174'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,result:await response.json()};};
    let scanned=await request('/api/packaging/scan-category',{category:'冰柜'});
    for(let n=0;n<50&&scanned.result.error?.code==='SCAN_IN_PROGRESS';n++){await new Promise(resolve=>setTimeout(resolve,50));scanned=await request('/api/packaging/scan-category',{category:'冰柜'});}
    expect(scanned.status,JSON.stringify(scanned.result)).toBe(200);expect(scanned.result.comparison.scope.productDirectories).toEqual([directory]);
    const occupation=db.prepare('select full_code from historical_drawing_numbers order by full_code').all();
    const preflight:number[][]=[],applied:number[][]=[];page.on('request',request=>{if(request.method()==='POST'&&request.url().endsWith('/files/management/preview'))preflight.push(request.postDataJSON().ids);if(request.method()==='POST'&&request.url().endsWith('/files/management/apply'))applied.push(request.postDataJSON().ids);});
    await vite.listen();await page.setViewportSize({width:1920,height:1080});await page.goto('http://127.0.0.1:5174/');
    const nav=page.getByRole('navigation',{name:'主导航'});if(!await nav.isVisible())await page.getByRole('button',{name:'展开导航',exact:true}).click();await nav.getByRole('button',{name:'PDF 文件中心',exact:true}).click();
    await page.getByRole('button',{name:'分类 冰柜',exact:true}).click();
    await expect(page.getByText('已加载 100 / 501 条',{exact:true})).toBeVisible();
    const table=page.locator('.table-wrap').first();
    for(const count of [200,300,400,500,501]){
      await table.evaluate(element=>{element.scrollTop=element.scrollHeight;element.dispatchEvent(new Event('scroll'));});
      await expect(page.getByText(`已加载 ${count} / 501 条`,{exact:true})).toBeVisible();
    }
    await page.getByRole('button',{name:'全选',exact:true}).click();await expect(page.getByText('已选 501 条',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'排除所选文件',exact:true}).click();const dialog=page.getByRole('dialog',{name:'PDF 管理预览'});
    await expect(dialog.getByText('预检完成：2 / 2 批',{exact:true})).toBeVisible();expect(preflight.map(ids=>ids.length)).toEqual([500,1]);expect(applied).toHaveLength(0);
    await dialog.getByRole('textbox',{name:'PDF 管理确认短语'}).fill('暂不纳入 PDF');await dialog.getByRole('button',{name:'确认处理',exact:true}).click();
    await expect(dialog.getByText('已完成：501 / 501 条',{exact:true})).toBeVisible();expect(applied.map(ids=>ids.length)).toEqual([500,1]);
    expect(db.prepare("select count(*) n from pdf_file_decisions where decision='ignore'").get()).toEqual({n:501});
    expect(db.prepare('select full_code from historical_drawing_numbers order by full_code').all()).toEqual(occupation);expect(db.prepare('select count(*) n from bom_items').get()).toEqual({n:0});
    expect(readFileSync(join(source,'02.0305.010.0201001-SAMKYO-ZU70SD白色-铭牌.pdf'),'utf8')).toBe(pdf);expect(readFileSync(join(outlined,'02.0305.010.0201001-SAMKYO-ZU70SD白色-铭牌（转曲）.pdf'),'utf8')).toBe(pdf);expect(db.pragma('foreign_key_check')).toEqual([]);
    const evidence=join(process.cwd(),'test-results','confirmed-requirements');mkdirSync(evidence,{recursive:true});await page.screenshot({path:join(evidence,'p2-pdf-501-completed-1920.png'),fullPage:true});
    await dialog.getByRole('button',{name:'关闭',exact:true}).click();await expect(page.getByText('没有符合条件的 PDF',{exact:true})).toBeVisible();
    expect(product.id).toBeGreaterThan(0);
  }finally{await vite.close();await server.close();db.close();rmSync(data,{recursive:true,force:true});}
});
