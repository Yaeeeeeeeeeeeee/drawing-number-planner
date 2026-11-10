const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {createRequire}=require('node:module');

/** Real UI/HTTP/SQLite/filesystem acceptance. The upload fixture is not an Adobe template. */
module.exports=async function verify({page,app,source,workspace,evidence,databaseFile,snapshot,writePdf,go}){
 const {expect}=createRequire(path.join(source,'package.json'))('@playwright/test');
 fs.mkdirSync(evidence,{recursive:true});page.setDefaultTimeout(15000);
 const before=snapshot(databaseFile),hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 const request=(route,body,method=body===undefined?'GET':'POST')=>page.evaluate(async({route,body,method})=>{
  const token=(await(await fetch('/api/session',{method:'POST'})).json()).token;
  const response=await fetch(route,{method,headers:{'content-type':'application/json','x-planner-token':token},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const value=await response.json();if(!response.ok)throw Error(`${route}: ${value.error?.message??response.status}`);return value;
 },{route,body,method});
 const observations=require('./verify-packaging-restart.cjs'),scope=await observations.observationScope(before,route=>request(route));
 const resize=async(width,height)=>{
  if(app)await app.evaluate(({BrowserWindow},{width,height})=>BrowserWindow.getAllWindows()[0].setContentSize(width,height),{width,height});
  else await page.setViewportSize({width,height});
 };
 const geometry=[];
 const capture=async(name,{rows=false,responsive=false}={})=>{
  for(const width of responsive?[3840,2560,1920,1440,720]:[1920]){
   await resize(width,1000);
   if(width<=720){const close=page.getByRole('button',{name:'关闭导航',exact:true});if(await close.isVisible())await close.click();}
   await expect.poll(()=>page.evaluate(()=>({page:document.documentElement.scrollWidth,viewport:innerWidth}))).toEqual(expect.objectContaining({viewport:width}));
   const dimensions=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,rows:[...document.querySelectorAll('.pkg-task-row')].map(row=>Math.round(row.getBoundingClientRect().height))}));
   assert.ok(dimensions.scrollWidth<=dimensions.width+1,`${name} at ${width}px overflows: ${JSON.stringify(dimensions)}`);
   if(rows)assert.ok(dimensions.rows.length&&dimensions.rows.every(height=>height<=(width<800?260:90)),`${name}: task rows are too tall: ${JSON.stringify(dimensions)}`);
   geometry.push({name,...dimensions});await page.screenshot({path:path.join(evidence,`${name}-${width}.png`),fullPage:true});if(width===1920&&name.startsWith('AIT-'))fs.copyFileSync(path.join(evidence,`${name}-${width}.png`),path.join(evidence,`${name}.png`));
  }
  await resize(1920,1000);const openNavigation=page.getByRole('button',{name:'展开导航',exact:true});if(await openNavigation.isVisible())await openNavigation.click();
 };
 await resize(1920,1000);
 const dictionary=async(type,code,name,parentId)=>{const result=await request(`/api/dictionaries/${type}`),existing=result.items.find(item=>item.code===code&&(parentId===undefined||item.parentId===parentId));return existing??request(`/api/dictionaries/${type}`,{code,name,...(parentId?{parentId}:{})});};
 const brand=await dictionary('brand','78','AIT验收品牌'),size=await dictionary('product_size','7878','AIT验收类别'),appearance=await dictionary('appearance','78','AIT验收外观'),color=await dictionary('color','8','验收白色'),main=await dictionary('main_category','78','AIT验收印刷件'),project=await dictionary('project_item','01','验收铭牌',main.id),templateProject=await dictionary('project_item','02','验收模板贴纸',main.id);
 const product=await request('/api/products',{sku:'AIT78',model:'MODEL78',brandId:brand.id,productSizeId:size.id,defaultAppearanceId:appearance.id,productCategory:'AIT验收类别'});
 await request('/api/files/settings',{workspaceRoot:workspace},'PUT');
 // A unique real product directory is the normal UI path. Task creation itself creates 00.临时文件.
 const directory=(await request(`/api/packaging/product-directories?productId=${product.id}`)).items[0].relativePath;fs.mkdirSync(path.join(workspace,directory),{recursive:true});
 // Fixture setup precedes the user workflow; mount preserved pages with the seeded lookup data.
 await page.reload();
 await go(page,'包材模板');
 const navigation=page.getByRole('navigation',{name:'主导航'}),daily=await navigation.locator('.nav-group').first().getByRole('button').allTextContents(),sources=await navigation.locator('.nav-group').last().getByRole('button').allTextContents();
 assert.equal(daily[daily.indexOf('图号规划 / 更新包材')+1],'制图任务');assert.equal(sources[sources.indexOf('PDF 文件中心')+1],'包材模板');
 assert.deepEqual(await page.getByRole('tab').allTextContents(),['AIT 模板管理','模板匹配规则','项目生成设置']);
 assert.equal(await page.getByRole('tab',{name:'尺寸档案',exact:true}).count(),0);assert.equal(await page.getByText('批量创建临时文件夹',{exact:true}).count(),0);
 // Configure the supported 0/2/3D choices through the simplified UI before creating a dimension rule.
 await page.getByRole('tab',{name:'项目生成设置',exact:true}).click();
 const config=page.getByRole('form',{name:'项目生成设置',exact:true});
 await config.getByLabel('配置项目',{exact:true}).selectOption(String(templateProject.id));
 await config.getByRole('combobox',{name:'生成方式',exact:true}).selectOption('ait');
 for(const basis of ['0','2']){
  await config.getByRole('combobox',{name:'模板匹配依据',exact:true}).selectOption(basis);await config.getByRole('button',{name:'保存项目配置',exact:true}).click();await config.getByText('项目配置已保存',{exact:true}).waitFor();
  const saved=(await request('/api/packaging/catalog')).configs.find(item=>item.projectItemId===templateProject.id);
  assert.deepEqual(saved.parameters.filter(p=>p.required&&p.axis).map(p=>p.axis),basis==='3'?['length','width','height']:basis==='2'?['length','width']:[]);
 }
 // Exercise 3D on a separate project, then choose its manual production mode.
 await config.getByLabel('配置项目',{exact:true}).selectOption(String(project.id));await config.getByRole('combobox',{name:'生成方式',exact:true}).selectOption('ait');await config.getByRole('combobox',{name:'模板匹配依据',exact:true}).selectOption('3');await config.getByRole('button',{name:'保存项目配置',exact:true}).click();await config.getByText('项目配置已保存',{exact:true}).waitFor();assert.deepEqual((await request('/api/packaging/catalog')).configs.find(item=>item.projectItemId===project.id).parameters.filter(p=>p.required).map(p=>p.axis),['length','width','height']);await config.getByRole('combobox',{name:'生成方式',exact:true}).selectOption('manual');await config.getByRole('button',{name:'保存项目配置',exact:true}).click();await config.getByText('项目配置已保存',{exact:true}).waitFor();
 assert.equal(await config.getByLabel('参数键',{exact:true}).count(),0);assert.equal(await config.getByRole('button',{name:'添加参数',exact:true}).count(),0);
 await page.getByRole('tab',{name:'AIT 模板管理',exact:true}).click();await page.getByRole('button',{name:'新增 AIT 模板',exact:true}).click();
 const editor=page.getByRole('form',{name:'AIT 模板编辑',exact:true});
 await editor.getByLabel('模板名称',{exact:true}).fill('AIT上传验收');await editor.getByRole('combobox',{name:'资料类别',exact:true}).selectOption(String(main.id));await editor.getByRole('combobox',{name:'项目明细',exact:true}).selectOption(String(templateProject.id));
 const aitBytes=Buffer.from('%!PS-Adobe-3.0\n%%Creator: upload-only anonymous contract fixture; not an Illustrator acceptance template\n');
 await editor.locator('input[type=file]').setInputFiles({name:'upload-contract.ait',mimeType:'application/octet-stream',buffer:aitBytes});
 await expect(editor.getByRole('button',{name:'保存模板',exact:true})).toBeEnabled();
 await editor.getByLabel('AIT 对象名称 1',{exact:true}).fill('DRAWING_NO');await expect(editor.getByLabel('填入内容 1',{exact:true})).toHaveValue('DRAWING_NO');assert.deepEqual(await editor.getByLabel('填入内容 1',{exact:true}).locator('option').allTextContents(),['完整图号']);assert.equal(await editor.getByRole('textbox',{name:'数据字段',exact:true}).count(),0);
 await editor.getByRole('button',{name:'保存模板',exact:true}).click();await editor.waitFor({state:'detached'});
 let catalog=await request('/api/packaging/catalog');const template=catalog.templates.find(item=>item.name==='AIT上传验收');assert.ok(template);assert.deepEqual(template.fields,[{objectName:'DRAWING_NO',sourceKey:'DRAWING_NO',required:true}]);
 const asset=path.join(path.dirname(databaseFile),template.assetRelativePath),aitHash=createHash('sha256').update(aitBytes).digest('hex');assert.equal(hash(asset),aitHash);
 if(!app){await page.getByRole('button',{name:'本机检查',exact:true}).click();await page.getByRole('alert').filter({hasText:/Illustrator|Windows/u}).waitFor();}
 await page.getByRole('tab',{name:'模板匹配规则',exact:true}).click();await page.getByRole('button',{name:'新增匹配规则',exact:true}).click();
 const rule=page.getByRole('form',{name:'模板匹配规则编辑',exact:true});await rule.getByLabel('规则名称',{exact:true}).fill('验收尺寸范围');await rule.getByRole('combobox',{name:'目标模板',exact:true}).selectOption(String(template.id));
 for(const [index,key,value]of [[1,'length','200'],[2,'width','100']]){
  await rule.getByRole('button',{name:'添加尺寸条件',exact:true}).click();await rule.getByLabel(`条件尺寸 ${index}`,{exact:true}).selectOption(key);await rule.getByLabel(`比较方式 ${index}`,{exact:true}).selectOption('lte');await rule.getByLabel(`数值 ${index}`,{exact:true}).fill(value);
 }
 await rule.getByLabel('允许长宽互换（高度不参与）',{exact:true}).check();await rule.getByRole('button',{name:'保存匹配规则',exact:true}).click();await rule.waitFor({state:'detached'});
 await capture('AIT-模板尺寸规则真实保存',{responsive:true});
 await navigation.getByRole('button',{name:'图号规划 / 更新包材',exact:true}).click();await page.getByRole('heading',{name:'图号规划',exact:true}).waitFor();
 await page.getByRole('combobox',{name:'产品类别',exact:true}).selectOption(product.productCategory);await page.getByRole('combobox',{name:'产品型号',exact:true}).selectOption(String(product.id));
 await page.getByRole('button',{name:'下一步',exact:true}).click();
 await page.getByRole('combobox',{name:'第 1 行主类别',exact:true}).selectOption(String(main.id));await page.getByRole('combobox',{name:'第 1 行项目明细',exact:true}).selectOption(String(templateProject.id));await page.getByRole('combobox',{name:'第 1 行颜色',exact:true}).selectOption(String(color.id));
 // This fixture color is named 验收白色, not a real white dictionary entry.
 // Explicit independent numbering avoids inventing a white sharing baseline.
 await page.getByRole('checkbox',{name:'第 1 行其他颜色共用白色图号',exact:true}).uncheck();
 assert.equal(await page.getByRole('group',{name:/本次尺寸/u}).count(),0);assert.equal(await page.getByRole('spinbutton').count(),0);assert.equal(await page.getByRole('button',{name:'生成文件',exact:true}).count(),0);
 await page.getByRole('button',{name:'下一步',exact:true}).click();await page.getByText('可占用',{exact:true}).waitFor();
 await capture('UI16-图号规划四步检查',{responsive:true});
 await page.getByRole('button',{name:'下一步',exact:true}).click();assert.equal(await page.getByRole('button',{name:'确认批量占号',exact:true}).isDisabled(),true);
 await page.getByRole('checkbox',{name:'已核对本次占号清单',exact:true}).check();await page.getByRole('button',{name:'确认批量占号',exact:true}).click();await page.getByText('成功 1 项',{exact:true}).waitFor();
 const drawings=(await request(`/api/drawings?productId=${product.id}`)).items;assert.equal(drawings.length,1);const drawing=drawings[0];
 if(!app)await page.context().grantPermissions(['clipboard-read','clipboard-write'],{origin:new URL(page.url()).origin});
 await page.getByRole('button',{name:`复制图号 ${drawing.fullCode}`,exact:true}).click();
 await expect.poll(()=>app?app.evaluate(({clipboard})=>clipboard.readText()):page.evaluate(()=>navigator.clipboard.readText())).toBe(drawing.fullCode);
 await page.getByRole('button',{name:`查看 ${product.model} 图号库`,exact:true}).click();const drawingDetail=page.getByRole('complementary',{name:'图号详情',exact:true});await drawingDetail.getByRole('heading',{name:drawing.fullCode,exact:true}).waitFor();
 await capture('UI15-占号结果精确定位图号');await drawingDetail.getByRole('button',{name:'关闭图号详情',exact:true}).click();
 await navigation.getByRole('button',{name:'图号规划 / 更新包材',exact:true}).click();await page.getByRole('region',{name:'本次占号结果',exact:true}).getByText(drawing.fullCode,{exact:true}).waitFor();
 await capture('UI15-占号成功结果保留');
 await page.getByRole('button',{name:'生成文件',exact:true}).click();await page.getByRole('heading',{name:'制图任务',exact:true}).waitFor();await expect(page.getByRole('button',{name:'创建任务',exact:true})).toBeEnabled();
 assert.equal(await page.getByRole('textbox',{name:'任务名称',exact:true}).count(),0);assert.equal(await page.getByRole('combobox',{name:'实际产品目录',exact:true}).count(),0);assert.equal(await page.getByRole('group',{name:'本次已占号图号',exact:true}).getByRole('checkbox').count(),0);
 await page.getByRole('group',{name:'本次已占号图号',exact:true}).getByText(drawing.fullCode,{exact:true}).waitFor();await page.getByRole('button',{name:'创建任务',exact:true}).click();
 const detail=page.getByRole('region',{name:'当前制图任务',exact:true});await detail.waitFor();let task=(await request(`/api/packaging/tasks?productId=${product.id}`)).items.find(item=>item.state==='active');assert.ok(task);assert.equal(task.items[0].drawing.id,drawing.id);assert.equal(task.taskDirectory.replaceAll('\\','/'),`${task.productDirectory.replaceAll('\\','/')}/00.临时文件`);
 await assert.rejects(()=>request('/api/packaging/tasks',{productId:product.id,type:'new',drawings:[{origin:'planned',id:Math.abs(drawing.id)}]}),/已有未完成制图任务/u);await detail.getByRole('button',{name:'返回任务记录',exact:true}).click();await page.getByText(`${product.model} 已有未完成制图任务`,{exact:true}).waitFor();await page.getByRole('button',{name:'继续任务',exact:true}).click();await detail.waitFor();assert.equal((await request(`/api/packaging/tasks?productId=${product.id}`)).items.filter(item=>item.state!=='completed').length,1);
 const temporary=path.join(workspace,task.taskDirectory);assert.equal(fs.readdirSync(temporary).filter(name=>fs.statSync(path.join(temporary,name)).isDirectory()).length,0);
 await capture('UI15-制图任务紧凑列表',{rows:true,responsive:true});
 const row=detail.getByRole('region',{name:`${drawing.fullCode} ${templateProject.name}`,exact:true});await row.getByRole('button',{name:'设置 / 检查',exact:true}).click();
 await row.getByLabel('长 (mm)',{exact:true}).fill('90');await row.getByLabel('宽 (mm)',{exact:true}).fill('50');await row.getByRole('button',{name:'保存本次设置',exact:true}).click();await detail.getByText('本次参数已保存',{exact:true}).waitFor();
 task=await request(`/api/packaging/tasks/${task.id}`);assert.equal(task.items[0].parameters.length,90);assert.equal(task.items[0].parameters.width,50);assert.equal(task.items[0].templateId,template.id);
 await capture('UI15-任务尺寸匹配与设置');
 const pendingName='需要人工指定.pdf',pending=path.join(temporary,pendingName),unrelated=path.join(temporary,'无关资料.txt');fs.writeFileSync(unrelated,'unrelated file must remain');writePdf(pending,'Real manual source before archive');
 // The real filesystem watcher plus normal task polling must reveal the ambiguous file without a discovery click.
 await detail.getByLabel(`${pendingName} 关联项目`,{exact:true}).waitFor({timeout:20000});await detail.getByLabel(`${pendingName} 关联项目`,{exact:true}).selectOption(String(task.items[0].id));await detail.getByRole('button',{name:'确认关联',exact:true}).click();await row.getByRole('button',{name:'确认当前文件',exact:true}).waitFor();
 task=await request(`/api/packaging/tasks/${task.id}`);const originalHash=task.items[0].sha256;assert.equal(task.items[0].mode,'manual');const associated=path.join(workspace,task.items[0].relativePath);assert.equal(hash(associated),originalHash);
 const review=async(currentRow)=>{
  let reviewedHash;
  for(let attempt=0;;attempt++){
   await currentRow.getByLabel('已检查当前 PDF 内容',{exact:true}).check();
   const response=page.waitForResponse(r=>/\/api\/packaging\/tasks\/[^/]+\/items\/\d+\/review$/u.test(new URL(r.url()).pathname)&&r.request().method()==='POST');
   await currentRow.getByRole('button',{name:'确认当前文件',exact:true}).click();const result=await response,body=await result.json();
   const hashSubmitted=result.request().postDataJSON().sha256;
   if(reviewedHash)assert.equal(hashSubmitted,reviewedHash,'A retry must not silently review different content');else reviewedHash=hashSubmitted;
   if(result.ok()){await currentRow.getByText('此版本已确认',{exact:true}).waitFor();return;}
   console.log('[installed review response]',JSON.stringify({status:result.status(),body}));
   assert.ok(attempt<3&&body.error?.code==='TASK_BUSY',`Unexpected review rejection: ${JSON.stringify(body)}`);
   const taskRoute=new URL(result.url()).pathname.split('/items/')[0];
   await expect.poll(async()=>(await request(`${taskRoute}/deletion-preview`)).canDelete,{timeout:15000}).toBe(true);
   await detail.getByRole('button',{name:'刷新当前任务',exact:true}).click();await detail.getByText('任务已刷新',{exact:true}).waitFor();
  }
 };
 const archive=async(id)=>{
  for(let attempt=0;;attempt++){
   await detail.getByRole('button',{name:'归档预览',exact:true}).click();await detail.getByLabel('已核对全部文件和归档位置，确认统一归档',{exact:true}).check();
   const response=page.waitForResponse(response=>response.url().endsWith(`/api/packaging/tasks/${id}/archive`)&&response.request().method()==='POST');
   await detail.getByRole('button',{name:'确认统一归档',exact:true}).click();const result=await response,body=await result.json();
   if(result.ok())break;
   console.log('[installed archive response]',JSON.stringify({taskId:id,status:result.status(),body}));
   // Background discovery can hold this lock. A TASK_BUSY response proves the
   // archive was refused before publication; only that explicit denial retries.
   assert.ok(body.error?.code==='TASK_BUSY'&&attempt<5,`Archive rejected: ${JSON.stringify(body)}`);
   await detail.getByRole('alert').filter({hasText:body.error.message}).waitFor();await page.waitForTimeout(200);
  }
  await expect.poll(async()=>(await request(`/api/packaging/tasks/${id}`)).state,{timeout:20000}).toMatch(/completed|awaiting_index/u);
  let current=await request(`/api/packaging/tasks/${id}`);if(current.state==='awaiting_index'){await detail.getByRole('button',{name:'重试归档索引',exact:true}).click();}
  await expect.poll(async()=>(await request(`/api/packaging/tasks/${id}`)).state).toBe('completed');await detail.locator('.pkg-task-counters').getByText('已完成',{exact:true}).waitFor();return request(`/api/packaging/tasks/${id}`);
 };
 await review(row);task=await archive(task.id);
 const indexed=(await request(`/api/files?productId=${product.id}&presence=all`)).items;assert.equal(indexed.length,1);assert.equal(indexed[0].drawingId,drawing.id);assert.ok(indexed[0].relativePath.includes('02.未转曲源文件'));const formal=path.join(workspace,indexed[0].relativePath);assert.equal(hash(formal),originalHash);assert.equal(fs.existsSync(associated),false);assert.ok(fs.existsSync(temporary));assert.equal(fs.readFileSync(unrelated,'utf8'),'unrelated file must remain');
 await capture('AIT-规划后人工文件归档与索引');
 // A manual navigation clears the planning handoff so a formal modification can be selected normally.
 await go(page,'制图任务');await detail.getByRole('button',{name:'返回任务记录',exact:true}).click();await page.getByRole('combobox',{name:'任务类型',exact:true}).selectOption('modify');
 await page.getByRole('checkbox',{name:`${drawing.fullCode} · ${templateProject.name} · ${color.name}`,exact:true}).check();await page.getByRole('button',{name:'创建任务',exact:true}).click();await detail.waitFor();let modification=(await request(`/api/packaging/tasks?productId=${product.id}`)).items.find(item=>item.state==='active');assert.equal(hash(formal),originalHash);assert.equal(modification.taskDirectory.replaceAll('\\','/'),task.taskDirectory.replaceAll('\\','/'));
 const modifyRow=detail.getByRole('region',{name:`${drawing.fullCode} ${templateProject.name}`,exact:true});await modifyRow.getByRole('button',{name:'设置 / 检查',exact:true}).click();
 const copy=path.join(workspace,modification.items[0].relativePath);writePdf(copy,'Real edited working copy; keep the original until archive');const editedHash=hash(copy);assert.notEqual(editedHash,originalHash);assert.equal(hash(formal),originalHash);
 await expect.poll(async()=>(await request(`/api/packaging/tasks/${modification.id}`)).items[0].sha256).toBe(editedHash);await detail.getByRole('button',{name:'刷新当前任务',exact:true}).click();await detail.getByText('任务已刷新',{exact:true}).waitFor();await expect(modifyRow.getByRole('button',{name:'确认当前文件',exact:true})).toBeDisabled();
 await review(modifyRow);modification=await archive(modification.id);assert.equal(hash(formal),editedHash);assert.equal(hash(path.join(path.dirname(databaseFile),modification.items[0].backupRelativePath)),originalHash);assert.equal(hash(asset),aitHash);
 const backup=await page.evaluate(async({id,itemId})=>{const response=await fetch(`/api/packaging/tasks/${id}/items/${itemId}/backup`);return{status:response.status,bytes:[...new Uint8Array(await response.arrayBuffer())]};},{id:modification.id,itemId:modification.items[0].id});assert.equal(backup.status,200);assert.equal(createHash('sha256').update(Buffer.from(backup.bytes)).digest('hex'),originalHash);
 await capture('AIT-正式文件修改备份与历史');
 await detail.getByRole('button',{name:'返回任务记录',exact:true}).click();
 const deleteRecord=async(taskId,unfinished=false)=>{
  const modelRow=page.locator('.pkg-tasks table tbody tr').filter({has:page.getByRole('button',{name:'删除',exact:true})});
  // Match the row by its creation timestamp and state through the list order returned by the same real API.
  const list=(await request(`/api/packaging/tasks?productId=${product.id}`)).items,index=list.findIndex(task=>task.id===taskId);assert.ok(index>=0);
  await expect.poll(async()=>(await request(`/api/packaging/tasks/${taskId}/deletion-preview`)).canDelete,{timeout:20000}).toBe(true);
  await modelRow.nth(index).getByRole('button',{name:'删除',exact:true}).click();const dialog=page.getByRole('dialog',{name:'删除制图任务记录',exact:true});await dialog.waitFor();await expect(dialog).toContainText('实际 PDF、原始 AIT、正式文件均保留');
  if(unfinished){assert.equal(await dialog.getByRole('button',{name:'确认删除记录',exact:true}).isDisabled(),true);await dialog.getByRole('checkbox').check();}else assert.equal(await dialog.getByRole('checkbox').count(),0);
  for(let attempt=0;;attempt++){
   if(unfinished)await dialog.getByRole('checkbox').check();
   const renewed=page.waitForResponse(r=>r.url().endsWith(`/api/packaging/tasks/${taskId}/deletion-preview`)&&r.request().method()==='GET',{timeout:15000}).catch(()=>null);
   const response=page.waitForResponse(r=>r.url().endsWith(`/api/packaging/tasks/${taskId}/delete`)&&r.request().method()==='POST');
   await dialog.getByRole('button',{name:'确认删除记录',exact:true}).click();const result=await response,body=await result.json();
   if(result.ok())break;
   console.log('[installed task deletion response]',JSON.stringify({status:result.status(),body}));
   if(attempt<3&&body.error?.code==='TASK_DELETE_BLOCKED'&&body.error.message==='任务正在处理文件，请完成后再删除'){
    await expect.poll(async()=>(await request(`/api/packaging/tasks/${taskId}/deletion-preview`)).canDelete,{timeout:20000}).toBe(true);
    await dialog.getByRole('button',{name:'取消',exact:true}).click();
    await modelRow.nth(index).getByRole('button',{name:'删除',exact:true}).click();await dialog.waitFor();
    continue;
   }
   assert.ok(attempt<3&&body.error?.code==='TASK_DELETE_CHANGED',`Unexpected deletion rejection: ${JSON.stringify(body)}`);
   const refreshed=await renewed;assert.ok(refreshed?.ok(),'Existing dialog must retrieve a new preflight token');
   await dialog.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>resolve(null))));
  }
  await dialog.waitFor({state:'detached'});assert.equal((await request(`/api/packaging/tasks?productId=${product.id}`)).items.some(task=>task.id===taskId),false);
 };
 const drawingsBeforeDelete=await request(`/api/drawings?productId=${product.id}`),indicesBeforeDelete=await request(`/api/files?productId=${product.id}&presence=all`);
 await deleteRecord(task.id);assert.equal(hash(formal),editedHash);assert.equal(hash(asset),aitHash);assert.deepEqual(await request(`/api/drawings?productId=${product.id}`),drawingsBeforeDelete);
 const unchangedIndexIds=indicesBeforeDelete.items.map(row=>row.id),indexFacts=observations.indexedPageBusinessFacts;
 assert.deepEqual(indexFacts(await request(`/api/files?productId=${product.id}&presence=all`),unchangedIndexIds),indexFacts(indicesBeforeDelete,unchangedIndexIds));
 // An unfinished formal-copy task retains its file when deleted. Its successor must not adopt that owned file.
 const discarded=await request('/api/packaging/tasks',{productId:product.id,type:'modify',drawings:[{origin:'planned',id:Math.abs(drawing.id)}]});const retained=path.join(workspace,discarded.items[0].relativePath),retainedHash=hash(retained);
 await page.getByRole('button',{name:'刷新任务记录',exact:true}).click();await deleteRecord(discarded.id,true);assert.equal(hash(retained),retainedHash);assert.equal(hash(formal),editedHash);
 const unfinished=await request('/api/packaging/tasks',{productId:product.id,name:'重启恢复验收',type:'new',drawings:[{origin:'planned',id:Math.abs(drawing.id)}]});
 const discovered=await request(`/api/packaging/tasks/${unfinished.id}/discover`,{});assert.equal(discovered.items[0].relativePath,undefined);assert.equal(discovered.pendingFiles.some(file=>file.relativePath===discarded.items[0].relativePath),false);assert.equal(hash(retained),retainedHash);
 await page.getByRole('button',{name:'刷新任务记录',exact:true}).click();await capture('UI15-任务历史删除与文件保留',{responsive:true});
 const after=snapshot(databaseFile);for(const[table,rows]of Object.entries(before)){if(table==='schema_migrations')continue;const original=observations.businessRows(before,table,rows,scope),current=observations.businessRows(before,table,after[table],scope);assert.deepEqual(observations.existingRows(original,current),original,`Original ${table} row changed`);}
 fs.writeFileSync(path.join(evidence,'UI15-layout-geometry.json'),JSON.stringify(geometry,null,2));
 return{actualHttpAndDom:true,actualInstalledHttpAndDom:Boolean(app),menuOrder:true,independentTaskMenu:true,numberOnlyMappingUi:true,planningNoDimensions:true,exactDrawingFocus:true,flatTemporaryDirectory:true,completedDeletionPreservesFiles:true,unfinishedDeletionReleasesLock:true,catalogSavedThroughUi:true,matchingBasisChoicesThroughUi:true,rangeRuleAndSwapSaved:true,reservationToTask:true,singleProductTask:true,watcherDetectedWithoutClick:true,manualAssociation:true,reviewHash:true,newArchiveAndScopedIndex:true,formalEditCopyOnly:true,formalBackupHashPreserved:true,backupReadableThroughRegisteredId:true,taskCleanupOnly:true,taskHistoryRetained:true,originalAitHashPreserved:true,protectedBusinessRowsPreserved:true,unfinishedTaskId:unfinished.id,unfinishedTaskMode:unfinished.items[0].mode,unfinishedTaskParameters:unfinished.items[0].parameters,pdfIndexIds:indexed.map(file=>file.id),productDirectory:task.productDirectory,productId:product.id,realIllustratorGeneration:false,editablePdfReopenVerified:false,aitFixtureUploadOnly:true,limitations:'No licensed Illustrator or real AIT was provided; actual Adobe generation/editability/font/layout acceptance remains local.'};
};
