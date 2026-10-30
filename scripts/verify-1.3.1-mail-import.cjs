const assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const fs=require('node:fs');
const path=require('node:path');

// Anonymous XLSX and a disposable DB only; shared by browser and installed checks.
module.exports=async function verify({page,app,source,evidence,databaseFile,snapshot,go}){
 const dep=createRequire(path.join(source,'package.json'));
 const writeXlsxFile=dep('write-excel-file/node').default??dep('write-excel-file/node');
 fs.mkdirSync(evidence,{recursive:true});
 const book=await writeXlsxFile([{sheet:'首批包材资料',data:[
  ['厂家','Hotfix131 Supplier'],['场景','完整交付'],['联系人','Reviewed Contact'],['收件人','supplier131@example.com'],['抄送人','Review <shared131@example.com>'],
  ['主题','{{model}}资料'],['正文','请查收已核对资料。'],['场景','补充资料'],['主题','补充资料'],['正文','独立案例，不应被导入。'],
 ].map(row=>row.map(value=>({value,type:String})))}]).toBuffer();
 const baseline=snapshot(databaseFile);
 await go(page,'迁移检查');await page.getByRole('button',{name:'导入邮件模板',exact:true}).click();
 const modal=page.getByRole('dialog',{name:'导入邮件模板',exact:true});await modal.getByLabel('邮件模板 Excel',{exact:true}).setInputFiles({name:'hotfix131-anonymous.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:book});
 await modal.getByRole('button',{name:'识别并预览',exact:true}).click();
 await modal.getByLabel('选择模板 1',{exact:true}).check();
 await modal.getByLabel('联系人厂家 1-2',{exact:true}).fill('Shared Coordination');
 await modal.getByLabel('主题 1',{exact:true}).fill('{{unknown_131}}');
 const review=async()=>{await modal.getByLabel('已确认联系人关联 1',{exact:true}).check();await modal.getByLabel('已核对固定话术、动态信息及历史示例 1',{exact:true}).check();};
 await review();await modal.evaluate(element=>{element.scrollTop=element.scrollHeight;});
 const footer=modal.locator(':scope > footer');
 await footer.getByRole('button',{name:'确认导入所选模板',exact:true}).click();
 const alert=footer.getByRole('alert');await alert.waitFor();assert.match(await alert.innerText(),/未知变量/u);
 const errorGeometry=await alert.evaluate(element=>{const box=element.getBoundingClientRect();return {top:box.top,bottom:box.bottom,viewport:innerHeight};});
 assert.ok(errorGeometry.top>=0&&errorGeometry.bottom<=errorGeometry.viewport);
 assert.deepEqual(snapshot(databaseFile),baseline,'Rejected import must roll back contacts and templates');
 assert.equal(await modal.getByLabel('联系人厂家 1-2',{exact:true}).inputValue(),'Shared Coordination');
 assert.equal(await modal.getByLabel('已确认联系人关联 1',{exact:true}).isChecked(),true);
 await page.screenshot({path:path.join(evidence,'Hotfix131-导入失败在按钮旁可见.png')});
 await modal.getByLabel('主题 1',{exact:true}).fill('{{model}}资料');await review();
 await modal.evaluate(element=>{element.scrollTop=element.scrollHeight;});
 await footer.getByRole('button',{name:'确认导入所选模板',exact:true}).click();
 await footer.getByText(/^新增 1 条，更新 0 条，跳过 1 条/u).waitFor();
 const successGeometry=await footer.getByRole('status').evaluate(element=>{const box=element.getBoundingClientRect();return {top:box.top,bottom:box.bottom,viewport:innerHeight};});
 assert.ok(successGeometry.top>=0&&successGeometry.bottom<=successGeometry.viewport);
 const after=snapshot(databaseFile),created=after.outbound_email_templates.filter(row=>row.manufacturer==='Hotfix131 Supplier');assert.equal(created.length,1);
 assert.equal(created[0].scenario,'完整交付');
 const shared=after.outbound_contacts.find(row=>row.email==='shared131@example.com');assert.equal(shared.company,'Shared Coordination');
 assert.ok(after.outbound_template_contact_links.some(row=>row.template_id===created[0].id&&row.contact_id===shared.id&&row.recipient_type==='cc'));
 for(const [table,rows] of Object.entries(baseline)){
  const added=new Set(['outbound_email_templates','outbound_contacts','outbound_template_contact_links']);
  if(!added.has(table))assert.deepEqual(after[table],rows,`Protected rows changed in ${table}`);
  else for(const row of rows)assert.ok(after[table].some(item=>JSON.stringify(item)===JSON.stringify(row)),`Original ${table} row changed`);
 }
 await page.screenshot({path:path.join(evidence,'Hotfix131-单条模板共享抄送导入成功.png')});
 await modal.getByRole('button',{name:'关闭',exact:true}).click();
 return {actualHttpAndDom:true,actualInstalledHttpAndDom:Boolean(app),anonymousWorkbook:true,singleTemplateSharedCc:true,errorVisibleBesideButton:true,successVisibleBesideButton:true,failedImportRolledBack:true,reviewedEditsPreserved:true,sharedCompanyPreserved:true,protectedRowsPreserved:true,errorGeometry,successGeometry};
};
