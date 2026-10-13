import {chromium} from '@playwright/test';
import fs from 'node:fs';
import writeXlsxFile from 'write-excel-file/node';
const base=process.env.PLANNER_UI_CHECK_URL||'http://127.0.0.1:5187';
const dir=process.env.PLANNER_UI_SHOTS||'C:/Users/Administrator/Documents/Codex/approved-ui-alignment-20261013';
fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage();
const blocked=[];
// Read-only pages plus existing non-mutating planning/workbook previews. Never reserve/import/delete.
await page.route('**/api/**',route=>{
 const r=route.request(),path=new URL(r.url()).pathname;
 if(r.method()==='GET'||r.method()==='POST'&&['/api/session','/api/planning/preview','/api/import/excel/audit','/api/outbound-packages/preview'].includes(path))return route.continue();
 blocked.push(r.method()+' '+path);return route.abort();
});
async function nav(name){await page.locator('.sidebar nav').getByRole('button',{name}).click();await page.waitForTimeout(350);}
async function shot(name){for(const width of [1080,1200,1280]){
 await page.setViewportSize({width,height:900});await page.waitForTimeout(150);
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error(name+' overflow '+width);
 await page.screenshot({path:dir+'/'+name+'-'+width+'.png',fullPage:true});
}}
try{
 await page.goto(base);await nav('图号库');await shot('drawings');
 await page.locator('.drawing-library-page tbody button').filter({hasText:/02\./}).first().click();await page.waitForTimeout(250);await shot('drawings-detail');
 await nav('编码字典');await shot('dictionary-main');
 await page.getByRole('button',{name:/修改 /}).first().click();await shot('dictionary-edit');
 await page.getByRole('button',{name:'取消',exact:true}).click();
 await page.getByRole('button',{name:'新增',exact:true}).click();await shot('dictionary-create');
 await page.getByRole('tab',{name:'主类别'}).click();await page.getByRole('button',{name:'查看 印刷件类 的项目明细'}).click();await shot('dictionary-hierarchy');
 await nav('图号规划 / 更新包材');await page.getByLabel('产品型号',{exact:true}).selectOption('1');
 await page.getByLabel('第 1 行主类别').selectOption('5');await page.getByLabel('第 1 行项目明细').selectOption('6');await page.getByLabel('第 1 行颜色').selectOption('4');
 await page.getByRole('button',{name:'查重并预览',exact:true}).click();await page.locator('.pp-result').waitFor();await shot('planning');
 await nav('产品档案');await page.getByRole('button',{name:'详情 F60'}).click();await shot('products');
 await page.getByRole('button',{name:'删除档案 F60'}).click();await page.getByRole('heading',{name:'关联检查与退出指引'}).waitFor();await shot('products-preflight');
 await nav('PDF 文件中心');await shot('files');
 await nav('二维码管理');await page.getByRole('button',{name:/展开 .* 的二维码用途/}).first().click();await shot('qr-list');
 await page.locator('.qr-subtable').getByRole('button',{name:/^查看 .*说明书/}).click();await page.locator('.qr-detail-page').waitFor();await shot('qr-detail');
 await nav('外发资料');await page.getByLabel('品牌',{exact:true}).selectOption('1');await page.getByLabel('产品',{exact:true}).selectOption('1');await page.getByLabel('资料批次',{exact:true}).selectOption({index:1});
 await page.getByRole('button',{name:'预览文件',exact:true}).click();await page.getByRole('table',{name:'外发文件预览'}).waitFor();
 await shot('outbound');
 await nav('迁移检查');
 const rows=Array.from({length:23},()=>Array(14).fill(null));
 rows[20]=['品类尺寸',null,null,null,null,'品牌字典',null,null,null,null,null,null,null,null];
 rows[21]=['0209','ZC200冰柜',null,null,'01','品牌甲',null,null,null,null,null,null,null,null];
 rows[22]=['0209','ZC220冰柜',null,null,'03','品牌乙',null,null,null,null,null,null,null,null];
 const buffer=await writeXlsxFile([{sheet:'新版图号',data:rows}]).toBuffer();
 await page.getByLabel('选择 Excel 文件').setInputFiles({name:'隔离检查.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer});
 await page.getByRole('button',{name:'开始检查'}).click();await page.getByRole('table',{name:'迁移问题工作表'}).waitFor();await shot('migration');
 await page.getByRole('button',{name:'查看原因'}).first().click();await shot('migration-detail');
 await page.getByRole('button',{name:'安全恢复',exact:true}).click();await shot('recovery');
 console.log(JSON.stringify({widths:[1080,1200,1280],blockedWrites:blocked,screenshotDirectory:dir}));
}finally{await browser.close();}
