// @vitest-environment node
import Fastify from 'fastify';
import {it,expect} from 'vitest';
import {openDatabase} from '../../src/db/database';
import {migrateDatabase} from '../../src/db/migrations';
import {DictionaryService} from '../../src/core/dictionaries/dictionary-service';
import {registerDictionaryRoutes} from '../../src/server/routes/dictionaries';
it('requires exact confirmation metadata and returns 204 only after physical deletion',async()=>{
 const db=openDatabase(':memory:');migrateDatabase(db,{databaseExists:false,createBackup:()=>undefined});const service=new DictionaryService(db), app=Fastify();registerDictionaryRoutes(app,service);
 try{const item=service.create({type:'brand',code:'98',name:'归档品牌'});db.prepare("update dictionary_items set deleted_at='2026-10-19',status='inactive' where id=?").run(item.id);
 const base=`/api/dictionaries/items/${item.id}`;
 const before=db.serialize();const preview=await app.inject({method:'GET',url:base+'/permanent-deletion'});expect(preview.statusCode).toBe(200);expect(preview.json()).toMatchObject({allowed:true,item:{id:item.id}});expect(db.serialize()).toEqual(before);
 expect((await app.inject({method:'DELETE',url:base})).statusCode).toBe(409);expect(db.serialize()).toEqual(before);
 expect((await app.inject({method:'DELETE',url:base+'/permanent'})).statusCode).toBe(400);
 const payload={confirmationCode:item.code,expectedName:item.name,expectedDeletedAt:'2026-10-19'};
 expect((await app.inject({method:'DELETE',url:base+'/permanent',payload:{...payload,force:true}})).statusCode).toBe(400);
 expect((await app.inject({method:'DELETE',url:base+'/permanent',payload:{...payload,confirmationCode:'wrong'}})).statusCode).toBe(400);
 service.updateName(item.id,'已变更名称');expect((await app.inject({method:'DELETE',url:base+'/permanent',payload})).statusCode).toBe(409);
 const response=await app.inject({method:'DELETE',url:base+'/permanent',payload:{...payload,expectedName:'已变更名称'}});expect(response.statusCode).toBe(204);expect(response.body).toBe('');expect(db.prepare('select id from dictionary_items where id=?').get(item.id)).toBeUndefined();
 }finally{await app.close();db.close();}
});
