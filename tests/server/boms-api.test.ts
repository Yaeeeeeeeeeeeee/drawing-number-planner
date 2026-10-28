// @vitest-environment node
import type { BomVersionDetail as BomVersion } from '../../src/core/bom/bom-types';
import Fastify from 'fastify'; import { afterEach, beforeEach, describe, expect, it } from 'vitest'; import { existsSync, mkdtempSync, rmSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join } from 'node:path';
import { BomService } from '../../src/core/bom/bom-service'; import { DictionaryService } from '../../src/core/dictionaries/dictionary-service'; import { PlanningService } from '../../src/core/planning/planning-service'; import { ProductService } from '../../src/core/products/product-service'; import { openDatabase, type PlannerDatabase } from '../../src/db/database'; import { migrateDatabase } from '../../src/db/migrations'; import { registerBomRoutes } from '../../src/server/routes/boms'; import { registerImportRoutes } from '../../src/server/routes/import';
let db: PlannerDatabase; let app: ReturnType<typeof Fastify>; let refs: { product: { id:number }; logo:{id:number}; drawing:{id:number; fullCode:string} };
function multipartAsset(productId: number, filename: string, content: Buffer, boundary = 'BOM-BOUNDARY') {
  return { boundary, payload: Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="productId"\r\n\r\n${productId}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: image/png\r\n\r\n`),
    content, Buffer.from(`\r\n--${boundary}--\r\n`),
  ]) };
}
beforeEach(() => { db=openDatabase(':memory:'); migrateDatabase(db,{databaseExists:false,createBackup:()=>undefined}); const d=new DictionaryService(db), p=new ProductService(db), brand=d.create({type:'brand',code:'02',name:'B'}), size=d.create({type:'product_size',code:'0404',name:'S'}), appearance=d.create({type:'appearance',code:'01',name:'A'}), white=d.create({type:'color',code:'0',name:'W'}), main=d.create({type:'main_category',code:'04',name:'M'}), logo=d.create({type:'project_item',code:'01',name:'L',parentId:main.id}), product=p.create({sku:'SKU',brandId:brand.id,productSizeId:size.id,defaultAppearanceId:appearance.id,model:'X',productCategory:'冰柜'}), plan=new PlanningService(db), input={productId:product.id,rows:[{clientId:'x',colorId:white.id,mainCategoryId:main.id,projectItemId:logo.id}]}, preview=plan.preview(input), drawing=plan.reserve({...input,rows:[{...input.rows[0],expectedFullCode:preview.rows[0].fullCode}]})[0]; refs={product,logo,drawing}; app=Fastify(); registerBomRoutes(app,new BomService(db)); }); afterEach(async()=>{await app.close();db.close();});
describe('product-level BOM API',()=>{
 it('copies into a draft appearance and routes current/history queries using the selected version',async()=>{
   const payload={productId:refs.product.id,businessChangeDate:'2026-10-20',expectedCurrentVersionId:null,items:[{projectItemId:refs.logo.id,drawingId:refs.drawing.id,usesWhiteMaterial:true}]};
   const first=(await app.inject({method:'POST',url:'/api/boms/versions',payload})).json().version;
   const appearanceId=Number(db.prepare("insert into product_appearance_versions(product_id,version_number,label,status,created_at) values(?,2,'API草稿','draft','2026-10-20')").run(refs.product.id).lastInsertRowid);
   const copied=await app.inject({method:'POST',url:`/api/boms/versions/${first.id}/copy-to-appearance`,payload:{appearanceVersionId:appearanceId,businessChangeDate:'2026-10-20'}});
   expect(copied.statusCode).toBe(201);expect(copied.json().diff[0].type).toBe('unchanged');
   expect((await app.inject({method:'GET',url:`/api/boms/current?productId=${refs.product.id}&appearanceVersionId=${appearanceId}`})).json().version.id).toBe(copied.json().version.id);
   expect((await app.inject({method:'GET',url:`/api/boms/current?productId=${refs.product.id}`})).json().version.id).toBe(first.id);
   expect((await app.inject({method:'GET',url:`/api/boms/versions?productId=${refs.product.id}&appearanceVersionId=${appearanceId}`})).json().items).toHaveLength(1);
   expect((await app.inject({method:'GET',url:`/api/boms/current?productId=${refs.product.id}&appearanceVersionId=999999`})).statusCode).toBe(422);
 });
 it('keeps alias-owned legacy history readable and auditable through the original ID contract', async () => {
   const payload={productId:refs.product.id,businessChangeDate:'2026-10-20',expectedCurrentVersionId:null,
     items:[{projectItemId:refs.logo.id,drawingId:refs.drawing.id,usesWhiteMaterial:true,changeDetails:'旧版内容'}]};
   const original=(await app.inject({method:'POST',url:'/api/boms/versions',payload})).json().version;
   // Legacy snapshots can remain unbound after migration and identity merge.
   db.prepare('delete from appearance_bom_current where bom_version_id=?').run(original.id);
   db.prepare('update bom_versions set appearance_version_id=null where id=?').run(original.id);
   const productRow=db.prepare('select * from products where id=?').get(refs.product.id) as Record<string,unknown>;
   const primaryId=new ProductService(db).create({brandId:Number(productRow.brand_id),productSizeId:Number(productRow.product_size_id),defaultAppearanceId:Number(productRow.default_appearance_id),model:'PRIMARY',sku:'PRIMARY',productCategory:'冰柜'}).id;
   db.prepare('update product_identity_members set canonical_product_id=? where raw_product_id=?').run(primaryId,refs.product.id);
   const before=(await app.inject({method:'GET',url:`/api/boms/versions/${original.id}`})).json();
   expect(before).toMatchObject({id:original.id,productId:refs.product.id,appearanceVersionId:null});
   const updated=await app.inject({method:'PUT',url:`/api/boms/versions/${original.id}`,payload:{input:{...payload,items:[{...payload.items[0],changeDetails:'审计纠错'}]},expectedRevision:0}});
   expect(updated.statusCode).toBe(200);
   const after=updated.json().version;
   expect(after).toMatchObject({id:before.id,productId:before.productId,appearanceVersionId:null,createdAt:before.createdAt,businessChangeDate:before.businessChangeDate,previousVersionId:before.previousVersionId,editRevision:1});
   const audit=db.prepare('select before_snapshot_json,after_snapshot_json from bom_revision_snapshots where bom_version_id=?').get(before.id) as {before_snapshot_json:string;after_snapshot_json:string};
   expect(JSON.parse(audit.before_snapshot_json)).toEqual(before);
   expect(JSON.parse(audit.after_snapshot_json)).toEqual(after);
   expect(db.prepare('select count(*) as count from bom_versions').get()).toEqual({count:1});
 });
 it('requires explicit confirmation for attachment migration and reports an unconfigured root', async () => {
   expect((await app.inject({ method: 'POST', url: '/api/boms/assets/1/archive', payload: { confirmed: false } })).statusCode).toBe(400);
   const response = await app.inject({ method: 'POST', url: '/api/boms/assets/1/archive', payload: { confirmed: true } });
   expect(response.statusCode).toBe(422); expect(response.json().error.message).toContain('资料根目录');
 });
 it('edits in place and returns a conflict without overwriting a newer edit', async () => {
   const input = { productId: refs.product.id, businessChangeDate: '2026-09-02', expectedCurrentVersionId: null,
     items: [{ projectItemId: refs.logo.id, drawingId: refs.drawing.id, usesWhiteMaterial: true, changeDetails: '初稿' }] };
   const original = (await app.inject({ method: 'POST', url: '/api/boms/versions', payload: input })).json().version;
   const edit = { input: { ...input, items: [{ ...input.items[0], changeDetails: '更换文字' }] }, expectedRevision: 0 };
   const updated = await app.inject({ method: 'PUT', url: `/api/boms/versions/${original.id}`, payload: edit });
   expect(updated.statusCode).toBe(200);
   expect(updated.json().version).toMatchObject({ id: original.id, createdAt: original.createdAt, editRevision: 1,
     items: [expect.objectContaining({ changeDetails: '更换文字' })] });
   const stale = await app.inject({ method: 'PUT', url: `/api/boms/versions/${original.id}`, payload: edit });
   expect(stale.statusCode).toBe(409);
   expect(stale.json().error.code).toBe('BOM_STALE');
   expect((await app.inject({ method: 'GET', url: `/api/boms/versions/${original.id}` })).json().items[0].changeDetails).toBe('更换文字');
   expect((await app.inject({ method: 'GET', url: `/api/boms/versions?productId=${refs.product.id}` })).json().items).toHaveLength(1);
 });
 it('accepts and returns a historical drawing reference only in historical entry mode',async()=>{
   const historicalDrawingId=Number(db.prepare(`insert into historical_drawing_numbers
     (full_code,brand_code,product_size_code,appearance_code,color_code,main_category_code,project_item_code,sequence,
      product_id,detected_sku,detected_model,detected_product_category,first_seen_at,last_seen_at,status)
     values ('02.0404.010.0401008','02','0404','01','0','04','01',8,?,'SKU','X','冰柜','2026-09-01','2026-09-01','inactive')`)
     .run(refs.product.id).lastInsertRowid);
   const candidates=await app.inject({method:'GET',url:`/api/boms/candidates?productId=${refs.product.id}&projectItemId=${refs.logo.id}&usesWhiteMaterial=true&entryMode=historical`});
   expect(candidates.statusCode).toBe(200);
   expect(candidates.json().items).toContainEqual(expect.objectContaining({origin:'historical',historicalDrawingId,status:'inactive'}));
   const saved=await app.inject({method:'POST',url:'/api/boms/versions',payload:{productId:refs.product.id,entryMode:'historical',
     businessChangeDate:'2020-01-02',expectedCurrentVersionId:null,items:[{projectItemId:refs.logo.id,
       drawingReference:{origin:'historical',historicalDrawingId},usesWhiteMaterial:true}]}});
   expect(saved.statusCode).toBe(201);
   expect(saved.json().version.items[0]).toMatchObject({origin:'historical',historicalDrawingId,fullCode:'02.0404.010.0401008'});
   expect((await app.inject({method:'GET',url:'/api/boms/query?fullCode=0401008'})).json().items).toHaveLength(1);
 });
 it('saves, queries and maps stale/malformed/domain errors',async()=>{ expect((await app.inject({method:'GET',url:`/api/boms/current?productId=${refs.product.id}`})).json()).toEqual({version:null}); const bad=await app.inject({method:'POST',url:'/api/boms/versions',payload:{productId:refs.product.id,expectedCurrentVersionId:null,items:[]}}); expect(bad.statusCode).toBe(400); const payload={productId:refs.product.id,businessChangeDate:'2026-09-02',expectedCurrentVersionId:null,items:[{projectItemId:refs.logo.id,drawingId:refs.drawing.id,usesWhiteMaterial:true}]}; const saved=await app.inject({method:'POST',url:'/api/boms/versions',payload}); expect(saved.statusCode).toBe(201); expect((await app.inject({method:'POST',url:'/api/boms/versions',payload})).statusCode).toBe(409); expect((await app.inject({method:'GET',url:`/api/boms/query?model=X&fullCode=${encodeURIComponent(refs.drawing.fullCode)}&businessChangeDate=2026-09-02`})).json().items).toHaveLength(1); });
 it('previews and soft-deletes only the selected BOM change, then hides it from normal queries',async()=>{
   const payload={productId:refs.product.id,businessChangeDate:'2026-09-02',expectedCurrentVersionId:null,
     items:[{projectItemId:refs.logo.id,drawingId:refs.drawing.id,usesWhiteMaterial:true}]};
   const first=(await app.inject({method:'POST',url:'/api/boms/versions',payload})).json().version;
   const second=(await app.inject({method:'POST',url:'/api/boms/versions',payload:{...payload,businessChangeDate:'2026-09-03',expectedCurrentVersionId:first.id}})).json().version;
   const preview=await app.inject({method:'GET',url:`/api/boms/versions/${second.id}/delete-preview`});
   expect(preview.statusCode).toBe(200); expect(preview.json()).toMatchObject({isCurrent:true,fallbackVersionId:first.id,fallbackVersionNumber:1});
   expect((await app.inject({method:'DELETE',url:`/api/boms/versions/${second.id}`,payload:{confirmed:false}})).statusCode).toBe(422);
   const deleted=await app.inject({method:'DELETE',url:`/api/boms/versions/${second.id}`,payload:{confirmed:true}});
   expect(deleted.statusCode).toBe(200); expect(deleted.json()).toMatchObject({deletedVersionId:second.id,currentVersionId:first.id});
   expect((await app.inject({method:'GET',url:`/api/boms/current?productId=${refs.product.id}`})).json().version.id).toBe(first.id);
   expect((await app.inject({method:'GET',url:`/api/boms/versions/${second.id}`})).statusCode).toBe(404);
   expect((await app.inject({method:'GET',url:`/api/boms/versions?productId=${refs.product.id}`})).json().items.map((item:{id:number})=>item.id)).toEqual([first.id]);
 });
 it('protects whole-product BOM deletion with exact model confirmation',async()=>{
   const payload={productId:refs.product.id,businessChangeDate:'2026-09-02',expectedCurrentVersionId:null,
     items:[{projectItemId:refs.logo.id,drawingId:refs.drawing.id,usesWhiteMaterial:true}]};
   await app.inject({method:'POST',url:'/api/boms/versions',payload});
   const mismatch=await app.inject({method:'DELETE',url:`/api/boms/products/${refs.product.id}`,payload:{modelConfirmation:'x'}});
   expect(mismatch.statusCode).toBe(422); expect(mismatch.json().error.code).toBe('BOM_MODEL_CONFIRMATION_MISMATCH');
   const deleted=await app.inject({method:'DELETE',url:`/api/boms/products/${refs.product.id}`,payload:{modelConfirmation:'X'}});
   expect(deleted.statusCode).toBe(200); expect(deleted.json()).toMatchObject({deletedCount:1,currentVersionId:null});
 });
 it('keeps the shared multipart parser at 20MiB so Excel uploads above the BOM limit still reach Excel validation',async()=>{
   await registerImportRoutes(app,db,()=>undefined);
   const boundary='EXCEL-BOUNDARY'; const body=Buffer.concat([
     Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="large.xlsx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`),
     Buffer.alloc(10*1024*1024+1),Buffer.from(`\r\n--${boundary}--\r\n`),
   ]);
   const response=await app.inject({method:'POST',url:'/api/import/excel/audit',headers:{'content-type':`multipart/form-data; boundary=${boundary}`},payload:body});
   expect(response.statusCode).not.toBe(413); expect(response.statusCode).toBeLessThan(500);
 });
 it('imports a real multipart image, preserves its original name, and rejects fake image content',async()=>{
   const workspace=mkdtempSync(join(tmpdir(),'bom-route-success-')); const uploadApp=Fastify(); registerBomRoutes(uploadApp,new BomService(db,()=>workspace));
   const valid=multipartAsset(refs.product.id,'客户示意图.png',Buffer.from([137,80,78,71,13,10,26,10]));
   const accepted=await uploadApp.inject({method:'POST',url:'/api/boms/assets',headers:{'content-type':`multipart/form-data; boundary=${valid.boundary}`},payload:valid.payload});
   expect(accepted.statusCode).toBe(201); const asset=accepted.json().asset;
   expect(asset).toMatchObject({originalFileName:'客户示意图.png',mimeType:'image/png',sizeBytes:8});
   expect(existsSync(join(workspace,asset.relativePath))).toBe(true);
   const preview = await uploadApp.inject({ method: 'GET', url: `/api/boms/assets/${asset.id}/preview` });
   expect(preview.statusCode).toBe(200);
   expect(preview.headers['content-type']).toBe('image/png');
   expect(preview.headers['x-content-type-options']).toBe('nosniff');
   expect(preview.rawPayload).toEqual(Buffer.from([137,80,78,71,13,10,26,10]));
   const fake=multipartAsset(refs.product.id,'fake.png',Buffer.from('not-an-image'),'FAKE-BOUNDARY');
   const rejected=await uploadApp.inject({method:'POST',url:'/api/boms/assets',headers:{'content-type':`multipart/form-data; boundary=${fake.boundary}`},payload:fake.payload});
   expect(rejected.statusCode).toBe(422); expect(rejected.json().error.code).toBe('ASSET_CONTENT_INVALID');
   expect(db.prepare('select count(*) as count from bom_assets').get()).toEqual({count:1});
   await uploadApp.close(); rmSync(workspace,{recursive:true,force:true});
 });
 it('relinks a legacy batch snapshot through the HTTP route without changing its content',async()=>{
   const batchPath='01.冰柜\\SKU-X\\03.量产后的变更文件\\01.20260901';
   const batchId=Number(db.prepare(`insert into material_batches
     (relative_path,product_directory,product_id,name,sequence_number,recognition_status,is_present,first_seen_at,last_seen_at)
     values (?,'01.冰柜\\SKU-X',?,'01.20260901',1,'recognized',1,'2026-09-01','2026-09-01')`).run(batchPath,refs.product.id).lastInsertRowid);
   const versionId=Number(db.prepare(`insert into bom_versions (product_id,version_number,business_change_date,created_at)
     values (?,1,'2026-09-01','2026-09-01')`).run(refs.product.id).lastInsertRowid);
   const itemId=Number(db.prepare(`insert into bom_items
     (bom_version_id,project_item_id,drawing_id,quantity,effective_batch_relative_path,effective_batch_name,notes,uses_white_material)
     values (?,?,?,1,?,'01.20260901','keep me',0)`).run(versionId,refs.logo.id,refs.drawing.id,batchPath).lastInsertRowid);
   const response=await app.inject({method:'POST',url:`/api/boms/material-batches/${batchId}/relink`});
   expect(response.statusCode).toBe(200); expect(response.json()).toEqual({relinked:1});
   expect(db.prepare('select effective_material_batch_id as batchId,notes from bom_items where id=?').get(itemId))
     .toEqual({batchId,notes:'keep me'});
 });
 it('rejects both the BOM limit and shared parser limit with a stable envelope and no asset row',async()=>{ const workspace=mkdtempSync(join(tmpdir(),'bom-route-')); const uploadApp=Fastify(); registerBomRoutes(uploadApp,new BomService(db,()=>workspace)); const request=async(boundary:string,size:number)=>{ const payload=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="productId"\r\n\r\n${refs.product.id}\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="oversize.png"\r\nContent-Type: image/png\r\n\r\n`),Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(size),Buffer.from(`\r\n--${boundary}--\r\n`)]); return uploadApp.inject({method:'POST',url:'/api/boms/assets',headers:{'content-type':`multipart/form-data; boundary=${boundary}`},payload}); }; const bomLimit=await request('BOM-LIMIT',10*1024*1024); expect(bomLimit.statusCode).toBe(422); expect(bomLimit.json().error.code).toBe('ASSET_TOO_LARGE'); const parserLimit=await request('PARSER-LIMIT',20*1024*1024); expect(parserLimit.statusCode).toBe(422); expect(parserLimit.json().error.code).toBe('ASSET_TOO_LARGE'); expect(db.prepare('select count(*) as count from bom_assets').get()).toEqual({count:0}); await uploadApp.close(); rmSync(workspace,{recursive:true,force:true}); });
});
it('updates one of three existing versions without POST, preserves original dates and keeps legacy NULL dates',async()=>{
 const base={productId:refs.product.id,items:[{projectItemId:refs.logo.id,drawingId:refs.drawing.id,usesWhiteMaterial:true,material:'原稿'}]};
 const versions: BomVersion[]=[];for(const day of ['01','02','03']){const saved=(await app.inject({method:'POST',url:'/api/boms/versions',payload:{...base,businessChangeDate:`2026-09-${day}`,expectedCurrentVersionId:versions.at(-1)?.id??null}})).json().version;versions.push(saved);}
 const middle=versions[1];const edit=await app.inject({method:'PUT',url:`/api/boms/versions/${middle.id}`,payload:{input:{...base,expectedCurrentVersionId:versions[2].id,items:[{...base.items[0],material:'修改'}]},expectedRevision:middle.editRevision}});
 expect(edit.statusCode).toBe(200);expect(edit.json().version).toMatchObject({id:middle.id,businessChangeDate:middle.businessChangeDate,createdAt:middle.createdAt,previousVersionId:versions[0].id});expect(edit.json().version.items[0].material).toBe('修改');
 expect((await app.inject({method:'GET',url:`/api/boms/versions?productId=${refs.product.id}`})).json().items).toHaveLength(3);
 expect((await app.inject({method:'GET',url:`/api/boms/versions/${versions[0].id}`})).json()).toEqual(versions[0]);expect((await app.inject({method:'GET',url:`/api/boms/versions/${versions[2].id}`})).json()).toEqual(versions[2]);
 const changedDate=await app.inject({method:'PUT',url:`/api/boms/versions/${middle.id}`,payload:{input:{...base,expectedCurrentVersionId:versions[2].id,businessChangeDate:'2030-01-01'},expectedRevision:edit.json().version.editRevision}});expect(changedDate.statusCode).toBe(200);expect(changedDate.json().version).toMatchObject({id:middle.id,businessChangeDate:'2030-01-01',createdAt:middle.createdAt,previousVersionId:versions[0].id});
 const invalidDate=await app.inject({method:'PUT',url:`/api/boms/versions/${middle.id}`,payload:{input:{...base,expectedCurrentVersionId:versions[2].id,businessChangeDate:'2030-02-30'},expectedRevision:changedDate.json().version.editRevision}});expect(invalidDate.statusCode).toBe(422);
 expect((await app.inject({method:'GET',url:'/api/boms/current?productId='+refs.product.id})).json().version.id).toBe(versions[2].id);
 db.prepare('update bom_versions set business_change_date=null where id=?').run(versions[0].id);
 const legacy=await app.inject({method:'PUT',url:`/api/boms/versions/${versions[0].id}`,payload:{input:{...base,expectedCurrentVersionId:versions[2].id},expectedRevision:0}});expect(legacy.statusCode).toBe(200);expect(legacy.json().version.businessChangeDate).toBeNull();expect(legacy.json().version.createdAt).toBe(versions[0].createdAt);
});

it('combines category, real product identity, main/project, inclusive business-date range and partial code', async()=>{
 const input={productId:refs.product.id,businessChangeDate:'2026-10-20',expectedCurrentVersionId:null,items:[{projectItemId:refs.logo.id,drawingId:refs.drawing.id,usesWhiteMaterial:true}]};
 const saved=(await app.inject({method:'POST',url:'/api/boms/versions',payload:input})).json().version;
 const main=(db.prepare('select parent_id as id from dictionary_items where id=?').get(refs.logo.id) as {id:number}).id;
 const params=new URLSearchParams({productCategory:'冰柜',productId:String(refs.product.id),mainCategoryId:String(main),projectItemId:String(refs.logo.id),businessDateFrom:'2026-10-20',businessDateTo:'2026-10-20',fullCode:refs.drawing.fullCode.slice(-6)});
 const query=async()=>app.inject({method:'GET',url:`/api/boms/query?${params}`});
 expect((await query()).statusCode).toBe(200);expect((await query()).json().items.map((v:{id:number})=>v.id)).toEqual([saved.id]);
 for(const [key,value] of [['productCategory','其他'],['productId','99999'],['mainCategoryId','99999'],['businessDateFrom','2026-10-21'],['businessDateTo','2026-10-19']] as const){const old=params.get(key)!;params.set(key,value);expect((await query()).json().items).toEqual([]);params.set(key,old);}
});
