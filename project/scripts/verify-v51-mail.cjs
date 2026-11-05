// Shared real HTTP/DOM acceptance; every file/database belongs to an isolated test workspace.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createRequire}=require('node:module'),{createHash}=require('node:crypto');
module.exports=async function verifyV51({page,app,source,workspace,output,evidence,writePdf,snapshot,databaseFile,go}){
 page.setDefaultTimeout(15000);
 if(app){await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1920,1080));await page.waitForFunction(()=>innerWidth===1920);}
 const request=(route,body,method='POST')=>page.evaluate(async({route,body,method})=>{
  const token=(await(await fetch('/api/session',{method:'POST'})).json()).token;
  const response=await fetch(route,{method,headers:{'content-type':'application/json','x-planner-token':token},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const value=await response.json();if(!response.ok)throw Error(route+': '+JSON.stringify(value));return value;
 },{route,body,method});
 const get=route=>request(route,undefined,'GET'),items=value=>value.items??value;
 const dictionary=async(type,code,name,parentId)=>{const old=items(await get(`/api/dictionaries/${type}?includeInactive=false`)).find(item=>item.code===code&&(parentId==null||item.parentId===parentId));return old??request(`/api/dictionaries/${type}`,{code,name,...(parentId?{parentId}:{})});};
 const brand=await dictionary('brand','88','V51验收品牌'),size=await dictionary('product_size','8888','验收品类'),appearance=await dictionary('appearance','88','验收外观');
 const main=await dictionary('main_category','88','V51印刷件');await dictionary('project_item','01','V51铭牌',main.id);await dictionary('project_item','02','V51说明书',main.id);
 const product=await request('/api/products',{sku:'V51TEST',model:'V51MODEL',productCategory:'V51验收品类',brandId:brand.id,productSizeId:size.id,defaultAppearanceId:appearance.id});
 const code='88.8888.880.8801001',manualCode='88.8888.880.8802001';
 const productRoot=path.join(workspace,'V51验收品类','V51TEST-V51MODEL','03.量产后的变更文件（已量产的产品看最新日期）');
 const original=[];
 for(const [batch,fullCode,item,text]of [['00.首批大货',code,'铭牌','nameplate before'],['00.首批大货',manualCode,'说明书','manual unchanged'],['01.20261027',code,'铭牌','nameplate after'],['01.20261027',manualCode,'说明书','manual unchanged']]){
  const file=path.join(productRoot,batch,`${fullCode}-V51MODEL-${item}（转曲）.pdf`);writePdf(file,text);original.push({file,hash:createHash('sha256').update(fs.readFileSync(file)).digest('hex')});
 }
 await request('/api/files/settings',{workspaceRoot:workspace},'PUT');await go(page,'PDF 文件中心');await page.getByRole('button',{name:'扫描资料库',exact:true}).click();await page.getByText('资料库扫描完成',{exact:true}).waitFor({timeout:45000});
 const batches=items(await get(`/api/material-batches?productId=${product.id}`));const batch=batches.find(item=>item.name.includes('20261027'));assert.ok(batch);
 const input={workflowVersion:2,productId:product.id,selectedMaterialBatchId:batch.id,materialType:'update',packageMode:'change_only'};
 let preview=await request('/api/outbound-packages/preview',input);assert.equal(preview.items.length,1);assert.equal(preview.items[0].fullCode,code);assert.equal(preview.items[0].selectable,false);
 const label=preview.items[0];const confirmed={...input,fileConfirmations:[{pdfFileId:label.pdfFileId,reason:'已逐页核对铭牌实际变化',contentSha256:label.contentSha256}]};
 const ready=await request('/api/outbound-packages/preview',confirmed);assert.equal(ready.items[0].selectable,true);
 const before=snapshot(databaseFile);
 const dep=createRequire(path.join(source,'package.json'));const writeXlsx=dep('write-excel-file/node');const {expect}=dep('@playwright/test');
 fs.mkdirSync(evidence,{recursive:true});const workbook=path.join(evidence,'V51-隔离结构验收-邮件模板.xlsx');
 const sheets=[{sheet:'首批包材资料',data:[['厂家','V51隔离厂家','V51隔离厂家'],['场景','缺铭牌','完整交付'],['主题','首批资料','首批完整资料'],['正文','请查收首批资料。','请查收完整资料。']]},{sheet:'更新包材资料',data:[['厂家','V51隔离厂家'],['场景','更新资料'],['联系人','V51联系人'],['收件人','v51-to@example.test'],['抄送人','v51-cc@example.test'],['主题','{{brand}} {{model}} 更新资料'],['正文','{{contact_salutation}}，您好！\n请查收 {{brand}} {{model}} {{category}} 的更新资料。\n本次修改的内容为：\n{{change_files}}\n附件：{{package_files}}\n批次：{{batch}}\n日期：{{date}}\n分包：{{count}}']]},{sheet:'ITR',data:[['此场景不应导入包材外发模板']]}];
 await writeXlsx(sheets.map(sheet=>({...sheet,data:sheet.data.map(row=>row.map(value=>({value,type:String})))}))).toFile(workbook);
 await go(page,'迁移检查');await page.getByRole('button',{name:'导入邮件模板',exact:true}).click();const modal=page.getByRole('dialog',{name:'导入邮件模板',exact:true});await modal.getByLabel('邮件模板 Excel',{exact:true}).setInputFiles(workbook);await modal.getByRole('button',{name:'识别并预览',exact:true}).click();await modal.getByText('ITR：未支持，不导入',{exact:true}).waitFor();assert.equal(await modal.locator('fieldset').count(),3);
 assert.equal(items(await get('/api/outbound-reference/templates')).filter(item=>item.manufacturer==='V51隔离厂家').length,0);
 await modal.getByLabel('选择模板 3',{exact:true}).check();await modal.getByLabel('已确认联系人关联 3',{exact:true}).check();await modal.getByLabel('已核对固定话术、动态信息及历史示例 3',{exact:true}).check();await page.screenshot({path:path.join(evidence,'V51-邮件模板导入预览.png')});
 await modal.getByRole('button',{name:'确认导入所选模板',exact:true}).click();await modal.getByText('新增 1 条，更新 0 条，跳过 2 条；新增联系人 2 条',{exact:true}).waitFor();await modal.getByRole('button',{name:'关闭',exact:true}).click();
 const imported=items(await get('/api/outbound-reference/templates')).filter(item=>item.manufacturer==='V51隔离厂家');assert.equal(imported.length,1);
 await request('/api/outbound-reference/signatures',{name:'V51验收签名',content:'V51独立签名',isDefault:true});
 fs.mkdirSync(output,{recursive:true});
 if(app)await app.evaluate(({dialog},output)=>{globalThis.__v51OriginalOpenDialog=dialog.showOpenDialog;dialog.showOpenDialog=async()=>({canceled:false,filePaths:[output]});},output);
 else await page.evaluate(()=>{window.plannerDesktop={chooseOutboundDirectory:async()=>({ok:true})};});
 try{
  await go(page,'外发资料');await page.getByRole('combobox',{name:'品牌',exact:true}).selectOption(String(brand.id));await page.getByRole('combobox',{name:'产品类别',exact:true}).selectOption('V51验收品类');await page.getByRole('combobox',{name:'产品型号',exact:true}).selectOption(String(product.id));await page.getByRole('combobox',{name:'资料批次',exact:true}).selectOption(String(batch.id));await page.getByRole('combobox',{name:'打包资料类型',exact:true}).selectOption('update');await page.getByRole('combobox',{name:'打包模式',exact:true}).selectOption('change_only');await page.getByRole('button',{name:'预览文件',exact:true}).click();await page.getByText(label.fileName,{exact:true}).first().waitFor();
  assert.equal(await page.getByRole('table',{name:'外发文件预览',exact:true}).locator('tbody input[type=checkbox]').count(),1);
  await page.getByRole('button',{name:'查看',exact:true}).first().click();const detail=page.getByRole('dialog',{name:'外发文件详情',exact:true});await detail.getByLabel('人工确认依据',{exact:true}).fill('已逐页核对铭牌实际变化');await detail.getByRole('button',{name:'记录确认并重新预览',exact:true}).click();await page.getByRole('button',{name:'预览文件',exact:true}).click();
  const selected=page.getByRole('table',{name:'外发文件预览',exact:true}).locator('tbody input[type=checkbox]').first();await selected.waitFor();await expect(selected).toBeEnabled();await selected.setChecked(true);
  await page.getByRole('button',{name:'生成压缩包',exact:true}).click();const preflight=page.getByRole('dialog',{name:'外发预检',exact:true});await preflight.getByRole('button',{name:'确认生成',exact:true}).click();await page.getByRole('button',{name:'生成邮件草稿',exact:true}).waitFor();await page.getByRole('button',{name:'生成邮件草稿',exact:true}).click();
  await page.getByRole('combobox',{name:'适用厂家',exact:true}).selectOption('V51隔离厂家');await page.getByRole('combobox',{name:'邮件场景',exact:true}).selectOption('更新资料');
  const reason=page.getByLabel('修改原因 V51铭牌',{exact:true});await reason.waitFor();await reason.fill('核对后的本次具体修改内容');
  await page.waitForFunction(()=>document.querySelector('[aria-label="正文"]')?.value.includes('核对后的本次具体修改内容'));const body=await page.getByLabel('正文',{exact:true}).inputValue();assert.ok(body.includes(label.fileName));assert.ok(!body.includes('说明书'));assert.equal(body.split('V51独立签名').length,2);assert.ok(!body.includes('{{'));assert.equal(await page.getByLabel('收件人文本',{exact:true}).inputValue(),'v51-to@example.test');
  await page.getByLabel('收件人文本',{exact:true}).fill('v51-edit@example.test');await page.getByLabel('正文',{exact:true}).fill(body+'\n人工直接补充');await reason.fill('修改说明再次调整');assert.ok((await page.getByLabel('正文',{exact:true}).inputValue()).endsWith('人工直接补充'));
  await page.screenshot({path:path.join(evidence,'V51-真实ZIP邮件草稿.png')});
  const history=items(await get(`/api/outbound-packages?productId=${product.id}`));assert.equal(history.length,1);const frozen=await get(`/api/outbound-packages/${history[0].id}`);assert.equal(frozen.files.length,1);assert.equal(frozen.files[0].pdfFileId,label.pdfFileId);const zip=path.join(output,history[0].zipRelativePath);assert.ok(fs.existsSync(zip));const zipHash=createHash('sha256').update(fs.readFileSync(zip)).digest('hex');
  await page.getByLabel('主题',{exact:true}).fill('最终人工主题');
  if(!app)await page.context().grantPermissions(['clipboard-read','clipboard-write'],{origin:new URL(page.url()).origin});
  // Windows native clipboard uses CRLF; DOM textarea values use LF. Compare text with line endings normalized only.
  const readClipboard=async()=>String(await(app?app.evaluate(({clipboard})=>clipboard.readText()):page.evaluate(()=>navigator.clipboard.readText()))).replace(/\r\n/g,'\n');
  await page.getByRole('button',{name:'复制正文',exact:true}).click();await page.getByRole('status').filter({hasText:'已复制'}).waitFor();await expect.poll(readClipboard).toBe(await page.getByLabel('正文',{exact:true}).inputValue());
  await page.getByRole('button',{name:'复制主题',exact:true}).click();await expect.poll(readClipboard).toBe('最终人工主题');
  await page.getByRole('button',{name:'复制邮件内容',exact:true}).click();await expect.poll(readClipboard).toContain('v51-edit@example.test');const fullMail=await readClipboard();assert.ok(fullMail.includes('v51-edit@example.test')&&fullMail.includes('最终人工主题')&&fullMail.includes('人工直接补充'));
  assert.equal(createHash('sha256').update(fs.readFileSync(zip)).digest('hex'),zipHash);assert.deepEqual(await get(`/api/outbound-packages/${history[0].id}`),frozen);
  const after=snapshot(databaseFile);for(const table of ['drawing_numbers','historical_drawing_numbers','bom_versions','bom_items','product_qr_codes'])assert.deepEqual(after[table],before[table],`${table} must remain unchanged`);
  for(const prior of before.outbound_packages??[])assert.deepEqual(after.outbound_packages.find(item=>item.id===prior.id),prior);for(const file of original)assert.equal(createHash('sha256').update(fs.readFileSync(file.file)).digest('hex'),file.hash);
  return{actualHttpAndDom:true,realXlsx:true,fixtureWorkbookOnly:true,sheets:3,supportedSheets:2,recognizedTemplates:3,importedTemplates:1,contactsCreated:2,exactSelectedZipFileCount:1,changedNameplateOnly:true,reasonSynchronizes:true,directBodyEditPreserved:true,signatureOnce:true,actualClipboardCopy:true,originalPdfHashesPreserved:4,protectedRowsUnchanged:true,zipAndSnapshotsUnchangedByDraft:true};
 }finally{if(app)await app.evaluate(({dialog})=>{dialog.showOpenDialog=globalThis.__v51OriginalOpenDialog;delete globalThis.__v51OriginalOpenDialog;});}
};
