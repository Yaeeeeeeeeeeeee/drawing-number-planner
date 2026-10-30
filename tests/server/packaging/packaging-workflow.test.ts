// @vitest-environment node
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect,it} from 'vitest';
import {startServer} from '../../../src/server/start-server';
import {openDatabase} from '../../../src/db/database';
import {DictionaryService} from '../../../src/core/dictionaries/dictionary-service';
import {ProductService} from '../../../src/core/products/product-service';
import {PlanningService} from '../../../src/core/planning/planning-service';

it('runs the real local HTTP manual-file task through review/archive/index and rejects unsafe requests',async()=>{
 const dataDir=mkdtempSync(join(tmpdir(),'packaging-http-')),root=join(dataDir,'library');mkdirSync(root);writeFileSync(join(dataDir,'settings.json'),JSON.stringify({workspaceRoot:root}));
 const server=await startServer({port:0,dataDir});const db=openDatabase(join(dataDir,'planner.db'));
 try{
  const d=new DictionaryService(db),brand=d.create({type:'brand',code:'83',name:'HTTP Brand'}),size=d.create({type:'product_size',code:'8383',name:'HTTP Category'}),appearance=d.create({type:'appearance',code:'83',name:'Appearance'}),color=d.create({type:'color',code:'3',name:'Color'}),main=d.create({type:'main_category',code:'83',name:'Material'}),project=d.create({type:'project_item',parentId:main.id,code:'01',name:'HTTP Label'});
  const product=new ProductService(db).create({sku:'HTTP83',model:'MODEL83',brandId:brand.id,productSizeId:size.id,defaultAppearanceId:appearance.id,productCategory:'HTTP Category'}),planning=new PlanningService(db),input={productId:product.id,rows:[{clientId:'http',colorId:color.id,mainCategoryId:main.id,projectItemId:project.id}]},preview=planning.preview(input),drawing=planning.reserve({...input,rows:[{...input.rows[0],expectedFullCode:preview.rows[0].fullCode}]})[0];
  const request=async(route:string,body?:unknown,method=body===undefined?'GET':'POST')=>{const response=await fetch(server.url+route,{method,headers:{'content-type':'application/json','x-planner-token':server.token,origin:server.url},...(body===undefined?{}:{body:JSON.stringify(body)})});return{status:response.status,data:await response.json()};};
  expect((await request('/api/packaging/catalog')).data).toMatchObject({templates:[],dimensions:[],rules:[],configs:[]});
  expect((await request('/api/packaging/tasks',{productId:product.id,name:'bad',type:'new',drawings:[]})).status).toBe(422);
  expect((await request('/api/packaging/create-temporary-directories',{productIds:[product.id]})).data.items[0].created).toBe(true);
  const created=await request('/api/packaging/tasks',{productId:product.id,name:'HTTP manual job',type:'new',drawings:[{origin:'planned',id:drawing.id}]});expect(created.status).toBe(201);const task=created.data;
  const repeated=await request('/api/packaging/tasks',{productId:product.id,name:'duplicate',type:'new',drawings:[{origin:'planned',id:drawing.id}]});expect(repeated.status).toBe(409);expect(repeated.data.error.details.existingTaskId).toBe(task.id);
  const original='%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n',source=join(root,task.productDirectory,'00.临时文件','unknown.pdf');writeFileSync(source,original);
  let found=(await request(`/api/packaging/tasks/${task.id}/discover`,{})).data;
  for(let i=0;i<30&&!found.pendingFiles.length;i++){await new Promise(resolve=>setTimeout(resolve,25));found=(await request(`/api/packaging/tasks/${task.id}`)).data;}
  expect(found.pendingFiles[0].status).toBe('pending');expect((await request('/api/files')).data.items).toHaveLength(0);
  const linked=await request(`/api/packaging/tasks/${task.id}/files/${found.pendingFiles[0].id}/link`,{itemId:task.items[0].id});expect(linked.status).toBe(200);const item=linked.data.items[0];expect(existsSync(source)).toBe(false);
  expect((await request(`/api/packaging/tasks/${task.id}/items/${item.id}/review`,{sha256:'0'.repeat(64)})).status).toBe(409);
  expect((await request(`/api/packaging/tasks/${task.id}/items/${item.id}/review`,{sha256:item.sha256})).status).toBe(200);
  expect((await request(`/api/packaging/tasks/${task.id}/archive`,{confirmed:false})).status).toBe(422);
  let result=await request(`/api/packaging/tasks/${task.id}/archive`,{confirmed:true});for(let i=0;i<30&&result.data.error?.code==='SCAN_IN_PROGRESS';i++){await new Promise(resolve=>setTimeout(resolve,25));result=await request(`/api/packaging/tasks/${task.id}/archive`,{confirmed:true});}
  expect(result.status).toBe(200);expect(result.data.state).toBe('completed');const files=(await request('/api/files')).data.items;expect(files).toHaveLength(1);expect(files[0].drawingId).toBe(drawing.id);expect(readFileSync(join(root,files[0].relativePath),'utf8')).toBe(original);
  const scoped=await request('/api/packaging/scan-product',{productId:product.id});expect(scoped.status).toBe(200);expect(scoped.data.comparison.scope).toMatchObject({kind:'products',productDirectories:[task.productDirectory]});
  expect((await request('/api/packaging/scan-product',{productId:99999})).status).toBe(422);
  const file=await fetch(`${server.url}/api/packaging/tasks/${task.id}/items/${item.id}/file`);expect(file.status).toBe(200);expect(await file.text()).toBe(original);
  expect((await request(`/api/packaging/tasks/${task.id}/items/${item.id}`,{parameters:{length:99}},'PUT')).status).toBe(422);
  expect(db.prepare('select count(*) n from drawing_numbers').get()).toEqual({n:1});expect(db.pragma('foreign_key_check')).toEqual([]);
 }finally{await server.close();db.close();rmSync(dataDir,{recursive:true,force:true});}
},20000);
