import { chromium } from '@playwright/test';
import fs from 'node:fs';
const output='C:/Users/Administrator/Documents/Codex/batch2-ui-shots';
fs.mkdirSync(output,{recursive:true});
const dictionaries={
 brand:[{id:1,code:'02',name:'样例品牌',status:'active'},{id:101,code:'LONG-CODE-0123456789',name:'长名称样例：完整保留业务名称用于检查换行和编辑定位',status:'inactive'}],
 appearance:[{id:3,code:'01',name:'完整外观名称',status:'active'}],
 color:[{id:4,code:'0',name:'白色',status:'active'}],
 main_category:[{id:5,code:'04',name:'印刷件类',status:'active'},{id:9,code:'05',name:'包装类',status:'inactive'}],
 project_item:[{id:6,code:'01',name:'说明书：长名称样例用于完整显示与保存前核对',parentId:5,status:'active'},{id:7,code:'02',name:'包装箱',parentId:9,status:'active'}],
};
const product={id:1,sku:'TEST-100-JP',model:'F100',brandId:1,brandName:'样例品牌',productSizeId:2,productSizeName:'标准尺寸',defaultAppearanceId:3,status:'active'};
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage();
let requests=0;
await page.route('**/api/**',async route=>{
 requests++;
 const request=route.request(),url=new URL(request.url());
 let body={items:[],status:'ok',total:0};
 if(url.pathname==='/api/session')body={token:'test-only'};
 if(url.pathname==='/api/products')body={items:[product]};
 if(url.pathname.startsWith('/api/dictionaries/'))body={items:dictionaries[url.pathname.split('/').pop()]??[]};
 if(url.pathname==='/api/planning/preview'){
  const input=request.postDataJSON();
  body={productId:1,appearanceId:3,rows:input.rows.map(row=>({...row,fullCode:'02.0404.010.0401008',displayName:'F100 白色说明书：长名称样例用于完整显示与保存前核对',sequence:8,available:true}))};
 }
 if(url.pathname==='/api/planning/reserve')body={items:[{id:10,fullCode:'02.0404.010.0401008',displayName:'F100 白色说明书',status:'reserved'}]};
 await route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
});
async function capture(name){
 await page.waitForTimeout(300);
 for(const width of [1080,1200,1280]){
  await page.setViewportSize({width,height:900});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  if(overflow)throw Error(name+' overflow '+width);
  await page.screenshot({path:output+'/'+name+'-'+width+'.png',fullPage:true});
 }
}
await page.goto('http://127.0.0.1:5190/');
await page.locator('.sidebar nav').getByRole('button',{name:'编码字典'}).click();
await page.getByText('样例品牌',{exact:true}).waitFor();
if(await page.getByLabel('编码',{exact:true}).count())throw Error('create initially open');
await capture('dictionary-list');
await page.getByRole('button',{name:'新增',exact:true}).click();
await capture('dictionary-create');
await page.getByRole('button',{name:'取消新增'}).click();
await page.getByRole('button',{name:'修改 样例品牌'}).click();
await capture('dictionary-edit');
await page.getByRole('button',{name:'取消',exact:true}).click();
await page.getByRole('button',{name:'删除 样例品牌'}).click();
await capture('dictionary-delete');
await page.getByRole('button',{name:'取消',exact:true}).click();
await page.getByRole('tab',{name:'主类别'}).click();
await page.getByRole('button',{name:'查看 印刷件类 的项目明细'}).click();
await capture('dictionary-hierarchy');
await page.getByRole('button',{name:'查看 包装类 的项目明细'}).click();
if(!await page.getByRole('button',{name:'新增项目明细',exact:true}).isDisabled())throw Error('inactive parent permits create');
await page.locator('.sidebar nav').getByRole('button',{name:'图号规划 / 更新包材'}).click();
await page.getByLabel('产品型号',{exact:true}).selectOption('1');
await page.getByLabel('第 1 行主类别').selectOption('5');
await page.getByLabel('第 1 行项目明细').selectOption('6');
await page.getByLabel('第 1 行颜色').selectOption('4');
await capture('planning-input');
await page.getByRole('button',{name:'查重并预览',exact:true}).click();
await page.getByText('02.0404.010.0401008',{exact:true}).waitFor();
await capture('planning-preview');
await page.getByLabel('第 1 行备注').fill('变更条件');
if(await page.getByRole('button',{name:'确认批量占号'}).count())throw Error('stale preview not invalidated');
await page.getByRole('button',{name:'查重并预览',exact:true}).click();
await page.getByRole('button',{name:'确认批量占号'}).click();
await page.getByText('已成功占用 1 个图号 · 正式保存').waitFor();
await capture('planning-saved');
console.log('Real components, controlled populated responses; all widths passed; intercepted requests:',requests);
await browser.close();
