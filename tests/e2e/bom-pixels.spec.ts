import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {deflateSync} from 'node:zlib';
import {createServer} from 'vite';
import {expect,test} from '@playwright/test';
import {startServer} from '../../src/server/start-server';
import {openDatabase} from '../../src/db/database';
import {DictionaryService} from '../../src/core/dictionaries/dictionary-service';
import {ProductService} from '../../src/core/products/product-service';
import {PlanningService} from '../../src/core/planning/planning-service';
import {BomAssetService} from '../../src/core/bom/bom-asset-service';
import {BomService} from '../../src/core/bom/bom-service';

function chunk(type:string,data:Buffer){
 const content=Buffer.concat([Buffer.from(type),data]),header=Buffer.alloc(4),crc=Buffer.alloc(4);header.writeUInt32BE(data.length);
 let value=0xffffffff;for(const byte of content){value^=byte;for(let bit=0;bit<8;bit++)value=(value>>>1)^((value&1)?0xedb88320:0);}crc.writeUInt32BE((value^0xffffffff)>>>0);
 return Buffer.concat([header,content,crc]);
}
function png(red=30,note='',alpha=128){
 const header=Buffer.alloc(13);header.writeUInt32BE(2,0);header.writeUInt32BE(1,4);header[8]=8;header[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),...(note?[chunk('tEXt',Buffer.from(`Comment\0${note}`))]:[]),chunk('IDAT',deflateSync(Buffer.from([0,red,60,90,255,60,90,120,alpha]))),chunk('IEND',Buffer.alloc(0))]);
}
test('compares real decoded PNG pixels through saved BOM history without altering source images or history',async({page})=>{
 const data=mkdtempSync(join(tmpdir(),'bom-pixels-')),root=join(data,'library');mkdirSync(root);writeFileSync(join(data,'settings.json'),JSON.stringify({workspaceRoot:root}));
 const server=await startServer({port:0,dataDir:data,allowedOrigins:['http://127.0.0.1:5174']});
 const vite=await createServer({configFile:'vite.config.ts',server:{host:'127.0.0.1',port:5174,strictPort:true,proxy:{'/api':server.url}}});
 const db=openDatabase(join(data,'planner.db'));
 try{
  const dict=new DictionaryService(db),brand=dict.create({type:'brand',code:'02',name:'SAMKYO'}),size=dict.create({type:'product_size',code:'0101',name:'洗碗机'}),appearance=dict.create({type:'appearance',code:'01',name:'标准外观'}),color=dict.create({type:'color',code:'0',name:'白色'}),main=dict.create({type:'main_category',code:'02',name:'铭牌类'}),project=dict.create({type:'project_item',code:'01',name:'铭牌',parentId:main.id});
  const product=new ProductService(db).create({sku:'SKDWT040JP',model:'T40',brandId:brand.id,productSizeId:size.id,defaultAppearanceId:appearance.id,productCategory:'洗碗机'});
  const plan=new PlanningService(db),input={productId:product.id,rows:[{clientId:'bom-image',colorId:color.id,mainCategoryId:main.id,projectItemId:project.id}]};
  const checked=plan.preview(input),drawing=plan.reserve({...input,rows:[{...input.rows[0],expectedFullCode:checked.rows[0].fullCode}]})[0];
  const sources=[png(),png(30,'different metadata'),png(30,'',127),png(31,'',127)],paths=sources.map((bytes,i)=>{const path=join(data,`source-${i}.png`);writeFileSync(path,bytes);return path;});
  expect(sources[0].equals(sources[1])).toBe(false);
  const assets=new BomAssetService(db,root),bom=new BomService(db,()=>root);let previous:number|null=null;
  const versions=paths.map((path,i)=>{const asset=assets.import({sourcePath:path,sku:product.sku!,model:product.model});const saved=bom.saveVersion({productId:product.id,businessChangeDate:`2026-11-${10+i}`,expectedCurrentVersionId:previous,items:[{projectItemId:project.id,drawingId:drawing.id,usesWhiteMaterial:false,assets:[{role:'image',assetId:asset.id}]}]}).version;previous=saved.id;return saved;});
  const facts=()=>['bom_versions','bom_items','bom_item_assets','bom_assets','drawing_numbers'].map(table=>db.prepare(`select * from ${table} order by rowid`).all());const before=facts();
  await vite.listen();await page.setViewportSize({width:1920,height:1080});await page.goto('http://127.0.0.1:5174/');
  await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'BOM 管理',exact:true}).click();await page.getByRole('button',{name:'查询 BOM',exact:true}).click();
  await expect(page.getByRole('button',{name:`查看 BOM ${versions[1].id}`,exact:true})).toBeVisible();
  const headers=await page.locator('.bom-history-table').getByRole('columnheader').allTextContents();expect(headers.indexOf('产品类别')).toBeGreaterThanOrEqual(0);expect(headers.indexOf('产品类别')+1).toBe(headers.indexOf('型号'));
  await page.getByRole('button',{name:`查看 BOM ${versions[1].id}`,exact:true}).click();
  await expect(page.getByRole('button',{name:/项目 1 · 铭牌.*未变化/})).toBeVisible();
  await page.getByRole('button',{name:'全部字段',exact:true}).click();await page.getByText('图片像素一致',{exact:true}).scrollIntoViewIfNeeded();
  const evidence=join(process.cwd(),'work','v16-corrections','evidence');mkdirSync(evidence,{recursive:true});await page.screenshot({path:join(evidence,'bom-same-pixels-different-encoding.png'),fullPage:true});
  await page.getByRole('button',{name:`查看 BOM ${versions[2].id}`,exact:true}).click();
  await expect(page.getByRole('button',{name:/项目 1 · 铭牌.*修改/})).toBeVisible();await expect(page.getByText('图片像素不同 · 替换',{exact:true})).toBeVisible();
  await page.screenshot({path:join(evidence,'bom-different-alpha-pixels.png'),fullPage:true});
  await page.getByRole('button',{name:`查看 BOM ${versions[3].id}`,exact:true}).click();await expect(page.getByRole('button',{name:/项目 1 · 铭牌.*修改/})).toBeVisible();await expect(page.getByText('图片像素不同 · 替换',{exact:true})).toBeVisible();
  await page.screenshot({path:join(evidence,'bom-different-pixels.png'),fullPage:true});
  expect(facts()).toEqual(before);paths.forEach((path,i)=>expect(readFileSync(path)).toEqual(sources[i]));expect(db.pragma('foreign_key_check')).toEqual([]);
 }finally{await vite.close();await server.close();db.close();rmSync(data,{recursive:true,force:true});}
});
