// Regression acceptance on the disposable, actually installed Windows application.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
module.exports=async function verify111({page,app,legacy,evidence,writePdf,go}){
 assert.ok(process.env.RUNNER_TEMP&&path.resolve(legacy).startsWith(path.resolve(process.env.RUNNER_TEMP)+path.sep));
 const request=(route,body,method='POST')=>page.evaluate(async({route,body,method})=>{
  const token=(await(await fetch('/api/session',{method:'POST'})).json()).token;
  const response=await fetch(route,{method,headers:{'content-type':'application/json','x-planner-token':token},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const value=await response.json();if(!response.ok)throw Error(route+': '+JSON.stringify(value));return value;
 },{route,body,method});
 const get=route=>request(route,undefined,'GET'),items=value=>value.items??value;
 const dictionary=async(type,code,name)=>{const existing=items(await get(`/api/dictionaries/${type}?includeInactive=false`)).find(item=>item.code===code);return existing??await request(`/api/dictionaries/${type}`,{code,name});};
 const brand=await dictionary('brand','02','SAMKYO'),size=await dictionary('product_size','0305','冰柜 ZU70SD'),appearance=await dictionary('appearance','01','一号外观');
 const product=await request('/api/products',{sku:'SKDZU070JP',model:'ZU70SD',productCategory:'冰柜',brandId:brand.id,productSizeId:size.id,defaultAppearanceId:appearance.id});
 const code='02.0305.010.0201001';
 const paths=[['冰柜','SKDZU070JP-ZU70SD','02.未转曲源文件',`${code}-SAMKYO-ZU70SD白色-铭牌.pdf`],['冰柜','SKDZU070JP-ZU70SD','03.量产后的变更文件（已量产的产品看最新日期）','00.首批大货',`${code}-SAMKYO-ZU70SD白色-铭牌（转曲）.pdf`]];
 const originals=paths.map((parts,index)=>{const file=path.join(legacy,'workspace',...parts);writePdf(file,`Reported ZU70SD ${index}`);return{file,hash:createHash('sha256').update(fs.readFileSync(file)).digest('hex')};});
 await page.reload();await page.getByRole('heading',{name:'图号规划',exact:true}).waitFor();await go(page,'PDF 文件中心');await page.getByRole('button',{name:'扫描资料库',exact:true}).click();await page.getByText('资料库扫描完成',{exact:true}).waitFor({timeout:45000});
 const files=items(await get(`/api/files?keyword=${code}&presence=all`));assert.equal(files.length,2);assert.deepEqual(files.map(file=>file.conversionType).sort(),['outlined','source']);assert.ok(files.every(file=>file.isPresent));
 const ids=files.map(file=>file.id).sort((a,b)=>a-b),source=files.find(file=>file.conversionType==='source'),outlined=files.find(file=>file.conversionType==='outlined');assert.equal(source.materialBatchId,null);assert.ok(outlined.materialBatchId);
 const counts=await get('/api/files/navigation');assert.ok(counts.sources.some(item=>item.productId===product.id&&item.count===1));assert.ok(counts.batches.some(item=>item.materialBatchId===outlined.materialBatchId&&item.count===1));
 const catalog=page.getByRole('navigation',{name:'资料导航'}),branch=catalog.locator('.pdf-nav-product').filter({has:page.getByRole('button',{name:'产品 SKDZU070JP · ZU70SD',exact:true})});
 const productButton=branch.getByRole('button',{name:'产品 SKDZU070JP · ZU70SD',exact:true});await productButton.click();const expand=branch.locator('.pdf-nav-expand').first();if(await expand.getAttribute('aria-expanded')==='false')await expand.click();
 await branch.getByRole('button',{name:'未转曲源文件',exact:true}).click();await page.getByRole('checkbox',{name:`选择 ${paths[0].at(-1)}`,exact:true}).waitFor();await page.getByRole('checkbox',{name:`选择 ${paths[1].at(-1)}`,exact:true}).waitFor({state:'detached'});assert.equal(await page.getByRole('checkbox',{name:`选择 ${paths[1].at(-1)}`,exact:true}).count(),0);
 const sourceRow=page.getByRole('checkbox',{name:`选择 ${paths[0].at(-1)}`,exact:true}).locator('xpath=ancestor::tr');await sourceRow.locator('[data-column-key=batch]').getByText('未转曲源文件',{exact:true}).waitFor();assert.equal((await sourceRow.locator('[data-column-key=batchStatus]').textContent()).trim(),'—');
 await page.screenshot({path:path.join(evidence,'Windows-1.1.1-真实目录-未转曲.png')});
 await branch.getByRole('button',{name:'批次 首批大货',exact:true}).click();await page.getByRole('checkbox',{name:`选择 ${paths[1].at(-1)}`,exact:true}).waitFor();await page.getByRole('checkbox',{name:`选择 ${paths[0].at(-1)}`,exact:true}).waitFor({state:'detached'});assert.equal(await page.getByRole('checkbox',{name:`选择 ${paths[0].at(-1)}`,exact:true}).count(),0);
 await page.screenshot({path:path.join(evidence,'Windows-1.1.1-真实目录-首批大货.png')});
 await page.getByRole('button',{name:'扫描资料库',exact:true}).click();await page.getByText('资料库扫描完成',{exact:true}).waitFor({timeout:45000});assert.deepEqual(items(await get(`/api/files?keyword=${code}&presence=all`)).map(file=>file.id).sort((a,b)=>a-b),ids);for(const file of originals)assert.equal(createHash('sha256').update(fs.readFileSync(file.file)).digest('hex'),file.hash);
 await go(page,'编码字典');const geometry=[];
 for(const width of [1920,1366,2560,3840,720]){
  await app.evaluate(({BrowserWindow},width)=>BrowserWindow.getAllWindows()[0].setContentSize(width,1080),width);await page.waitForFunction(width=>innerWidth===width,width);if(width<1024){const close=page.getByRole('button',{name:'关闭导航',exact:true});if(await close.isVisible())await close.click();}
  const table=page.locator('.dictionaries-real-page table.layout-table').first();await table.waitFor();const handle=table.getByRole('separator',{name:'调整状态列宽',exact:true});const box=await handle.boundingBox();assert.ok(box);await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+2000,box.y+box.height/2,{steps:4});await page.mouse.up();
  const measured=await table.evaluate(table=>{const container=table.parentElement,rect=table.getBoundingClientRect();return{tableWidth:rect.width,available:container.clientWidth,scrollWidth:container.scrollWidth,buttonsInside:[...table.querySelectorAll('tbody td[data-column-key=actions] button')].every(button=>{const b=button.getBoundingClientRect(),cell=button.closest('td').getBoundingClientRect();return b.left>=cell.left-1&&b.right<=cell.right+1;})};});assert.ok(measured.tableWidth<=measured.available+1,JSON.stringify(measured));assert.ok(measured.scrollWidth<=measured.available+1,JSON.stringify(measured));assert.ok(measured.buttonsInside);geometry.push({viewport:width,...measured});await page.screenshot({path:path.join(evidence,`Windows-1.1.1-列宽限制-${width}.png`)});
 }
 return{reportedSourceAndAnnotatedProductionPaths:true,sourceNodeAndInitialBatch:true,sourceBatchColumnsCorrect:true,sameIndexIdsAfterRescan:true,originalPdfHashesPreserved:originals.length,tableContainment:geometry,actualInstalledHttpAndDom:true};
};
