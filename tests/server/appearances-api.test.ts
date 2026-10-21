import Fastify from 'fastify';
import { expect,it } from 'vitest';
import {openDatabase} from '../../src/db/database';
import {migrateDatabase} from '../../src/db/migrations';
import {ProductService} from '../../src/core/products/product-service';
import {AppearanceService} from '../../src/core/products/appearance-service';
import {registerAppearanceRoutes} from '../../src/server/routes/appearances';
it('serves real versions, rejects stale activation and validates strict merge confirmation',async()=>{
 const db=openDatabase(':memory:');migrateDatabase(db,{databaseExists:false,createBackup(){}});const app=Fastify();
 try{
 db.exec("insert into dictionary_items(id,type,code,name,created_at) values(1,'brand','02','品牌','2026-01-01'),(2,'product_size','0209','尺寸','2026-01-01')");
 const product=new ProductService(db).create({sku:'S',model:'M',brandId:1,productSizeId:2,productCategory:'冰柜'});registerAppearanceRoutes(app,new AppearanceService(db));
 const first=await app.inject({method:'GET',url:`/api/products/${product.id}/appearances`});expect(first.statusCode).toBe(200);expect(first.json().items).toHaveLength(1);
 const draft=await app.inject({method:'POST',url:`/api/products/${product.id}/appearances`,payload:{label:'第二代'}});expect(draft.statusCode).toBe(201);
 const stale=await app.inject({method:'POST',url:`/api/appearances/${draft.json().id}/activate`,payload:{expectedRevision:0,expectedIdentityRevision:0}});expect(stale.statusCode).toBe(409);expect(stale.json().error.code).toBe('STALE_REVISION');
 const resources=await app.inject({method:'GET',url:`/api/appearances/${draft.json().id}/resources`});expect(resources.statusCode).toBe(200);expect(resources.json().unboundCounts).toEqual({drawings:0,pdfs:0,qrCodes:0,boms:0,outboundPackages:0});
 expect((await app.inject({method:'POST',url:'/api/products/merge-confirm',payload:{primaryProductId:product.id,aliasProductIds:[product.id],confirmed:false}})).statusCode).toBe(400);
 }finally{await app.close();db.close();}
});
