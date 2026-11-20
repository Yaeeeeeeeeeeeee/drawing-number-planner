// @vitest-environment node
import Fastify from 'fastify';
import {mkdirSync,writeFileSync,rmSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import * as fs from 'node:fs/promises';
import {expect,it,vi} from 'vitest';
import {setup} from '../../core/packaging/catalog-fixture';
import {PackagingWorkspace} from '../../../src/core/packaging/packaging-workspace';
import {FileService} from '../../../src/core/files/file-service';
import {FileRepository} from '../../../src/core/files/file-repository';
import {WorkspaceSettingsStore} from '../../../src/core/files/workspace-settings';
import {registerPackagingTaskRoutes} from '../../../src/server/routes/packaging-tasks';
import {registerFileRoutes} from '../../../src/server/routes/files';
import {registerTaskRoutes} from '../../../src/server/routes/tasks';
import {TaskRegistry} from '../../../src/core/tasks/task-registry';

it('scans only enabled canonical products in the exact category and preserves all other indices',async()=>{
  const f=setup(),root=join(f.dir,'library'),app=Fastify();mkdirSync(root);
  f.db.prepare("update products set sku='ONE',model='A' where id=?").run(f.first);
  f.db.prepare("update products set sku='TWO',model='B',product_category='other' where id=?").run(f.second);
  const inactive=Number(f.db.prepare("insert into products(brand_id,product_size_id,sku,model,product_category,status,created_at) values(?,?,'OFF','C','category','inactive','now')").run(f.brand,f.db.prepare('select product_size_id from products limit 1').pluck().get()).lastInsertRowid);
  const paths=['category/ONE-A','other/TWO-B','category/OFF-C'];
  for(const directory of paths){mkdirSync(join(root,directory,'02.未转曲源文件'),{recursive:true});writeFileSync(join(root,directory,'02.未转曲源文件','source.pdf'),'%PDF-1.7\ncontent\n%%EOF');}
  const settings=new WorkspaceSettingsStore(join(f.dir,'settings.json'));settings.setWorkspaceRoot(root);
  const files=new FileService(new FileRepository(f.db),settings),workspace=new PackagingWorkspace(f.db,()=>root);
  const tasks=new TaskRegistry();
  registerPackagingTaskRoutes(app,{db:f.db,workspace,options:{files,dataDir:f.dir}} as never,{} as never,tasks);registerFileRoutes(app,files,tasks);
  try{
    for(const [kind,payload] of [['workspace_scan',{}],['product_scan',{productId:f.first}],['category_scan',{category:'category'}]] as const){
      const task=tasks.create(kind,payload);await tasks.wait(task.id);expect(tasks.get(task.id)).toMatchObject({status:'completed',result:{comparison:{scope:{kind:kind==='workspace_scan'?'workspace':'products'}}}});
    }
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


vi.mock('node:fs/promises', async importOriginal => {
  const real = await importOriginal<typeof fs>();
  return { ...real, readdir: vi.fn(real.readdir) };
});

it.each([
  { kind: 'product_scan', source: 'product', direct: false },
  { kind: 'category_scan', source: 'category', direct: false },
  { kind: 'product_scan', source: 'product', direct: true },
] as const)('keeps the $source scan owner during stalled preflight (direct=$direct)', async ({ kind, source, direct }) => {
  const f = setup(), root = join(f.dir, 'library'), app = Fastify();
  const relativePath = 'category/ONE-A';
  const sourceDir = join(root, relativePath, '02.未转曲源文件');
  mkdirSync(sourceDir, { recursive: true });
  writeFileSync(join(sourceDir, 'keep.pdf'), '%PDF-1.7\n%%EOF');
  f.db.prepare("update products set sku='ONE',model='A' where id=?").run(f.first);
  f.db.prepare("update products set status='inactive' where id=?").run(f.second);
  const settings = new WorkspaceSettingsStore(join(f.dir, 'settings.json'));
  settings.setWorkspaceRoot(root);
  const files = new FileService(new FileRepository(f.db), settings);
  const workspace = new PackagingWorkspace(f.db, () => root), tasks = new TaskRegistry();
  registerPackagingTaskRoutes(app, { db: f.db, workspace, options: { files, dataDir: f.dir } } as never, {} as never, tasks);
  registerFileRoutes(app, files, tasks);
  registerTaskRoutes(app, tasks);
  const real = await vi.importActual<typeof fs>('node:fs/promises');
  let release!: () => void, waiting = false;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const payload = source === 'product' ? { productId: f.first } : { category: 'category' };
  const start = () => app.inject({ method: 'POST', url: '/api/tasks/' + kind, payload });
  const status = async () => (await app.inject('/api/files/scans/status')).json();
  const snapshot = () => ({
    runs: f.db.prepare('select * from file_scan_runs order by id').all(),
    files: f.db.prepare('select * from pdf_files order by id').all(),
    schema: f.db.prepare('select * from sqlite_schema order by name').all(),
  });
  try {
    await files.scan();
    const initial = snapshot();
    vi.mocked(fs.readdir).mockImplementation((async (path: string, ...options: unknown[]) => {
      if (path === root) { waiting = true; await gate; }
      return Reflect.apply(real.readdir, undefined, [path, ...options]);
    }) as typeof fs.readdir);
    const directResult = direct ? app.inject({ method: 'POST', url: '/api/packaging/scan-product', payload }).then(result => result) : null;
    const submitted = direct ? null : await start();
    if (submitted) expect(submitted.statusCode).toBe(202);
    await vi.waitFor(() => expect(waiting).toBe(true));
    const current = (await status()).active;
    const taskId = direct ? current.taskId : submitted!.json().id;
    expect(taskId).toEqual(expect.any(String));
    expect(current).toMatchObject({ source, taskId, status: 'running', progress: { phase: 'checking-directories' } });
    const competing = await app.inject({ method: 'POST', url: '/api/packaging/scan-product', payload: { productId: f.first } });
    expect(competing.statusCode).toBe(409);
    expect(competing.json().error).toMatchObject({ code: 'SCAN_IN_PROGRESS' });
    expect(competing.json().error.message).toContain(current.id);
    const cancellation = await app.inject({ method: 'POST', url: '/api/tasks/' + taskId + '/cancel' });
    expect(cancellation.statusCode).toBe(202);
    expect((await status()).active).toMatchObject({ id: current.id, status: 'stopping', stoppedPhase: 'checking-directories' });
    expect((await app.inject('/api/tasks/' + taskId)).json().status).toBe('running');
    const duringCancellation = await app.inject({ method: 'POST', url: '/api/packaging/scan-category', payload: { category: 'category' } });
    expect(duringCancellation.statusCode).toBe(409);
    expect(duringCancellation.json().error.message).toContain(current.id);
    expect(snapshot()).toEqual(initial);
    release();
    await tasks.wait(taskId);
    expect(tasks.get(taskId)?.status).toBe('cancelled');
    if (directResult) expect((await directResult).json().error.code).toBe('SCAN_CANCELLED');
    expect((await status()).active).toBeNull();
    expect(snapshot()).toEqual(initial);
    expect(f.db.pragma('foreign_key_check')).toEqual([]);
    const retry = (await start()).json().id;
    await tasks.wait(retry);
    expect(retry).not.toBe(taskId);
    expect(tasks.get(retry)).toMatchObject({
      status: 'completed', result: { scanId: 2, comparison: { scope: { kind: 'products', productDirectories: [relativePath] } } },
    });
  } finally {
    release();
    await files.closeScans();
    vi.mocked(fs.readdir).mockImplementation(real.readdir);
    await app.close();
    f.db.close();
    rmSync(f.dir, { recursive: true, force: true });
  }
});
