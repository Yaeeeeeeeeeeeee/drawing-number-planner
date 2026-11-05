// @vitest-environment node
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase,type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';
import { DictionaryService } from '../../src/core/dictionaries/dictionary-service';
import { ProductService } from '../../src/core/products/product-service';
import { QrService } from '../../src/core/qr/qr-service';
import { QrManualService } from '../../src/core/qr/qr-manual-service';
import { registerQrCodeRoutes } from '../../src/server/routes/qr-codes';
let db:PlannerDatabase,dir:string;
beforeEach(()=>{dir=mkdtempSync(join(tmpdir(),'qr-api-'));db=openDatabase(':memory:');migrateDatabase(db,{databaseExists:false,createBackup:()=>undefined});});
afterEach(()=>{db.close();rmSync(dir,{recursive:true,force:true});});
describe('manual QR API boundary',()=>{
 it('reads and unlinks actual local PDF association with revision while refusing untrusted HTTP path registration',async()=>{
 const d=new DictionaryService(db);const brand=d.create({type:'brand',code:'B',name:'B'}),size=d.create({type:'product_size',code:'S',name:'S'}),appearance=d.create({type:'appearance',code:'A',name:'A'});
 const product=new ProductService(db).create({sku:'SKU70',model:'ZU70SD',productCategory:'冰柜',brandId:brand.id,productSizeId:size.id,defaultAppearanceId:appearance.id});const qr=new QrService(db),manual=new QrManualService(db),purpose=qr.listPurposes().items.find(p=>p.key==='warranty')!;
 const path=join(dir,'ZU70SD-Warranty(pdgp845).pdf');writeFileSync(path,'%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');const selection=manual.selectTrustedFile(path);const preview=manual.preview({token:selection.token,productId:product.id,purposeId:purpose.id,name:'Warranty',targetUrl:'https://qrs.ly/pdgp845'});const code=manual.commit(preview.previewId);
 const app=Fastify();registerQrCodeRoutes(app,qr,manual);
 const history=await app.inject({method:'GET',url:`/api/qr-codes/${code.id}/manual-history`});expect(history.statusCode).toBe(200);expect(history.json().items[0].absolute_path).toBe(path);
 const bad=await app.inject({method:'DELETE',url:`/api/qr-codes/${code.id}/manual-link`,payload:{revision:'stale'}});expect(bad.statusCode).toBe(409);expect(qr.get(code.id).files).toHaveLength(1);
 const ok=await app.inject({method:'DELETE',url:`/api/qr-codes/${code.id}/manual-link`,payload:{revision:history.json().revision}});expect(ok.statusCode).toBe(200);expect(ok.json().files).toEqual([]);expect(manual.history(code.id).items).toHaveLength(1);
 const untrusted=await app.inject({method:'POST',url:'/api/qr-manual/select',payload:{path}});expect(untrusted.statusCode).toBe(404);await app.close();
 });
});
