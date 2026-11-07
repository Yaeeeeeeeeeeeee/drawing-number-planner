const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {createRequire}=require('node:module');

/** Runs the approved workflow in the actual installed renderer/local service.
 * All business rows and files created here belong to the isolated CI fixture. */
module.exports=async function verify({page,app,source,workspace,evidence,databaseFile,snapshot,writePdf}){
 const {expect}=createRequire(path.join(source,'package.json'))('@playwright/test');
 const request=(route,body,method=body===undefined?'GET':'POST')=>page.evaluate(async({route,body,method})=>{
  const token=(await(await fetch('/api/session',{method:'POST'})).json()).token;
  const response=await fetch(route,{method,headers:{'content-type':'application/json','x-planner-token':token},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const value=await response.json();if(!response.ok)throw Error(`${route}: ${value.error?.message??response.status}`);return value;
 },{route,body,method});
 const navigation=page.getByRole('navigation',{name:'主导航'});
 const dictionary=async(type,code,name,parentId)=>{const listed=await request(`/api/dictionaries/${type}?includeInactive=false`),existing=listed.items.find(item=>item.code===code&&(parentId==null||item.parentId===parentId));return existing??request(`/api/dictionaries/${type}`,{code,name,...(parentId?{parentId}:{})});};
 const brand=await dictionary('brand','97','连续实施验收品牌'),appearance=await dictionary('appearance','97','验收外观'),color=await dictionary('color','7','连续实施验收颜色'),main=await dictionary('main_category','97','连续实施验收包材');
 const projects=[await dictionary('project_item','01','安全结束验收项目',main.id),await dictionary('project_item','02','独立占号验收项目',main.id)];
 const products=[];
 for(const[index,model]of ['CONF-A','CONF-B'].entries()){
  const size=await dictionary('product_size',`970${index+1}`,`连续实施品类${index+1}`);
  products.push(await request('/api/products',{sku:`CONFIRMED-${index+1}`,model,brandId:brand.id,productSizeId:size.id,defaultAppearanceId:appearance.id,productCategory:'连续实施验收'}));
 }
 for(const product of products){const directory=(await request(`/api/packaging/product-directories?productId=${product.id}`)).items[0];fs.mkdirSync(path.join(workspace,directory.relativePath),{recursive:true});}
 await page.reload();
 if(!await navigation.isVisible())await page.getByRole('button',{name:'展开导航',exact:true}).click();
 await navigation.getByRole('button',{name:'图号规划 / 更新包材',exact:true}).click();await page.getByRole('button',{name:'批量规划',exact:true}).click();
 for(const product of products)await page.getByRole('checkbox',{name:new RegExp(product.model)}).check();
 await page.getByRole('button',{name:'下一步',exact:true}).click();
 const fields=async(number,project)=>{
  await page.getByRole('combobox',{name:`第 ${number} 行主类别`,exact:true}).selectOption(String(main.id));
  await page.getByRole('combobox',{name:`第 ${number} 行项目明细`,exact:true}).selectOption(String(project.id));
  await page.getByRole('combobox',{name:`第 ${number} 行颜色`,exact:true}).selectOption(String(color.id));
  await page.getByRole('checkbox',{name:`第 ${number} 行其他颜色共用白色图号`,exact:true}).uncheck();
 };
 await fields(1,projects[0]);await page.getByRole('button',{name:'添加项目',exact:true}).click();await fields(2,projects[1]);
 await page.getByRole('textbox',{name:'第 1 行备注',exact:true}).fill('型号A独立输入');await page.getByRole('tab',{name:products[1].model,exact:true}).click();await fields(1,projects[0]);
 await page.getByRole('tab',{name:products[0].model,exact:true}).click();assert.equal(await page.getByRole('textbox',{name:'第 1 行备注',exact:true}).inputValue(),'型号A独立输入');
 await page.getByRole('button',{name:'下一步',exact:true}).click();await expect(page.getByText('可占用',{exact:true})).toHaveCount(3);
 await page.getByRole('button',{name:'下一步',exact:true}).click();assert.equal(await page.getByRole('button',{name:'确认批量占号',exact:true}).isDisabled(),true);
 // The saved step survives a real renderer reload; approval never does.
 await expect.poll(async()=>{const state=await request('/api/planning/drafts/batch');return state.draft?.input.step;}).toBe(4);
 await page.reload();await page.getByRole('button',{name:'批量规划',exact:true}).click();await page.getByRole('button',{name:'确认批量占号',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'确认批量占号',exact:true}).isDisabled(),true);await page.getByRole('button',{name:'重新检查全部项目',exact:true}).click();await expect(page.getByText('可占用',{exact:true})).toHaveCount(3);
 await page.screenshot({path:path.join(evidence,'Windows-确认需求-多型号四步确认.png'),fullPage:true});
 await page.getByRole('checkbox',{name:'已核对本次占号清单',exact:true}).check();await page.getByRole('button',{name:'确认批量占号',exact:true}).click();await page.getByText('成功 3 项',{exact:true}).waitFor();
 const drawings=(await Promise.all(products.map(product=>request(`/api/drawings?productId=${product.id}`)))).flatMap(result=>result.items);assert.equal(drawings.length,3);assert.equal(new Set(drawings.map(drawing=>drawing.fullCode)).size,3);
 await page.getByRole('button',{name:`查看 ${products[0].model} 图号库`,exact:true}).click();const drawer=page.getByRole('complementary',{name:'图号详情',exact:true});await drawer.waitFor();assert.ok((await drawer.getByRole('heading').allTextContents()).some(text=>drawings.some(drawing=>drawing.productId===products[0].id&&drawing.fullCode===text)));await drawer.getByRole('button',{name:'关闭图号详情',exact:true}).click();
 await navigation.getByRole('button',{name:'图号规划 / 更新包材',exact:true}).click();await page.getByRole('region',{name:'本次占号结果',exact:true}).waitFor();await page.getByRole('button',{name:'生成文件',exact:true}).first().click();await page.getByRole('button',{name:'创建任务',exact:true}).click();
 const detail=page.getByRole('region',{name:'当前制图任务',exact:true});await detail.waitFor();const task=(await request(`/api/packaging/tasks?productId=${products[0].id}`)).items.find(task=>task.state==='active'&&!task.endedAt);assert.ok(task);
 const drawing=drawings.find(drawing=>drawing.productId===products[0].id&&drawing.projectItemId===projects[0].id);assert.ok(drawing);
 const file=path.join(workspace,task.productDirectory,'02.未转曲源文件',`${drawing.fullCode}-CONF-A-验收.pdf`);writePdf(file,'Retained formal original');const hash=createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 const scan=async()=>{for(let n=0;n<50;n++){try{return await request('/api/packaging/scan-product',{productId:products[0].id});}catch(error){if(!/正在扫描|资料库正在|扫描.*进行/u.test(error.message))throw error;await page.waitForTimeout(100);}}throw Error('Product scan did not settle');};await scan();
 const release=await request(`/api/drawings/${drawing.id}/force-release-preview`);await request(`/api/drawings/${drawing.id}/force-release`,{fingerprint:release.fingerprint,confirmed:true,reason:'隔离验收：模拟已删除图号和强制脱钩PDF'});
 const indices=()=>snapshot(databaseFile).pdf_files.filter(row=>row.relative_path.replaceAll('\\','/').startsWith(task.productDirectory.replaceAll('\\','/')+'/')).map(({id,drawing_id,historical_drawing_id,content_sha256})=>({id,drawing_id,historical_drawing_id,content_sha256}));const beforeEnd=indices();
 await detail.getByRole('button',{name:'返回任务记录',exact:true}).click();const row=page.locator('.pkg-tasks table tbody tr').filter({hasText:products[0].model});await row.getByRole('button',{name:'保留文件并结束任务',exact:true}).click();const dialog=page.getByRole('dialog',{name:'保留文件并结束任务',exact:true});await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'确认结束任务',exact:true}).click();await dialog.waitFor({state:'hidden'});
 const ended=await request(`/api/packaging/tasks/${task.id}`);assert.ok(ended.endedAt);assert.notEqual(ended.state,'completed');assert.deepEqual(indices(),beforeEnd);assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'),hash);
 const remaining=drawings.find(row=>row.productId===products[0].id&&row.id!==drawing.id);const replacement=await request('/api/packaging/tasks',{productId:products[0].id,type:'new',drawings:[{origin:'planned',id:remaining.id}]});assert.notEqual(replacement.id,task.id);
 await page.screenshot({path:path.join(evidence,'Windows-确认需求-保留文件结束任务.png'),fullPage:true});
 const state=snapshot(databaseFile),canonical=new Map((state.product_identity_members??[]).map(row=>[row.raw_product_id,row.canonical_product_id])),monitored=new Set();
 for(const product of state.products.filter(row=>row.status==='active'&&!row.deleted_at&&(canonical.get(row.id)??row.id)===row.id)){
  try{for(const directory of (await request(`/api/packaging/product-directories?productId=${product.id}`)).items)if(directory.exists)monitored.add(directory.relativePath.replaceAll('\\','/'));}catch{}
 }
 const monitorProductDirectories=[...monitored],monitorPdfIndexIds=state.pdf_files.filter(row=>monitorProductDirectories.some(directory=>row.relative_path.replaceAll('\\','/').startsWith(directory+'/'))).map(row=>row.id);
 return {monitorProductDirectories,monitorPdfIndexIds,actualInstalledHttpAndDom:Boolean(app),fourStepBatch:true,modelSpecificSelections:true,distinctCompleteCodes:true,persistedDraftRequiresFreshCheck:true,explicitConfirmation:true,exactLibraryNavigation:true,deletedDrawingTaskSafelyEnded:true,detachedPdfNotReclaimed:true,formalFileHashPreserved:true,endedNotArchived:true,taskLockReleased:true,originalHash:hash,productionDatabaseOperated:false};
};
