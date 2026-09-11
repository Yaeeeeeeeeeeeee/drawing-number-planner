// @vitest-environment node
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
