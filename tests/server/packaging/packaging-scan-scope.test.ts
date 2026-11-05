// @vitest-environment node
import Fastify from 'fastify';
import {mkdirSync,writeFileSync,rmSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {expect,it} from 'vitest';
import {setup} from '../../core/packaging/catalog-fixture';
import {PackagingWorkspace} from '../../../src/core/packaging/packaging-workspace';
import {FileService} from '../../../src/core/files/file-service';
import {FileRepository} from '../../../src/core/files/file-repository';
import {WorkspaceSettingsStore} from '../../../src/core/files/workspace-settings';
import {registerPackagingTaskRoutes} from '../../../src/server/routes/packaging-tasks';
import {registerFileRoutes} from '../../../src/server/routes/files';

it('scans only enabled canonical products in the exact category and preserves all other indices',async()=>{
  const f=setup(),root=join(f.dir,'library'),app=Fastify();mkdirSync(root);
  f.db.prepare("update products set sku='ONE',model='A' where id=?").run(f.first);
  f.db.prepare("update products set sku='TWO',model='B',product_category='other' where id=?").run(f.second);
  const inactive=Number(f.db.prepare("insert into products(brand_id,product_size_id,sku,model,product_category,status,created_at) values(?,?,'OFF','C','category','inactive','now')").run(f.brand,f.db.prepare('select product_size_id from products limit 1').pluck().get()).lastInsertRowid);
  const paths=['category/ONE-A','other/TWO-B','category/OFF-C'];
  for(const directory of paths){mkdirSync(join(root,directory,'02.未转曲源文件'),{recursive:true});writeFileSync(join(root,directory,'02.未转曲源文件','source.pdf'),'%PDF-1.7\ncontent\n%%EOF');}
  const settings=new WorkspaceSettingsStore(join(f.dir,'settings.json'));settings.setWorkspaceRoot(root);
  const files=new FileService(new FileRepository(f.db),settings),workspace=new PackagingWorkspace(f.db,()=>root);
  registerPackagingTaskRoutes(app,{db:f.db,workspace,options:{files,dataDir:f.dir}} as never,{} as never);registerFileRoutes(app,files);
  try{
    await files.scan();const otherBefore=f.db.prepare("select * from pdf_files where relative_path like 'other/%'").all();
    writeFileSync(join(root,paths[0],'02.未转曲源文件','new.pdf'),'%PDF-1.7\nnew\n%%EOF');
    unlinkSync(join(root,paths[1],'02.未转曲源文件','source.pdf'));
    const response=await app.inject({method:'POST',url:'/api/packaging/scan-category',payload:{category:'category'}});
    expect(response.statusCode,response.body).toBe(200);expect(response.json().comparison.scope).toEqual({kind:'products',productDirectories:['category/ONE-A']});
    expect(f.db.prepare("select * from pdf_files where relative_path like 'other/%'").all()).toEqual(otherBefore);
    expect(f.db.prepare("select count(*) n from pdf_files where file_name='new.pdf'").get()).toEqual({n:1});
    expect((await app.inject({method:'POST',url:'/api/packaging/scan-category',payload:{category:'absent'}})).statusCode).toBe(422);
    expect((await app.inject({method:'POST',url:'/api/packaging/scan-category',payload:{category:'category',productIds:[f.second]}})).statusCode).toBe(422);
    expect((await app.inject({method:'POST',url:'/api/packaging/scan-product',payload:{productId:inactive}})).statusCode).toBe(422);
    const index=files.search({presence:'all'}).items.find(file=>file.relativePath.startsWith('other/'))!;
    expect((await app.inject({method:'GET',url:`/api/files/${index.id}/presence`})).json()).toMatchObject({scanIsPresent:true,status:'missing'});
    expect((await app.inject({method:'GET',url:'/api/files/99999/presence'})).statusCode).toBe(404);
    expect((await app.inject({method:'GET',url:'/api/files/invalid/presence'})).statusCode).toBe(400);
    expect(f.db.pragma('foreign_key_check')).toEqual([]);
  }finally{await app.close();f.db.close();rmSync(f.dir,{recursive:true,force:true});}
});
