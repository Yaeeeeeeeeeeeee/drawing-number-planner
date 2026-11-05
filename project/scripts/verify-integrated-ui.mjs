import {chromium} from '@playwright/test';
import fs from 'node:fs';
import writeXlsxFile from 'write-excel-file/node';
const dir='C:/Users/Administrator/Documents/Codex/integrated-ui-shots';
fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
const page=await browser.newPage();
const base='http://127.0.0.1:5187';
await page.goto(base);
if(!(await page.request.get(base+'/api/products')).ok())throw Error('Real API unavailable');
async function nav(name){await page.locator('.sidebar nav').getByRole('button',{name}).click();await page.waitForTimeout(300);}
async function shot(key){
 await page.waitForTimeout(300);
 for(const width of [1080,1200,1280]){
  await page.setViewportSize({width,height:900});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error(key+' overflow '+width);
  await page.screenshot({path:dir+'/'+key+'-'+width+'.png',fullPage:true});
 }
}
await nav('图号库');await page.getByText('02.0404.010.0401002',{exact:true}).waitFor();await shot('drawings-populated');
await nav('编码字典');await page.getByRole('tab',{name:'主类别'}).click();await page.getByRole('button',{name:'查看 印刷件类 的项目明细'}).click();await shot('dictionary-populated');
await nav('产品档案');await page.getByRole('button',{name:'详情 F60'}).click();await shot('products-detail');
await page.getByRole('button',{name:'删除档案 F60'}).click();await page.getByRole('heading',{name:'关联检查与退出指引'}).waitFor();await shot('products-preflight');
await nav('BOM 管理');await page.getByLabel('BOM 产品型号').selectOption('1');await page.getByText('铜版纸',{exact:true}).first().waitFor();await shot('bom-populated');
await nav('PDF 文件中心');await page.getByText('9 个索引文件',{exact:true}).waitFor();await shot('files-populated');
await nav('二维码管理');await page.getByText('PREVIEWF60',{exact:false}).first().waitFor();await shot('qr-populated');
await nav('外发资料');await page.getByLabel('品牌',{exact:true}).selectOption('1');await page.getByLabel('产品',{exact:true}).selectOption('1');await page.getByLabel('资料批次',{exact:true}).selectOption({index:1});await page.getByRole('button',{name:'预览文件',exact:true}).click();await page.getByRole('table',{name:'外发文件预览'}).waitFor();await shot('outbound-populated');
await page.getByRole('button',{name:'邮件撰写',exact:true}).click();await shot('mail');
await nav('迁移检查');
const rows=Array.from({length:23},()=>Array(14).fill(null));rows[20]=['品类尺寸',null,null,null,null,'品牌字典',null,null,null,null,null,null,null,null];rows[21]=['0209','ZC200冰柜',null,null,'01','品牌甲',null,null,null,null,null,null,null,null];rows[22]=['0209','ZC220冰柜',null,null,'03','品牌乙',null,null,null,null,null,null,null,null];
const buffer=await writeXlsxFile([{sheet:'新版图号',data:rows}]).toBuffer();
await page.getByLabel('选择 Excel 文件').setInputFiles({name:'隔离检查.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer});
await page.getByRole('button',{name:'开始检查'}).click();await page.getByRole('button',{name:/异常明细/}).waitFor();await shot('migration-report');
await nav('图号规划 / 更新包材');await page.getByLabel('产品型号',{exact:true}).selectOption('1');await page.getByLabel('第 1 行主类别').selectOption('5');await page.getByLabel('第 1 行项目明细').selectOption('6');await page.getByLabel('第 1 行颜色').selectOption('4');await page.getByRole('button',{name:'查重并预览',exact:true}).click();await page.getByRole('button',{name:'确认批量占号'}).waitFor();await shot('planning-real-preview');
await page.getByRole('button',{name:'确认批量占号'}).click();await page.getByText('已成功占用 1 个图号 · 正式保存').waitFor();await shot('planning-real-saved');
await page.getByRole('button',{name:'安全恢复',exact:true}).click();await shot('recovery-browser');
console.log('Real API populated reads, workbook audit and isolated reservation passed; 3 widths captured');
await browser.close();
