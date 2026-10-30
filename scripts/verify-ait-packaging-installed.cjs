const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {createRequire}=require('node:module');

/** Real UI/HTTP/SQLite/filesystem acceptance. The AIT upload fixture is NOT a real Adobe template. */
module.exports=async function verify({page,app,source,workspace,evidence,databaseFile,snapshot,writePdf,go}){
 const {expect}=createRequire(path.join(source,'package.json'))('@playwright/test');
 fs.mkdirSync(evidence,{recursive:true});page.setDefaultTimeout(15000);
 const before=snapshot(databaseFile),hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 const request=(route,body,method=body===undefined?'GET':'POST')=>page.evaluate(async({route,body,method})=>{
  const token=(await(await fetch('/api/session',{method:'POST'})).json()).token;
  const response=await fetch(route,{method,headers:{'content-type':'application/json','x-planner-token':token},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const value=await response.json();if(!response.ok)throw Error(`${route}: ${value.error?.message??response.status}`);return value;
 },{route,body,method});
 const dictionary=async(type,code,name,parentId)=>{const result=await request(`/api/dictionaries/${type}`),existing=result.items.find(item=>item.code===code&&(parentId===undefined||item.parentId===parentId));return existing??request(`/api/dictionaries/${type}`,{code,name,...(parentId?{parentId}:{})});};
 const brand=await dictionary('brand','78','AIT验收品牌'),size=await dictionary('product_size','7878','AIT验收类别'),appearance=await dictionary('appearance','78','AIT验收外观'),color=await dictionary('color','8','验收白色'),main=await dictionary('main_category','78','AIT验收印刷件'),project=await dictionary('project_item','01','验收铭牌',main.id),templateProject=await dictionary('project_item','02','验收模板贴纸',main.id);
 const product=await request('/api/products',{sku:'AIT78',model:'MODEL78',brandId:brand.id,productSizeId:size.id,defaultAppearanceId:appearance.id,productCategory:'AIT验收类别'});
 await request('/api/files/settings',{workspaceRoot:workspace},'PUT');
 await request('/api/packaging/configs',{projectItemId:project.id,mode:'manual',parameters:[]});
 await request('/api/packaging/configs',{projectItemId:templateProject.id,mode:'ait',parameters:[{key:'length',label:'验收长',type:'number',required:true,axis:'length',unit:'mm'},{key:'width',label:'验收宽',type:'number',required:true,axis:'width',unit:'mm'}]});
 await go(page,'包材模板');
 const navItems=await page.getByRole('navigation',{name:'主导航'}).locator('.nav-group').last().getByRole('button').allTextContents();
 assert.equal(navItems[navItems.indexOf('PDF 文件中心')+1],'包材模板');
 await page.getByRole('button',{name:'新增 AIT 模板',exact:true}).click();
 const editor=page.getByRole('form',{name:'AIT 模板编辑',exact:true});
 await editor.getByLabel('模板名称',{exact:true}).fill('AIT上传验收');await editor.getByRole('combobox',{name:'资料类别',exact:true}).selectOption(String(main.id));await editor.getByRole('combobox',{name:'项目明细',exact:true}).selectOption(String(templateProject.id));
 const aitBytes=Buffer.from('%!PS-Adobe-3.0\n%%Creator: upload-only anonymous contract fixture; not an Illustrator acceptance template\n');
 await editor.locator('input[type=file]').setInputFiles({name:'upload-contract.ait',mimeType:'application/octet-stream',buffer:aitBytes});
 await editor.getByRole('button',{name:'保存模板',exact:true}).click();await editor.waitFor({state:'detached'});
 let catalog=await request('/api/packaging/catalog');const template=catalog.templates.find(item=>item.name==='AIT上传验收');assert.ok(template);
 const asset=path.join(path.dirname(databaseFile),template.assetRelativePath);assert.equal(hash(asset),createHash('sha256').update(aitBytes).digest('hex'));
 if(!app){await page.getByRole('button',{name:'本机检查',exact:true}).click();await page.getByRole('alert').filter({hasText:/Illustrator|Windows/u}).waitFor();}
 await page.getByRole('tab',{name:'尺寸档案',exact:true}).click();await page.getByRole('button',{name:'新增尺寸档案',exact:true}).click();
 const dimensions=page.getByRole('form',{name:'尺寸档案编辑',exact:true});await dimensions.getByLabel('规格名称',{exact:true}).fill('标准贴纸80×50');await dimensions.getByRole('combobox',{name:'尺寸项目',exact:true}).selectOption(String(templateProject.id));
 await dimensions.getByRole('checkbox',{name:new RegExp(`AIT78 · MODEL78`,'u')}).check();await dimensions.getByLabel('验收长 (mm)',{exact:true}).fill('80');await dimensions.getByLabel('验收宽 (mm)',{exact:true}).fill('50');await dimensions.getByLabel('设为所选产品的默认规格',{exact:true}).check();await dimensions.getByRole('button',{name:'保存尺寸档案',exact:true}).click();await dimensions.waitFor({state:'detached'});
 catalog=await request('/api/packaging/catalog');const profile=catalog.dimensions.find(item=>item.name==='标准贴纸80×50');assert.deepEqual(profile.parameters,{length:80,width:50});assert.ok(profile.defaultProductIds.includes(product.id));
 await page.getByRole('tab',{name:'模板匹配规则',exact:true}).click();await page.getByRole('button',{name:'新增匹配规则',exact:true}).click();
 const rule=page.locator('form').filter({has:page.getByRole('heading',{name:'新增匹配规则',exact:true})});await rule.getByLabel('规则名称',{exact:true}).fill('验收尺寸范围');await rule.getByRole('combobox',{name:'目标模板',exact:true}).selectOption(String(template.id));await rule.getByRole('button',{name:'添加尺寸条件',exact:true}).click();await rule.getByLabel('条件参数 1',{exact:true}).selectOption('length');await rule.getByRole('combobox',{name:'比较',exact:true}).selectOption('lte');await rule.getByLabel('值',{exact:true}).fill('200');await rule.getByLabel('允许长宽互换（高度不参与）',{exact:true}).check();await rule.getByRole('button',{name:'保存匹配规则',exact:true}).click();await rule.waitFor({state:'detached'});
 await page.screenshot({path:path.join(evidence,'AIT-模板尺寸规则真实保存.png')});
 await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'图号规划 / 更新包材',exact:true}).click();await page.getByRole('heading',{name:'图号规划',exact:true}).waitFor();
 await page.getByRole('combobox',{name:'产品类别',exact:true}).selectOption(product.productCategory);await page.getByRole('combobox',{name:'产品型号',exact:true}).selectOption(String(product.id));await page.getByRole('combobox',{name:'第 1 行主类别',exact:true}).selectOption(String(main.id));await page.getByRole('combobox',{name:'第 1 行项目明细',exact:true}).selectOption(String(templateProject.id));await page.getByRole('combobox',{name:'第 1 行颜色',exact:true}).selectOption(String(color.id));
 const planningDimensions=page.getByRole('group',{name:'第 1 行本次尺寸',exact:true});await expect(planningDimensions.getByLabel('验收长 (mm)',{exact:true})).toHaveValue('80');await planningDimensions.getByLabel('验收长 (mm)',{exact:true}).fill('90');assert.equal(await page.getByRole('button',{name:'生成文件',exact:true}).isDisabled(),true);await page.getByRole('button',{name:'查重并预览',exact:true}).click();await page.getByRole('button',{name:'确认批量占号',exact:true}).click();await page.getByText('已成功占用 1 个图号 · 正式保存',{exact:true}).waitFor();
 const drawings=(await request(`/api/drawings?productId=${product.id}`)).items;assert.equal(drawings.length,1);const drawing=drawings[0];
 await page.getByRole('button',{name:'生成文件',exact:true}).click();await page.getByRole('heading',{name:'包材模板',exact:true}).waitFor();await page.getByRole('textbox',{name:'任务名称',exact:true}).fill('验收新建任务');await page.getByRole('button',{name:'创建任务',exact:true}).click();
 const detail=page.getByRole('region',{name:'当前制图任务',exact:true});await detail.waitFor();let task=(await request(`/api/packaging/tasks?productId=${product.id}`)).items.find(item=>item.state==='active');assert.ok(task);assert.equal(task.items[0].fullCode,drawing.fullCode);assert.deepEqual(task.items[0].parameters,{length:90,width:50});assert.equal(task.items[0].templateId,template.id);assert.deepEqual((await request('/api/packaging/catalog')).dimensions.find(p=>p.id===profile.id).parameters,{length:80,width:50});
 const pendingName='需要人工指定.pdf',pending=path.join(workspace,task.productDirectory,'00.临时文件',pendingName);writePdf(pending,'Real manual source before archive');
 // No discovery button: the real filesystem watcher and task refresh must reveal this file.
 await detail.getByLabel(`${pendingName} 关联项目`,{exact:true}).waitFor({timeout:15000});await detail.getByLabel(`${pendingName} 关联项目`,{exact:true}).selectOption(String(task.items[0].id));await detail.getByRole('button',{name:'确认关联',exact:true}).click();await detail.getByRole('button',{name:'确认当前文件',exact:true}).waitFor();
 task=await request(`/api/packaging/tasks/${task.id}`);const originalHash=task.items[0].sha256;assert.equal(fs.existsSync(pending),false);
 const review=async()=>{await detail.getByLabel('已检查当前 PDF 内容',{exact:true}).check();await detail.getByRole('button',{name:'确认当前文件',exact:true}).click();await detail.getByText('此版本已确认',{exact:true}).waitFor();};
 const archive=async(id)=>{
  await detail.getByRole('button',{name:'归档预览',exact:true}).click();await detail.getByLabel('已核对全部文件和归档位置，确认统一归档',{exact:true}).check();await detail.getByRole('button',{name:'确认统一归档',exact:true}).click();
  await page.waitForFunction(async id=>{const task=await(await fetch(`/api/packaging/tasks/${id}`)).json();return task.state==='completed'||task.state==='awaiting_index';},id);
  let current=await request(`/api/packaging/tasks/${id}`);if(current.state==='awaiting_index'){await detail.getByRole('button',{name:'重试归档索引',exact:true}).waitFor();await detail.getByRole('button',{name:'重试归档索引',exact:true}).click();}
  await expect.poll(async()=>(await request(`/api/packaging/tasks/${id}`)).state).toBe('completed');await detail.locator('.pkg-section-heading').first().getByText(/已完成/u).waitFor();return request(`/api/packaging/tasks/${id}`);
 };
 await review();task=await archive(task.id);
 const indexed=(await request(`/api/files?productId=${product.id}&presence=all`)).items;assert.equal(indexed.length,1);assert.equal(indexed[0].drawingId,drawing.id);assert.ok(indexed[0].relativePath.includes('02.未转曲源文件'));const formal=path.join(workspace,indexed[0].relativePath);assert.equal(hash(formal),originalHash);assert.equal(fs.existsSync(path.join(workspace,task.taskDirectory)),false);assert.ok(fs.existsSync(path.join(workspace,task.productDirectory,'00.临时文件')));
 await page.screenshot({path:path.join(evidence,'AIT-规划后人工文件归档与索引.png')});
 await detail.getByRole('button',{name:'返回任务记录',exact:true}).click();await page.getByRole('combobox',{name:'任务类型',exact:true}).selectOption('modify');await page.getByRole('textbox',{name:'任务名称',exact:true}).fill('验收修改任务');
 await page.getByRole('checkbox',{name:`${drawing.fullCode} · ${templateProject.name} · ${color.name}`,exact:true}).check();await page.getByRole('button',{name:'创建任务',exact:true}).click();await detail.waitFor();let modification=(await request(`/api/packaging/tasks?productId=${product.id}`)).items.find(item=>item.state==='active');assert.equal(hash(formal),originalHash);
 const copy=path.join(workspace,modification.items[0].relativePath);writePdf(copy,'Real edited working copy; keep the original until archive');const editedHash=hash(copy);assert.notEqual(editedHash,originalHash);assert.equal(hash(formal),originalHash);
 await expect.poll(async()=>(await request(`/api/packaging/tasks/${modification.id}`)).items[0].sha256).toBe(editedHash);await expect(detail.getByText(`当前文件 SHA-256：${editedHash}`,{exact:true})).toBeVisible({timeout:10000});
 await review();modification=await archive(modification.id);assert.equal(hash(formal),editedHash);assert.equal(hash(path.join(path.dirname(databaseFile),modification.items[0].backupRelativePath)),originalHash);assert.equal(hash(asset),createHash('sha256').update(aitBytes).digest('hex'));
 const backup=await page.evaluate(async({id,itemId})=>{const response=await fetch(`/api/packaging/tasks/${id}/items/${itemId}/backup`);return{status:response.status,bytes:[...new Uint8Array(await response.arrayBuffer())]};},{id:modification.id,itemId:modification.items[0].id});assert.equal(backup.status,200);assert.equal(createHash('sha256').update(Buffer.from(backup.bytes)).digest('hex'),originalHash);
 await page.screenshot({path:path.join(evidence,'AIT-正式文件修改备份与历史.png')});
 const unfinished=await request('/api/packaging/tasks',{productId:product.id,name:'重启恢复验收',type:'new',drawings:[{origin:'planned',id:Math.abs(drawing.id)}]});
 const after=snapshot(databaseFile);for(const[table,rows]of Object.entries(before)){if(table==='schema_migrations')continue;for(const row of rows)assert.ok(after[table].some(current=>JSON.stringify(current)===JSON.stringify(row)),`Original ${table} row changed`);}
 return{actualHttpAndDom:true,actualInstalledHttpAndDom:Boolean(app),menuOrder:true,catalogSavedThroughUi:true,dimensionDefaults:true,rangeRuleAndSwapSaved:true,reservationToTask:true,singleProductTask:true,watcherDetectedWithoutClick:true,manualAssociation:true,reviewHash:true,newArchiveAndScopedIndex:true,formalEditCopyOnly:true,formalBackupHashPreserved:true,backupReadableThroughRegisteredId:true,taskCleanupOnly:true,taskHistoryRetained:true,originalAitHashPreserved:true,protectedBusinessRowsPreserved:true,unfinishedTaskId:unfinished.id,unfinishedTaskMode:unfinished.items[0].mode,unfinishedTaskParameters:unfinished.items[0].parameters,planningDimensionsHandoff:true,productDirectory:task.productDirectory,productId:product.id,realIllustratorGeneration:false,editablePdfReopenVerified:false,aitFixtureUploadOnly:true,limitations:'No licensed Illustrator or real AIT was provided; actual Adobe generation/editability/font/layout acceptance remains local.'};
};
