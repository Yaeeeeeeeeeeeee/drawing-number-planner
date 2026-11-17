import { expect, test } from '@playwright/test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'vite';
import { startServer } from '../../src/server/start-server';
import { join } from 'node:path';
import { openDatabase } from '../../src/db/database';
import { OutboundPackageService } from '../../src/core/outbound/outbound-package-service';

test('restores and saves a real SQLite draft through the browser after reload', async ({page}) => {
  const dataDir=mkdtempSync(join(tmpdir(),'outbound-draft-browser-')),workspace=join(dataDir,'library');mkdirSync(workspace);writeFileSync(join(dataDir,'settings.json'),JSON.stringify({workspaceRoot:workspace}));
  const server=await startServer({port:0,dataDir,allowedOrigins:['http://127.0.0.1:5174']});
  const vite=await createServer({configFile:'vite.config.ts',server:{host:'127.0.0.1',port:5174,strictPort:true,proxy:{'/api':server.url}}});
  const db=openDatabase(join(dataDir,'planner.db'));
  try{
  const now='2026-11-16T12:00:00.000Z';
  const insert=(type:string,code:string,name:string,parent:number|null=null)=>Number(db.prepare("insert into dictionary_items(type,code,name,parent_id,status,created_at) values(?,?,?,?,'active',?)").run(type,code,name,parent,now).lastInsertRowid);
  const brand=insert('brand','88','草稿验收');const size=insert('product_size','8888','草稿产品');const appearance=insert('appearance','88','标准');const color=insert('color','8','颜色');const main=insert('main_category','88','印刷');const project=insert('project_item','88','说明书',main);
  const productId=Number(db.prepare("insert into products(brand_id,product_size_id,default_appearance_id,sku,model,product_category,status,created_at) values(?,?,?,'DRAFT88','MODEL88','草稿产品','active',?)").run(brand,size,appearance,now).lastInsertRowid);
  const batchId=Number(db.prepare("insert into material_batches(relative_path,product_directory,product_id,name,sequence_number,recognition_status,is_present,first_seen_at,last_seen_at) values('草稿/DRAFT88/批次','草稿/DRAFT88',?,'批次',0,'recognized',1,?,?)").run(productId,now,now).lastInsertRowid);
  const drawing=Number(db.prepare("insert into drawing_numbers(full_code,display_name,product_id,appearance_id,color_id,main_category_id,project_item_id,brand_code,product_size_code,appearance_code,color_code,main_category_code,project_item_code,sequence,status,created_at) values('88.8888.888.8888001','说明书',?,?,?,?,?,'88','8888','88','8','88','88',1,'active',?)").run(productId,appearance,color,main,project,now).lastInsertRowid);
  const rel='草稿/DRAFT88/批次/说明书（转曲）.pdf';mkdirSync(join(workspace,'草稿/DRAFT88/批次'),{recursive:true});writeFileSync(join(workspace,rel),'%PDF-1.4\nfixture\n%%EOF\n');
  const pdfId=Number(db.prepare("insert into pdf_files(relative_path,path_key,material_batch_id,file_name,drawing_id,match_status,detected_codes_json,conversion_type,size_bytes,modified_at,scanned_at,is_present,content_sha256) values(?,lower(?),?,'说明书（转曲）.pdf',?,'matched','[]','outlined',23,?,?,1,'fixture')").run(rel,rel,batchId,drawing,now,now).lastInsertRowid);
  const service=new OutboundPackageService(db,{workspaceRoot:()=>workspace,outputRoot:()=>join(dataDir,'exports')});
  const request={productId,selectedMaterialBatchId:batchId,materialType:'initial' as const,packageMode:'current_complete' as const};const preview=service.previewPackage(request);const result=await service.createPackage({...request,previewToken:preview.previewToken,selectedPdfFileIds:[pdfId]});
  const facts=result.mailFacts!;const context={packageId:result.id,createdAt:result.createdAt,selectedMaterialBatchId:batchId,packageName:result.packageName,packageFiles:[result.zipRelativePath],product:{...facts.product},batchName:facts.batchName,materialType:facts.materialType,items:facts.items};
  service.saveEmailDraft({packageId:result.id,context,to:'before@example.com',cc:'cc@example.com',subject:'原主题',body:'原正文'});db.close();
  await vite.listen();await page.goto('http://127.0.0.1:5174/');await page.getByRole('button',{name:/外发资料/}).click();await page.getByText('编辑邮件草稿',{exact:true}).click();
  await page.getByRole('button',{name:'恢复已保存草稿'}).click();await expect(page.getByLabel('主题',{exact:true})).toHaveValue('原主题');
  await page.getByLabel('主题',{exact:true}).fill('浏览器修改主题');await page.getByLabel('正文',{exact:true}).fill('浏览器修改正文');await page.getByRole('button',{name:'保存草稿',exact:true}).click();await expect(page.getByText('草稿已保存')).toBeVisible();
  await page.reload();await page.getByRole('button',{name:/外发资料/}).click();await page.getByText('编辑邮件草稿',{exact:true}).click();await page.getByRole('button',{name:'恢复已保存草稿'}).click();
  await expect(page.getByLabel('主题',{exact:true})).toHaveValue('浏览器修改主题');await expect(page.getByLabel('正文',{exact:true})).toHaveValue('浏览器修改正文');await expect(page.getByLabel('收件人文本')).toHaveValue('before@example.com');
  }finally{if(db.open)db.close();await vite.close();await server.close();rmSync(dataDir,{recursive:true,force:true});}
});
