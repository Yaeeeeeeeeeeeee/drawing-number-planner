import {mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'vite';
import {expect,test,type Page} from '@playwright/test';
import {startServer} from '../../src/server/start-server';
import {openDatabase} from '../../src/db/database';
import {DictionaryService} from '../../src/core/dictionaries/dictionary-service';
import {ProductService} from '../../src/core/products/product-service';
import {PlanningService} from '../../src/core/planning/planning-service';

async function fixture() {
  const data=mkdtempSync(join(tmpdir(),'planning-workbench-e2e-')),root=join(data,'library');mkdirSync(root);
  writeFileSync(join(data,'settings.json'),JSON.stringify({workspaceRoot:root}));
  const server=await startServer({port:0,dataDir:data,allowedOrigins:['http://127.0.0.1:5174']});
  const vite=await createServer({configFile:'vite.config.ts',server:{host:'127.0.0.1',port:5174,strictPort:true,proxy:{'/api':server.url}}});
  const db=openDatabase(join(data,'planner.db')),dict=new DictionaryService(db);
  const brand=dict.create({type:'brand',code:'02',name:'SAMKYO'}),appearance=dict.create({type:'appearance',code:'01',name:'标准外观'});
  const white=dict.create({type:'color',code:'0',name:'白色'}),black=dict.create({type:'color',code:'1',name:'黑色'}),main=dict.create({type:'main_category',code:'02',name:'铭牌类'});
  const label=dict.create({type:'project_item',code:'01',name:'铭牌',parentId:main.id}),panel=dict.create({type:'project_item',code:'02',name:'面板',parentId:main.id});
  const products=['T40','T60'].map((model,index)=>{
    const size=dict.create({type:'product_size',code:`010${index+1}`,name:`洗碗机 ${model}`});
    return new ProductService(db).create({sku:`SKDWT0${index?60:40}JP`,model,brandId:brand.id,productSizeId:size.id,defaultAppearanceId:appearance.id,productCategory:'洗碗机'});
  });
  await vite.listen();
  return {data,db,products,white,black,main,label,panel,close:async()=>{await vite.close();await server.close();db.close();rmSync(data,{recursive:true,force:true});}};
}
async function planning(page:Page) {
  await page.goto('http://127.0.0.1:5174/');
  const nav=page.getByRole('navigation',{name:'主导航'});if(!await nav.isVisible())await page.getByRole('button',{name:'展开导航',exact:true}).click();
  await nav.getByRole('button',{name:'图号规划 / 更新包材',exact:true}).click();
  await expect(page.getByRole('combobox',{name:'产品型号',exact:true})).toBeEnabled();
}
async function fields(page:Page,main:number,project:number,color:number) {
  await page.getByRole('combobox',{name:'第 1 行主类别',exact:true}).selectOption(String(main));
  await page.getByRole('combobox',{name:'第 1 行项目明细',exact:true}).selectOption(String(project));
  await page.getByRole('combobox',{name:'第 1 行颜色',exact:true}).selectOption(String(color));
}
const evidence=join(process.cwd(),'test-results','confirmed-requirements');

test('real saved white identity is shared without occupation; explicit confirmation preserves library navigation',async({page})=>{
  const f=await fixture();
  try{
    const service=new PlanningService(f.db),input={productId:f.products[0].id,rows:[{clientId:'baseline',colorId:f.white.id,mainCategoryId:f.main.id,projectItemId:f.label.id}]};
    const checked=service.preview(input),baseline=service.reserve({...input,rows:[{...input.rows[0],expectedFullCode:checked.rows[0].fullCode}]})[0];
    await page.setViewportSize({width:1920,height:1080});await planning(page);
    await page.getByRole('combobox',{name:'产品型号',exact:true}).selectOption(String(f.products[0].id));
    await page.getByRole('button',{name:'下一步',exact:true}).click();await fields(page,f.main.id,f.label.id,f.black.id);
    await page.getByRole('button',{name:'下一步',exact:true}).click();
    await expect(page.getByText('共用已有图号',{exact:true})).toBeVisible();
    expect(f.db.prepare('select count(*) n from drawing_numbers').get()).toEqual({n:1});
    mkdirSync(evidence,{recursive:true});await page.screenshot({path:join(evidence,'p1-real-white-sharing-1920.png'),fullPage:true});
    await page.getByRole('button',{name:'下一步',exact:true}).click();
    await expect(page.getByRole('button',{name:'确认批量占号',exact:true})).toBeDisabled();
    await page.getByRole('checkbox',{name:'已核对本次占号清单'}).check();
    await page.getByRole('button',{name:'确认批量占号',exact:true}).click();
    await expect(page.getByRole('region',{name:'本次占号结果'})).toBeVisible();
    expect(f.db.prepare('select count(*) n from drawing_numbers').get()).toEqual({n:1});
    expect(f.db.prepare('select count(*) n from bom_items').get()).toEqual({n:0});
    await page.getByRole('button',{name:'查看 T40 图号库'}).click();
    await expect(page.getByRole('heading',{name:baseline.fullCode,exact:true})).toBeVisible();
    expect(f.db.pragma('foreign_key_check')).toEqual([]);
  }finally{await f.close();}
});

test('batch model selections and independent persisted drafts survive reload, then reserve distinct real drawings',async({page})=>{
  const f=await fixture();
  try{
    await page.setViewportSize({width:1920,height:1080});await planning(page);
    await page.getByRole('combobox',{name:'产品型号',exact:true}).selectOption(String(f.products[0].id));
    await page.getByRole('button',{name:'下一步',exact:true}).click();await fields(page,f.main.id,f.label.id,f.white.id);
    await expect(page.getByText('草稿已保存',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'批量规划',exact:true}).click();
    await page.getByRole('checkbox',{name:/SAMKYO · T40/}).check();await page.getByRole('checkbox',{name:/SAMKYO · T60/}).check();
    await page.getByRole('button',{name:'下一步',exact:true}).click();await fields(page,f.main.id,f.label.id,f.white.id);
    await page.getByRole('tab',{name:'T60',exact:true}).click();await fields(page,f.main.id,f.panel.id,f.white.id);
    await page.getByRole('tab',{name:'T40',exact:true}).click();await expect(page.getByRole('combobox',{name:'第 1 行项目明细',exact:true})).toHaveValue(String(f.label.id));
    await page.getByRole('button',{name:'下一步',exact:true}).click();await expect(page.getByText('可占用',{exact:true})).toHaveCount(2);
    await page.getByRole('button',{name:'下一步',exact:true}).click();
    await expect.poll(()=>JSON.parse(readFileSync(join(f.data,'planning-drafts.json'),'utf8')).modes.batch.input.step).toBe(4);
    await page.reload();await expect(page.getByRole('button',{name:'新建图号',exact:true})).toHaveAttribute('aria-pressed','true');
    await expect(page.getByRole('combobox',{name:'第 1 行项目明细',exact:true})).toHaveValue(String(f.label.id));
    await page.getByRole('button',{name:'批量规划',exact:true}).click();
    await expect(page.getByRole('button',{name:'确认占号',exact:true})).toHaveAttribute('aria-current','step');
    await expect(page.getByRole('button',{name:'确认批量占号',exact:true})).toBeDisabled();
    await expect(page.getByRole('cell').getByText('尚未检查',{exact:true})).toHaveCount(2);
    await page.getByRole('button',{name:'重新检查全部项目'}).click();await expect(page.getByText('可占用',{exact:true})).toHaveCount(2);
    mkdirSync(evidence,{recursive:true});
    for(const width of [1920,2560,3840,1280]){
      await page.setViewportSize({width,height:1080});
      await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await page.screenshot({path:join(evidence,`p1-batch-confirmation-${width}.png`),fullPage:true});
    }
    await page.setViewportSize({width:1920,height:1080});
    const divider=page.getByRole('separator',{name:'调整图号预览宽度'}),bounds=await divider.boundingBox();expect(bounds).not.toBeNull();
    const before=await page.getByRole('complementary',{name:'完整图号与编码拆解'}).boundingBox();
    await page.mouse.move(bounds!.x+bounds!.width/2,bounds!.y+25);await page.mouse.down();await page.mouse.move(bounds!.x-100,bounds!.y+25);await page.mouse.up();
    await expect.poll(async()=>(await page.getByRole('complementary',{name:'完整图号与编码拆解'}).boundingBox())!.width).toBeGreaterThan(before!.width+50);
    await page.getByRole('checkbox',{name:'已核对本次占号清单'}).check();await page.getByRole('button',{name:'确认批量占号',exact:true}).click();
    await expect(page.getByText('成功 2 项',{exact:true})).toBeVisible();
    const drawings=f.db.prepare('select product_id,full_code from drawing_numbers order by product_id').all() as {product_id:number;full_code:string}[];
    expect(drawings.map(row=>row.product_id)).toEqual(f.products.map(product=>product.id));expect(new Set(drawings.map(row=>row.full_code)).size).toBe(2);
    expect(f.db.prepare('select count(*) n from bom_items').get()).toEqual({n:0});expect(f.db.pragma('foreign_key_check')).toEqual([]);
    await page.screenshot({path:join(evidence,'p1-batch-results-1920.png'),fullPage:true});
  }finally{await f.close();}
});
