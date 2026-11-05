import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {createServer} from 'vite';
import {expect,test} from '@playwright/test';
import {startServer} from '../../src/server/start-server';
import {openDatabase} from '../../src/db/database';
import {DictionaryService} from '../../src/core/dictionaries/dictionary-service';
import {ProductService} from '../../src/core/products/product-service';
import {PlanningService} from '../../src/core/planning/planning-service';
import {DrawingForceReleaseService} from '../../src/core/drawings/drawing-force-release-service';

test('ends a force-detached T40 task through the real UI, preserving the PDF and index',async({page})=>{
  const data=mkdtempSync(join(tmpdir(),'task-ending-e2e-')),root=join(data,'library');mkdirSync(root);
  writeFileSync(join(data,'settings.json'),JSON.stringify({workspaceRoot:root}));
  const server=await startServer({port:0,dataDir:data,allowedOrigins:['http://127.0.0.1:5174']});
  const vite=await createServer({configFile:'vite.config.ts',server:{host:'127.0.0.1',port:5174,strictPort:true,proxy:{'/api':server.url}}});
  const db=openDatabase(join(data,'planner.db'));
  try{
    const dictionary=new DictionaryService(db),brand=dictionary.create({type:'brand',code:'02',name:'SAMKYO'}),size=dictionary.create({type:'product_size',code:'0101',name:'洗碗机'}),appearance=dictionary.create({type:'appearance',code:'01',name:'外观'}),color=dictionary.create({type:'color',code:'0',name:'白色'}),main=dictionary.create({type:'main_category',code:'02',name:'铭牌类'}),project=dictionary.create({type:'project_item',code:'01',name:'铭牌',parentId:main.id});
    const product=new ProductService(db).create({sku:'SKDWT040JP',model:'T40',brandId:brand.id,productSizeId:size.id,defaultAppearanceId:appearance.id,productCategory:'洗碗机'});
    const planning=new PlanningService(db),input={productId:product.id,rows:[{clientId:'t40',colorId:color.id,mainCategoryId:main.id,projectItemId:project.id}]};
    const preview=planning.preview(input),drawing=planning.reserve({...input,rows:[{...input.rows[0],expectedFullCode:preview.rows[0].fullCode}]})[0];
    const request=async(path:string,body:unknown)=>{const response=await fetch(server.url+path,{method:'POST',headers:{'content-type':'application/json','x-planner-token':server.token,origin:'http://127.0.0.1:5174'},body:JSON.stringify(body)});const result=await response.json();expect(response.ok,JSON.stringify(result)).toBe(true);return result;};
    const task=await request('/api/packaging/tasks',{productId:product.id,type:'new',drawings:[{origin:'planned',id:drawing.id}]});
    const path=join(root,task.productDirectory,'02.未转曲源文件',`${drawing.fullCode}-SAMKYO-T40白色-铭牌.pdf`),pdf='%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n';mkdirSync(dirname(path),{recursive:true});writeFileSync(path,pdf);
    await request('/api/packaging/scan-product',{productId:product.id});
    const release=new DrawingForceReleaseService(db),impact=release.preview(drawing.id);release.confirm({signedId:drawing.id,fingerprint:impact.fingerprint,confirmed:true});
    db.prepare("update packaging_tasks set state='awaiting_index',error='旧 PDF 已强制脱钩，不能自动关联到重分配图号' where id=?").run(task.id);
    const index=db.prepare('select id,drawing_id,historical_drawing_id,content_sha256 from pdf_files').all();
    await vite.listen();await page.setViewportSize({width:1920,height:1080});await page.goto('http://127.0.0.1:5174/');
    const nav=page.getByRole('navigation',{name:'主导航'});if(!await nav.isVisible())await page.getByRole('button',{name:'展开导航',exact:true}).click();await nav.getByRole('button',{name:'制图任务',exact:true}).click();
    await page.getByRole('button',{name:'保留文件并结束任务',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'保留文件并结束任务'});await expect(dialog).toBeVisible();
    const evidence=join(process.cwd(),'test-results','confirmed-requirements');mkdirSync(evidence,{recursive:true});await page.screenshot({path:join(evidence,'p0-termination-confirmation-1920.png'),fullPage:true});
    await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'确认结束任务'}).click();
    await expect(dialog).not.toBeVisible();await expect(page.getByText('已结束',{exact:true})).toBeVisible();
    expect(readFileSync(path,'utf8')).toBe(pdf);expect(db.prepare('select id,drawing_id,historical_drawing_id,content_sha256 from pdf_files').all()).toEqual(index);
    expect(db.prepare("select state,completed_at from packaging_tasks where id=? and deleted_at is not null").get(task.id)).toEqual({state:'awaiting_index',completed_at:null});expect(db.pragma('foreign_key_check')).toEqual([]);
    await page.screenshot({path:join(evidence,'p0-terminated-history-1920.png'),fullPage:true});
  }finally{await vite.close();await server.close();db.close();rmSync(data,{recursive:true,force:true});}
});
