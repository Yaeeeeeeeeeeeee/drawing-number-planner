import {mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect,test,type Page} from '@playwright/test';
import {openDatabase} from '../../src/db/database';
import {DictionaryService} from '../../src/core/dictionaries/dictionary-service';
import {ProductService} from '../../src/core/products/product-service';
import {FileService} from '../../src/core/files/file-service';
import {FileRepository} from '../../src/core/files/file-repository';
import {WorkspaceSettingsStore} from '../../src/core/files/workspace-settings';

async function go(page:Page,label:string){
 const nav=page.getByRole('navigation',{name:'主导航'});
 if(!await nav.isVisible())await page.getByRole('button',{name:'展开导航',exact:true}).click();
 await nav.getByRole('button',{name:label,exact:true}).click();
 await expect(page.getByRole('heading',{name:label,exact:true})).toBeVisible();
}

test('V5.2 real indexed tables keep width, alignment, icon actions and frozen controls across window sizes',async({page})=>{
 test.setTimeout(120000);
 const data=process.env.PHASE4_E2E_DATA_DIR!,settingsPath=join(data,'settings.json');
 let oldSettings:string|undefined;try{oldSettings=readFileSync(settingsPath,'utf8');}catch{}
 const root=mkdtempSync(join(tmpdir(),'v52-layout-files-'));
 const db=openDatabase(join(data,'planner.db'));
 try{
  const dictionaries=new DictionaryService(db);
  const brand=dictionaries.create({type:'brand',code:'89',name:'V52 Layout'});
  const size=dictionaries.create({type:'product_size',code:'5252',name:'Layout Model'});
  const appearance=dictionaries.create({type:'appearance',code:'52',name:'Layout Appearance'});
  dictionaries.create({type:'color',code:'5',name:'Layout Color'});
  const category=dictionaries.create({type:'main_category',code:'52',name:'Layout Category'});
  dictionaries.create({type:'project_item',code:'52',name:'Layout Project',parentId:category.id});
  for(let index=0;index<30;index++){
   const model=`LAYOUT${String(index).padStart(2,'0')}`,sku=`V52${String(index).padStart(2,'0')}`;
   new ProductService(db).create({sku,model,brandId:brand.id,productSizeId:size.id,defaultAppearanceId:appearance.id,productCategory:'布局验收'});
   const directory=join(root,'布局验收',`${sku}-${model}`,'02.未转曲源文件');mkdirSync(directory,{recursive:true});
   writeFileSync(join(directory,`89.5252.525.5252${String(index+1).padStart(3,'0')}-${model}.pdf`),`%PDF-1.4\n% Layout ${index}\n%%EOF`);
  }
  const files=new FileService(new FileRepository(db),new WorkspaceSettingsStore(settingsPath));files.updateSettings({workspaceRoot:root});
  expect((await files.scan()).source).toBe(30);
  await page.goto('/');
  for(const [label,selector,columns] of [
   ['产品档案','.products-compact',['sku','model','brand']],
   ['二维码管理','.qr-manual-page',['sku','model']],
   ['PDF 文件中心','.files-page',['name','batch','drawing']],
   ['编码字典','.dictionaries-real-page',['name']],
  ] as const){
   await go(page,label);const section=page.locator(selector).filter({visible:true});
   const table=section.locator('table').first();await expect(table.locator('tbody td').first()).toBeVisible();
   for(const width of [1366,1920,2560,3840,720]){
    await page.setViewportSize({width,height:900});
    await expect.poll(()=>section.evaluate(element=>{
     const workspace=element.closest('.workspace')!;return workspace.scrollWidth-workspace.clientWidth;
    })).toBeLessThanOrEqual(2);
    for(const key of columns){
     const header=table.locator(`thead th[data-column-key="${key}"]`);
     await expect(header).toHaveCSS('text-align','center');
     await expect(table.locator(`tbody td[data-column-key="${key}"]`).first()).toHaveCSS('text-align','center');
    }
    const geometry=await table.evaluate(element=>{
     const cells=[...element.querySelectorAll('thead th')].map(cell=>cell.getBoundingClientRect().width);
     const wrap=element.closest('.table-wrap')!;return {table:element.getBoundingClientRect().width,wrap:wrap.clientWidth,sum:cells.reduce((a,b)=>a+b,0)};
    });
    expect(Math.abs(geometry.sum-geometry.table)).toBeLessThan(2);
    if(width>=1920)await expect.poll(()=>table.evaluate(element=>Math.abs(element.getBoundingClientRect().width-element.closest('.table-wrap')!.clientWidth))).toBeLessThan(2);
   }
   await page.setViewportSize({width:1920,height:900});
   await expect.poll(()=>table.evaluate(element=>Math.abs(element.getBoundingClientRect().width-element.closest('.table-wrap')!.clientWidth))).toBeLessThan(2);
   const before=await table.locator('thead th').evaluateAll(cells=>cells.map(cell=>({key:(cell as HTMLElement).dataset.columnKey!,width:cell.getBoundingClientRect().width})));
   const key=columns[0],handle=table.getByRole('separator',{name:`调整${key==='sku'?'SKU':key==='name'?(label==='编码字典'?'名称':'文件名'):'型号'}列宽`});
   await handle.focus();await handle.press('ArrowLeft');
   const after=await table.locator('thead th').evaluateAll(cells=>cells.map(cell=>({key:(cell as HTMLElement).dataset.columnKey!,width:cell.getBoundingClientRect().width})));
   const target=before.find(cell=>cell.key===key)!,changed=after.find(cell=>cell.key===key)!;
   expect(changed.width).toBeLessThan(target.width);
   const receiver=before.at(-1)!;
   for(const cell of after)if(cell.key!==key&&cell.key!==receiver.key)expect(cell.width).toBeCloseTo(before.find(old=>old.key===cell.key)!.width,0);
   expect(after.at(-1)!.width).toBeCloseTo(receiver.width+target.width-changed.width,0);
   if(label!=='编码字典'){
    await page.setViewportSize({width:1920,height:320});
    const workspace=page.locator('main.workspace');
    await expect.poll(()=>workspace.evaluate(element=>element.scrollHeight-element.clientHeight)).toBeGreaterThan(0);
    await workspace.evaluate(element=>{element.scrollTop=100;});
    const controls=section.locator('.page-sticky-controls');
    await expect.poll(async()=>{
     const box=await controls.boundingBox(),parent=await workspace.boundingBox();
     return Math.abs(box!.y-parent!.y);
    }).toBeLessThanOrEqual(2);
    await workspace.evaluate(element=>{element.scrollTop=0;});
    await page.setViewportSize({width:1920,height:900});
   }
   if(label==='PDF 文件中心'){
    const toolbar=section.getByRole('region',{name:'PDF 索引管理'});const buttons=toolbar.getByRole('button');expect(await buttons.count()).toBe(6);
    const rects=await buttons.evaluateAll(nodes=>nodes.map(node=>({y:node.getBoundingClientRect().y,h:node.getBoundingClientRect().height,icon:!!node.querySelector('svg'),text:node.textContent})));
    expect(Math.max(...rects.map(r=>r.y))-Math.min(...rects.map(r=>r.y))).toBeLessThan(2);
    expect(rects.every(r=>r.icon&&r.text==='')).toBe(true);
    const scroll=table.locator('xpath=..');await scroll.evaluate(element=>{element.scrollTop=500;});
    await expect(section.getByRole('button',{name:'扫描资料库',exact:true})).toBeVisible();
    await expect(toolbar).toBeVisible();
   }
  }
 }finally{
  db.close();if(oldSettings!==undefined)writeFileSync(settingsPath,oldSettings);else rmSync(settingsPath,{force:true});rmSync(root,{recursive:true,force:true});
 }
});
