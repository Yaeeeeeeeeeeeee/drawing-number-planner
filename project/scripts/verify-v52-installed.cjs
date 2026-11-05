// Shared browser/installed-Electron acceptance. Only anonymous fixtures and caller-owned temporary data.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createRequire}=require('node:module'),{createHash}=require('node:crypto');
const production='03.量产后的变更文件（已量产的产品看最新日期）';
const {deflateSync,crc32}=require('node:zlib');
function png(red){
 const chunk=(name,data)=>{const type=Buffer.from(name),size=Buffer.alloc(4),crc=Buffer.alloc(4);size.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([type,data])));return Buffer.concat([size,type,data,crc]);};
 const info=Buffer.alloc(13);info.writeUInt32BE(2,0);info.writeUInt32BE(2,4);info[8]=8;info[9]=6;
 const pixels=Buffer.from([0,red,30,90,255,red,30,90,255,0,red,30,90,255,red,30,90,255]);
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',info),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}

const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function matrixWorkbook(writeXlsx,file){
 // Kept structurally identical to tests/fixtures/email-template-matrix.ts for native CJS execution.
 const signature='Best regards,\nExample Author\nExample Team\nTel: 000';
 const sheets=['首批包材资料','更新包材资料'].map((sheet,sheetIndex)=>{
  const rows=Array.from({length:sheetIndex?11:14},()=>Array(11).fill(null));
  const cell=(row,column,value,span=1)=>{rows[row-1][column-1]={value,type:String,...(span>1?{columnSpan:span}:{})};};
  cell(1,1,'主体');cell(1,2,'时间');cell(2,1,'Template');cell(7,1,'邮件收件人');rows[6][0].rowSpan=2;cell(9,1,'邮件抄送人');cell(10,1,'邮件主题');
  ['缺铭牌','补铭牌','正铭牌','完整交付'].slice(0,sheetIndex?1:4).forEach((scenario,index)=>cell(11+index,1,sheetIndex?'邮件内容（历史案例）':`邮件内容（${scenario}）`));
  for(let supplier=0;supplier<5;supplier++){
   const col=2+supplier*2;cell(2,col,`供应商${supplier+1}`,2);
   ['品牌','型号','产品'].forEach((label,index)=>{cell(3+index,col,label);cell(3+index,col+1,['DemoBrand','M123','DemoProduct'][index]);});
   cell(6,col,'M123-2025-01-01-PO123.zip',2);cell(7,col,`${['a','c','d','e','f'][supplier]}@example.com`,2);
   if(supplier===0||(sheetIndex&&supplier===2))cell(8,col,`${supplier===0?'b':'g'}@example.com`,2);
   cell(9,col,(sheetIndex&&supplier===3?['k','j','i','h','e','l','m','n']:['h','i','j','k','h']).map(name=>`Review ${name} <${name}@example.com>`).join('; '),2);
   cell(10,col,'DemoBrand M123 DemoProduct 2025-01-01 PO123资料',2);
   for(let scenario=0;scenario<(sheetIndex?1:4);scenario++)cell(11+scenario,col,`${sheetIndex?`历史原因${supplier+1}，旧文件${supplier+1}.pdf`:scenario<2?'请查收资料。':`请查收场景${scenario}资料。`}\n\n${signature}`,2);
  }
  return{sheet,data:rows};
 });
 await writeXlsx([...sheets,...['配件','ITR'].map(sheet=>({sheet,data:[[{value:'忽略',type:String}]]}))]).toFile(file);
}
module.exports=async function verifyV52({page,app,source,workspace,evidence,writePdf,snapshot,databaseFile,go}){
 const dep=createRequire(path.join(source,'package.json')),{expect}=dep('@playwright/test');
 fs.mkdirSync(evidence,{recursive:true});page.setDefaultTimeout(15000);const originalPdfLayout=await page.evaluate(()=>localStorage.getItem('table-layout:v1:pdf-files'));
 const request=(route,body,method='POST')=>page.evaluate(async({route,body,method})=>{
  const token=(await(await fetch('/api/session',{method:'POST'})).json()).token;
  const response=await fetch(route,{method,headers:{'content-type':'application/json','x-planner-token':token},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const result=await response.json();if(!response.ok)throw Error(route+': '+JSON.stringify(result));return result;
 },{route,body,method});
 const get=route=>request(route,undefined,'GET'),items=result=>result.items??result;
 const dictionary=async(type,code,name,parentId)=>items(await get(`/api/dictionaries/${type}`)).find(item=>item.code===code&&(parentId==null||item.parentId===parentId))??request(`/api/dictionaries/${type}`,{code,name,...(parentId?{parentId}:{})});
 const brand=await dictionary('brand','87','V52验收品牌'),size=await dictionary('product_size','8787','V52验收品类'),appearance=await dictionary('appearance','87','V52外观'),color=await dictionary('color','7','V52颜色');
 const main=await dictionary('main_category','87','V52印刷件'),project=await dictionary('project_item','01','V52铭牌',main.id);
 const product=await request('/api/products',{sku:'V52TEST',model:'V52MODEL',productCategory:'V52验收品类',brandId:brand.id,productSizeId:size.id,defaultAppearanceId:appearance.id});
 const plan={productId:product.id,rows:[{clientId:'v52',colorId:color.id,mainCategoryId:main.id,projectItemId:project.id}]};
 const planned=await request('/api/planning/preview',plan),drawing=items(await request('/api/planning/reserve',{...plan,rows:plan.rows.map(row=>({...row,expectedFullCode:planned.rows[0].fullCode}))}))[0];
 await request(`/api/drawings/${drawing.id}/activate`,{confirmed:true});
 const productRoot=path.join(workspace,product.productCategory,`${product.sku}-${product.model}`),original=[];
 const pdf=(parts,text)=>{const file=path.join(productRoot,...parts);writePdf(file,text);original.push({file,hash:sha(file)});return file;};
 const code=drawing.fullCode,sourcePdf=pdf(['02.未转曲源文件',`${code}-source.pdf`],'V52 source');
 pdf([production,'01.20261020',`${code}-old（转曲）.pdf`],'V52 historical');
 pdf([production,'03.20261028',`${code}-current（转曲）.pdf`],'V52 current');
 pdf([production,'02.20261027',`${code}-conflict-a（转曲）.pdf`],'V52 conflict A');
 pdf([production,'02.20261027',`${code}-conflict-b（转曲）.pdf`],'V52 conflict B');
 const excluded=[pdf(['01.旧资料',`${code}-excluded（转曲）.pdf`],'outside 01'),pdf(['03.量产后的变更文件',`${code}-alias（转曲）.pdf`],'outside old alias'),pdf([`${code}-root（转曲）.pdf`],'outside root')];
 await request('/api/files/settings',{workspaceRoot:workspace},'PUT');
 await go(page,'PDF 文件中心');await page.getByRole('button',{name:'扫描资料库',exact:true}).click();await page.getByText('资料库扫描完成',{exact:true}).waitFor({timeout:45000});
 const indexed=items(await get(`/api/files?productId=${product.id}&presence=all&pageSize=100`));assert.equal(indexed.length,5);assert.ok(indexed.every(file=>!excluded.some(excludedFile=>path.basename(excludedFile)===file.fileName)));
 const batches=items(await get(`/api/material-batches?productId=${product.id}`)),oldBatch=batches.find(batch=>batch.name.includes('20261020')),currentBatch=batches.find(batch=>batch.name.includes('20261028'));assert.ok(oldBatch&&currentBatch);
 const upload=async(name,red)=>page.evaluate(async({productId,name,bytes})=>{const token=(await(await fetch('/api/session',{method:'POST'})).json()).token;const form=new FormData();form.append('productId',String(productId));form.append('file',new Blob([new Uint8Array(bytes)],{type:'image/png'}),name);const response=await fetch('/api/boms/assets',{method:'POST',headers:{'x-planner-token':token},body:form});const result=await response.json();if(!response.ok)throw Error(JSON.stringify(result));return result.asset;},{productId:product.id,name,bytes:[...png(red)]});
 const imageA=await upload('v52-original.png',60),imageB=await upload('v52-replacement.png',180),diagram=await upload('v52-diagram.png',100);
 const item=batch=>({projectItemId:project.id,drawingId:drawing.id,usesWhiteMaterial:false,effectiveMaterialBatchId:batch.id});
 const first=(await request('/api/boms/versions',{productId:product.id,businessChangeDate:'2026-10-20',entryMode:'current',expectedCurrentVersionId:null,items:[{...item(oldBatch),assets:[{role:'image',assetId:imageA.id},{role:'diagram',assetId:diagram.id}]}]})).version;
 let second=(await request('/api/boms/versions',{productId:product.id,businessChangeDate:'2026-10-28',entryMode:'current',expectedCurrentVersionId:first.id,items:[{...item(currentBatch),assets:[{role:'image',assetId:imageB.id},{role:'diagram',assetId:diagram.id}]}]})).version;
 assert.equal(second.items[0].assets.find(asset=>asset.role==='image').contentSha256,imageB.contentSha256);assert.equal(second.items[0].assets.find(asset=>asset.role==='image').inherited,false);
 second=(await request(`/api/boms/versions/${second.id}`,{expectedRevision:second.editRevision,input:{productId:product.id,businessChangeDate:'2026-10-28',entryMode:'current',expectedCurrentVersionId:second.id,items:[{...item(currentBatch),assets:[{role:'image',reusePrevious:true},{role:'diagram',assetId:second.items[0].assets.find(asset=>asset.role==='diagram').assetId}]}]}},'PUT')).version;
 assert.equal(second.items[0].assets.find(asset=>asset.role==='image').contentSha256,imageA.contentSha256);assert.equal(second.items[0].assets.find(asset=>asset.role==='image').inherited,true);const inheritedImage=second.items[0].assets.find(asset=>asset.role==='image'),inheritanceRow=snapshot(databaseFile).bom_item_assets.find(row=>row.id===inheritedImage.id);assert.equal(inheritedImage.inheritedFromBomItemAssetId??JSON.parse(inheritanceRow.inheritance_snapshot_json).sourceLinkId,first.items[0].assets.find(asset=>asset.role==='image').id);assert.equal(second.items[0].assets.find(asset=>asset.role==='diagram').contentSha256,diagram.contentSha256);
 const assetHashes=[imageA,imageB,diagram].map(asset=>({file:path.join(workspace,asset.relativePath),hash:asset.contentSha256}));
 const unindexed=pdf([production,'04.20261030',`${code}-unindexed（转曲）.pdf`],'V52 read only observation');
 const beforeObservation=snapshot(databaseFile),detail=await get(`/api/drawings/${drawing.id}`);assert.deepEqual(snapshot(databaseFile),beforeObservation,'Drawing observation must not write indices or occupation');
 assert.equal(detail.fileObservation.source.entries.length,1);assert.equal(detail.fileObservation.source.entries[0].files[0].fileName,path.basename(sourcePdf));
 const observed=detail.fileObservation.outlined.entries;assert.deepEqual(observed.map(entry=>entry.businessDate),['2026-10-30','2026-10-28','2026-10-27','2026-10-20']);assert.equal(observed[0].files[0].indexed,false);assert.equal(observed[2].state,'conflict');assert.equal(observed.find(entry=>entry.batchId===currentBatch.id).usageState,'current');assert.equal(observed.find(entry=>entry.batchId===oldBatch.id).usageState,'historical');
 assert.equal(detail.firstBom.id,first.id);assert.equal(detail.firstBom.businessDate,'2026-10-20');
 const openDrawing=async()=>{await go(page,'图号库');await page.getByRole('textbox',{name:'关键词',exact:true}).fill(code);await page.getByRole('button',{name:'查询',exact:true}).click();await page.getByRole('button',{name:code,exact:true}).click();const panel=page.getByRole('complementary',{name:'图号详情',exact:true});await panel.waitFor();return panel;};
 let panel=await openDrawing();assert.equal(await panel.getByRole('combobox').count(),1);assert.equal(await panel.getByText('出现批次',{exact:true}).count(),0);await panel.getByRole('heading',{name:'03 BOM关联',exact:true}).waitFor();
 const outlined=panel.locator('.drawing-file-section').filter({has:page.getByRole('heading',{name:/转曲后文件/})});assert.equal(await outlined.locator('.drawing-file-row').count(),4);assert.equal(await outlined.locator('.drawing-file-row.conflict').getByRole('button').count(),0);await outlined.getByText('存在，未建索引',{exact:true}).waitFor();await outlined.getByText('当前批次',{exact:true}).waitFor();await outlined.getByText('历史批次',{exact:true}).first().waitFor();
 await page.screenshot({path:path.join(evidence,'V52-所有批次与冲突保护.png')});
 // First-BOM link must load the exact historical record and allow a date correction in place.
 await panel.getByRole('button',{name:`${product.model} · 2026-10-20`,exact:true}).click();await page.getByRole('heading',{name:'BOM 管理',exact:true}).waitFor();
 await page.getByRole('region',{name:'所选 BOM 记录',exact:true}).waitFor();await page.getByRole('button',{name:`编辑 BOM ${first.id}`,exact:true}).click();
 const date=page.getByLabel('业务变更日期',{exact:true});await expect(date).toHaveValue('2026-10-20');await expect(date).toBeEnabled();assert.equal(await page.getByLabel('录入类型',{exact:true}).count(),0);
 const protectedBefore=snapshot(databaseFile),secondBefore=await get(`/api/boms/versions/${second.id}`);
 await date.fill('2026-10-19');await page.getByRole('button',{name:'保存修改',exact:true}).click();await expect.poll(async()=>(await get(`/api/boms/versions/${first.id}`)).businessChangeDate).toBe('2026-10-19');
 const corrected=await get(`/api/boms/versions/${first.id}`);for(const field of ['id','createdAt','previousVersionId','versionNumber'])assert.equal(corrected[field],first[field]);assert.deepEqual(await get(`/api/boms/versions/${second.id}`),secondBefore);assert.equal((await get(`/api/boms/current?productId=${product.id}`)).version.id,second.id);
 const protectedAfter=snapshot(databaseFile);for(const table of ['outbound_packages','outbound_package_items','outbound_email_drafts'])assert.deepEqual(protectedAfter[table],protectedBefore[table]);
 await page.screenshot({path:path.join(evidence,'V52-精确BOM日期更正.png')});
 await page.getByRole('button',{name:'查询 BOM',exact:true}).click();assert.equal(await page.getByRole('region',{name:'查询 BOM',exact:true}).locator('form select').count(),3);
 // Move only our fixture source out and back to prove verified absence differs from inaccessible coverage.
 const held=sourcePdf+'.held';fs.renameSync(sourcePdf,held);
 try{const missing=await get(`/api/drawings/${drawing.id}`);assert.equal(missing.fileObservation.source.state,'missing');}finally{fs.renameSync(held,sourcePdf);}
 const unavailableRoot=workspace+'-v52-unavailable';fs.renameSync(workspace,unavailableRoot);
 try{const unknown=await get(`/api/drawings/${drawing.id}`);assert.equal(unknown.fileObservation.source.state,'unavailable');assert.equal(unknown.fileObservation.outlined.state,'unavailable');}finally{fs.renameSync(unavailableRoot,workspace);}
 // Native and browser run this exact anonymous 4-sheet matrix through the visible importer.
 const workbook=path.join(evidence,'V52-anonymous-matrix.xlsx');await matrixWorkbook(dep('write-excel-file/node'),workbook);
 const contact=await request('/api/outbound-reference/contacts',{company:'Preserved Company',contactName:'Preserved Name',email:'h@example.com',defaultRecipientType:'to'}),contactBefore=await get(`/api/outbound-reference/contacts/${contact.id}`);
 const defaultBefore=items(await get('/api/outbound-reference/signatures')).filter(signature=>signature.isDefault);
 const mailBefore=snapshot(databaseFile);await go(page,'迁移检查');await page.getByRole('button',{name:'导入邮件模板',exact:true}).click();
 let modal=page.getByRole('dialog',{name:'导入邮件模板',exact:true});await modal.getByLabel('邮件模板 Excel',{exact:true}).setInputFiles(workbook);
 const response=page.waitForResponse(response=>response.url().endsWith('/api/import/email-templates/preview')&&response.request().method()==='POST');await modal.getByRole('button',{name:'识别并预览',exact:true}).click();const preview=(await(await response).json()).report;
 await modal.getByText('首批包材资料：20 条',{exact:true}).waitFor();await modal.getByText('更新包材资料：5 条',{exact:true}).waitFor();assert.deepEqual(preview.sheets.map(sheet=>sheet.candidates),[20,5,0,0]);assert.equal(preview.candidates.length,25);assert.equal(preview.signatures.length,1);assert.equal(preview.signatures[0].sources.length,25);assert.equal(new Set(preview.candidates.flatMap(row=>row.contacts.map(contact=>contact.email))).size,14);assert.equal(preview.candidates.reduce((n,row)=>n+row.contacts.length,0),135);assert.equal(new Set(preview.candidates.map(row=>`${row.sheet}!${row.sourceCoordinates.body}`)).size,25);assert.ok(preview.candidates.every(row=>!row.bodyTemplate.includes('Example Author')&&!row.subjectTemplate.includes('PO123')));assert.deepEqual(snapshot(databaseFile),mailBefore,'Import preview is read-only');
 for(let index=1;index<=25;index++){await modal.getByLabel(`选择模板 ${index}`,{exact:true}).check();await modal.getByLabel(`已确认联系人关联 ${index}`,{exact:true}).check();await modal.getByLabel(`已核对固定话术、动态信息及历史示例 ${index}`,{exact:true}).check();}
 await modal.getByLabel('签名处理 1',{exact:true}).selectOption('create');await modal.getByLabel('签名名称 1',{exact:true}).fill('V52 reviewed source');await modal.getByLabel('已确认签名 1',{exact:true}).check();
 await page.screenshot({path:path.join(evidence,'V52-匿名矩阵25模板预览.png')});await modal.getByRole('button',{name:'确认导入所选模板',exact:true}).click();await modal.getByRole('status').filter({hasText:'新增 25 条，更新 0 条，跳过 0 条；新增联系人 13 条'}).waitFor();await modal.getByRole('button',{name:'关闭',exact:true}).click();
 let templates=items(await get('/api/outbound-reference/templates')).filter(template=>/^供应商[1-5]$/.test(template.manufacturer??''));assert.equal(templates.length,25);assert.equal(templates.reduce((n,row)=>n+row.contactLinks.length,0),135);assert.equal(new Set(templates.flatMap(template=>template.contactLinks.map(link=>link.contactId))).size,14);assert.deepEqual(await get(`/api/outbound-reference/contacts/${contact.id}`),contactBefore);
 const signatures=items(await get('/api/outbound-reference/signatures'));assert.deepEqual(signatures.filter(signature=>signature.isDefault),defaultBefore);assert.equal(signatures.find(signature=>signature.name==='V52 reviewed source').isDefault,false);
 for(const row of preview.candidates){const imported=templates.find(template=>template.importSources.some(source=>source.candidateId===row.id));assert.ok(imported);assert.equal(imported.importSources.length,1);assert.equal(imported.importSources[0].rawReference,row.rawReference);assert.deepEqual(imported.importSources[0].sourceCoordinates,row.sourceCoordinates);}
 const selected=templates.find(template=>template.materialType==='update');const sourceBefore=structuredClone(selected.importSources),sourceSignature=preview.signatures[0].content;
 const rendered=await request(`/api/outbound-reference/templates/${selected.id}/render`,{variables:{brand:'FutureBrand',model:'FutureModel',product_category:'FutureProduct',date:'2027-01-01',change_description:'New reason',file_list:'new.pdf',signature:sourceSignature}});assert.equal(rendered.body.split(sourceSignature).length,2);assert.ok(rendered.body.includes('New reason')&&rendered.body.includes('new.pdf'));assert.ok(!rendered.body.includes('历史原因'));
 await go(page,'外发资料');await page.getByRole('button',{name:'邮件配置',exact:true}).click();await page.getByRole('button',{name:`编辑模板 ${selected.name}`,exact:true}).click();
 const form=page.getByRole('form',{name:'邮件模板编辑',exact:true});const raw=form.locator('details').filter({has:page.locator('summary').filter({hasText:'导入来源与历史案例'})});await raw.locator('summary').click();await expect(raw).toContainText('历史原因');assert.equal(await raw.locator('input,textarea').count(),0);
 await form.getByLabel('正文模板',{exact:true}).fill(selected.bodyTemplate+'\nReviewed manual configuration');await form.getByRole('button',{name:'保存模板',exact:true}).click();await form.waitFor({state:'detached'});assert.deepEqual((await get(`/api/outbound-reference/templates/${selected.id}`)).importSources,sourceBefore);
 // Repeat import skips unchanged configurations and preserves manual text/source history.
 const again=await page.evaluate(async bytes=>{const token=(await(await fetch('/api/session',{method:'POST'})).json()).token;const form=new FormData();form.append('file',new Blob([new Uint8Array(bytes)]),'anonymous.xlsx');return(await fetch('/api/import/email-templates/preview',{method:'POST',headers:{'x-planner-token':token},body:form})).json();},[...fs.readFileSync(workbook)]);
 const skipped=await request('/api/import/email-templates/confirm',{previewId:again.previewId,rows:again.report.candidates.map(row=>({...row,action:'skip',confirmed:false,contactsConfirmed:false,historyReviewed:false}))});assert.equal(skipped.skipped,25);const manual=await get(`/api/outbound-reference/templates/${selected.id}`);assert.ok(manual.bodyTemplate.endsWith('Reviewed manual configuration'));assert.deepEqual(manual.importSources,sourceBefore);
 const mailAfter=snapshot(databaseFile);for(const table of ['drawing_numbers','historical_drawing_numbers','bom_versions','bom_items','outbound_packages','outbound_package_items','outbound_email_drafts','product_qr_codes'])assert.deepEqual(mailAfter[table],mailBefore[table],`${table} protected during mail configuration`);for(const file of [...original,...assetHashes])assert.equal(sha(file.file),file.hash);
 const geometry=[];
 for(const [label,selector,columns] of [['产品档案','.products-compact',['sku','model','brand']],['二维码管理','.qr-manual-page',['sku','model']],['PDF 文件中心','.files-page',['name','batch','drawing']]]){
  await go(page,label);const section=page.locator(selector),table=section.locator('table.layout-table').first();await table.waitFor();
  for(const width of [720,1366,1920,2560,3840]){
   if(app){await app.evaluate(({BrowserWindow},width)=>BrowserWindow.getAllWindows()[0].setContentSize(width,900),width);await page.waitForFunction(width=>innerWidth===width,width);}else await page.setViewportSize({width,height:900});
   await expect.poll(()=>section.evaluate(element=>{const workspace=element.closest('.workspace');return workspace.scrollWidth-workspace.clientWidth;})).toBeLessThanOrEqual(2);
   for(const key of columns){await expect(table.locator(`thead th[data-column-key="${key}"]`)).toHaveCSS('text-align','center');const cell=table.locator(`tbody td[data-column-key="${key}"]`).first();if(await cell.count())await expect(cell).toHaveCSS('text-align','center');}
   const metrics=await table.evaluate(element=>({width:innerWidth,table:element.getBoundingClientRect().width,container:element.closest('.table-wrap').clientWidth,sticky:getComputedStyle(element.closest('.page-surface').querySelector('.page-sticky-controls')).position,headerSticky:[...element.querySelectorAll('thead th')].every(th=>getComputedStyle(th).position==='sticky')}));assert.equal(metrics.sticky,'sticky');assert.equal(metrics.headerSticky,true);if(width>=1920)await expect.poll(()=>table.evaluate(element=>Math.abs(element.getBoundingClientRect().width-element.closest('.table-wrap').clientWidth))).toBeLessThan(2);geometry.push({label,...metrics});
  }
  if(app){await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1920,900));await page.waitForFunction(()=>innerWidth===1920);}else await page.setViewportSize({width:1920,height:900});
  await page.getByRole('button',{name:'恢复默认表格布局',exact:true}).click();
  await expect.poll(()=>table.evaluate(element=>Math.abs(element.getBoundingClientRect().width-element.closest('.table-wrap').clientWidth))).toBeLessThan(2);
  const before=await table.locator('thead th').evaluateAll(cells=>cells.map(cell=>({key:cell.dataset.columnKey,width:cell.getBoundingClientRect().width})));
  const key=columns[0];await table.locator(`thead th[data-column-key="${key}"]`).getByRole('separator').press('ArrowLeft');
  const after=await table.locator('thead th').evaluateAll(cells=>cells.map(cell=>({key:cell.dataset.columnKey,width:cell.getBoundingClientRect().width}))),changed=before.find(cell=>cell.key===key).width-after.find(cell=>cell.key===key).width;assert.ok(changed>0);assert.ok(Math.abs(after.at(-1).width-before.at(-1).width-changed)<2);for(const cell of after)if(cell.key!==key&&cell.key!==after.at(-1).key)assert.ok(Math.abs(cell.width-before.find(old=>old.key===cell.key).width)<2);
  if(label==='PDF 文件中心'){
   const toolbar=section.getByRole('region',{name:'PDF 索引管理',exact:true}),buttons=toolbar.getByRole('button');assert.equal(await buttons.count(),6);assert.deepEqual(await toolbar.getByRole('group').evaluateAll(groups=>groups.map(group=>group.querySelectorAll('button').length)),[3,3]);
   assert.ok(await buttons.evaluateAll(nodes=>nodes.every(node=>!!node.querySelector('svg')&&!node.textContent.trim()&&node.title===node.getAttribute('aria-label'))));
   const rows=await buttons.evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().y));assert.ok(Math.max(...rows)-Math.min(...rows)<2);
  }
  await page.screenshot({path:path.join(evidence,`V52-${label}-固定操作区与表格.png`)});
 }
 const report={actualHttpAndDom:true,actualInstalledHttpAndDom:Boolean(app),fixtureOnly:true,geometry,layout:{centeredCells:true,rightmostReceivesShrunkWidth:true,stickyControlsAndHeaders:true,pdfSixIconActionsTwoGroups:true},scopedFiles:{indexed:5,excluded:3,sourceOnly02:true,allBatches:4,dateDescending:true,currentAndHistoricalLabels:true,conflictOneRowNoPicker:true,unindexedReadOnly:true,missingVsUnavailable:true,originalPdfHashesPreserved:original.length},bom:{exactFirstRecordJump:true,dateCorrectedInPlace:true,identityCreatedAtLineagePreserved:true,currentPointerAndOtherRecordsPreserved:true,frozenSnapshotsPreserved:true,unifiedEntry:true,queryDropdowns:3,previousAttachmentRoleReuse:true,replacementUploadIndependent:true,originalAssetHashesPreserved:assetHashes.length},mail:{anonymousMatrix:true,sheets:4,recognizedTemplates:25,initial:20,update:5,uniqueContacts:14,roleLinks:135,independentSignatures:1,existingContactPreserved:true,defaultSignaturePreserved:true,sourceCasesPersisted:25,sourceCoordinatesPersisted:true,rawCasesReadOnly:true,manualConfigurationPreservesRawSource:true,signatureOnce:true,reimportSkipped:25,protectedBusinessRowsAndDraftsPreserved:true},scope:'Temporary fixture; no production DB, original workbook, personal contacts or physical DPI tested'};
 await page.evaluate(saved=>{if(saved===null)localStorage.removeItem('table-layout:v1:pdf-files');else localStorage.setItem('table-layout:v1:pdf-files',saved);},originalPdfLayout);
 fs.writeFileSync(path.join(evidence,'v52-acceptance.json'),JSON.stringify(report,null,2));return report;
};
