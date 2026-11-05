// @vitest-environment node
import {afterEach,expect,it,vi} from 'vitest';
import {mkdtempSync,mkdirSync,writeFileSync,renameSync,symlinkSync,readFileSync,rmSync,openSync,ftruncateSync,closeSync,statSync,unlinkSync} from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {openDatabase,type PlannerDatabase} from '../../src/db/database';
import {migrateDatabase} from '../../src/db/migrations';
import {FileRepository} from '../../src/core/files/file-repository';
import {FileService} from '../../src/core/files/file-service';
import {WorkspaceSettingsStore} from '../../src/core/files/workspace-settings';
import {scanPdfWorkspace} from '../../src/core/files/pdf-scanner';
import {MaterialBatchService} from '../../src/core/files/material-batch-service';
vi.mock('node:fs/promises',async importOriginal=>{
 const actual=await importOriginal<typeof import('node:fs/promises')>();return {...actual,readdir:vi.fn(actual.readdir)};
});
const production='03.量产后的变更文件（已量产的产品看最新日期）';
const cleanups:Array<()=>void>=[];
afterEach(()=>{vi.restoreAllMocks();vi.mocked(fsPromises.readdir).mockReset();cleanups.splice(0).reverse().forEach(cleanup=>cleanup());});
function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'v52-scan-coverage-'));const root=join(dir,'library');mkdirSync(root);
 const db=openDatabase(':memory:');migrateDatabase(db,{databaseExists:false,createBackup:()=>undefined});
 cleanups.push(()=>rmSync(dir,{recursive:true,force:true}),()=>db.close());
 const repository=new FileRepository(db);const settings=new WorkspaceSettingsStore(join(dir,'settings.json'));settings.setWorkspaceRoot(root);
 const service=new FileService(repository,settings);return {dir,root,db,repository,settings,service};
}
function snapshot(db:PlannerDatabase){
 return ['pdf_files','material_batches','historical_drawing_numbers','drawing_numbers','file_scan_runs','file_scan_changes','pdf_product_assignments','pdf_product_assignment_audit'].map(table=>({table,rows:db.prepare(`select * from ${table} order by rowid`).all()}));
}
function pdf(root:string,relativePath:string){const parts=relativePath.split('/');const path=join(root,...parts);mkdirSync(join(root,...parts.slice(0,-1)),{recursive:true});writeFileSync(path,'%PDF immutable');return path;}
it.each(['category','product','source','production','batch','file'])('preserves all rows when a previously indexed %s becomes an unobserved link',async level=>{
 const f=fixture();const source=pdf(f.root,'类/SKU-M/02.未转曲源文件/02.0404.010.0401001.pdf');
 const outlined=pdf(f.root,`类/SKU-M/${production}/01.20261028/02.0404.010.0401001（转曲）.pdf`);
 await f.service.scan();const before=snapshot(f.db);const config=readFileSync(join(f.dir,'settings.json'),'utf8');
 const paths={category:join(f.root,'类'),product:join(f.root,'类','SKU-M'),source:join(f.root,'类','SKU-M','02.未转曲源文件'),production:join(f.root,'类','SKU-M',production),batch:join(f.root,'类','SKU-M',production,'01.20261028'),file:outlined};
 const original=paths[level as keyof typeof paths];const backup=join(f.dir,'untouched');renameSync(original,backup);symlinkSync(backup,original,level==='file'?'file':'dir');
 await expect(f.service.scan()).rejects.toMatchObject({code:'SCAN_FAILED'});
 expect(snapshot(f.db)).toEqual(before);expect(readFileSync(join(f.dir,'settings.json'),'utf8')).toBe(config);
 expect(readFileSync(source,'utf8')).toBe('%PDF immutable');expect(readFileSync(outlined,'utf8')).toBe('%PDF immutable');expect(f.db.pragma('foreign_key_check')).toEqual([]);
});
it.each(['EACCES','ENETUNREACH'])('does not persist a partially traversed tree when a directory read fails with %s',async code=>{
 const f=fixture();pdf(f.root,'类/SKU-M/02.未转曲源文件/first.pdf');const batch=join(f.root,'类','SKU-M',production,'01.20261028');pdf(f.root,`类/SKU-M/${production}/01.20261028/second.pdf`);await f.service.scan();
 const before=snapshot(f.db);const readdir=(await vi.importActual<typeof fsPromises>('node:fs/promises')).readdir;
 vi.mocked(fsPromises.readdir).mockImplementation(((...args:Parameters<typeof fsPromises.readdir>)=>{
  if(String(args[0])===batch) return Promise.reject(Object.assign(new Error('unreadable directory'),{code}));
  return readdir(...args);
 }) as typeof fsPromises.readdir);
 await expect(f.service.scan()).rejects.toMatchObject({code:'SCAN_FAILED'});expect(snapshot(f.db)).toEqual(before);
});
it('does not persist when fingerprint reading fails after successful enumeration',async()=>{
 const f=fixture();const path=pdf(f.root,'类/SKU-M/02.未转曲源文件/read-failure.pdf');await f.service.scan();const before=snapshot(f.db);
 const failing=new FileService(f.repository,f.settings,async root=>{const files=await scanPdfWorkspace(root);unlinkSync(path);return files;});
 await expect(failing.scan()).rejects.toMatchObject({code:'SCAN_FAILED'});expect(snapshot(f.db)).toEqual(before);
});
it('keeps a 200MiB PDF present and uses source/filename roles across every production batch',async()=>{
 const f=fixture();const large=pdf(f.root,'类/SKU-M/02.未转曲源文件/large（转曲）.pdf');const fd=openSync(large,'r+');ftruncateSync(fd,200*1024*1024);closeSync(fd);const before=statSync(large);
 pdf(f.root,`类/SKU-M/${production}/01.20240101/plain.pdf`);pdf(f.root,`类/SKU-M/${production}/02.20261028/marked（转曲）.pdf`);
 expect(await f.service.scan()).toMatchObject({total:3,source:2,outlined:1,missing:0});
 const files=f.repository.search({presence:'all'}).items;
 expect(files.find(file=>file.fileName==='large（转曲）.pdf')).toMatchObject({isPresent:true,conversionType:'source',materialBatchId:null,sizeBytes:209715200});
 expect(files.find(file=>file.fileName==='plain.pdf')).toMatchObject({conversionType:'source'});expect(f.db.prepare('select count(*) as count from material_batches where is_present=1').get()).toEqual({count:2});
 expect(statSync(large).mtimeMs).toBe(before.mtimeMs);
 unlinkSync(large);expect(await f.service.scan()).toMatchObject({total:2,missing:1});
});
it('preserves every excluded alias index and batch while scanning the strict current trees',async()=>{
 const f=fixture();const aliases=['03.量产后的变更文件','03.量产后的变更文件(已量产的产品看最新日期)','03.量产后的变更明细','03.量产后的变更明细（已量产的产品看最新日期）','03.量产后的变更明细(已量产的产品看最新日期)'];
 const paths=[...aliases.map(name=>`类/SKU-M/${name}/01.20240101/old.pdf`),'类/SKU-M/root.pdf'];
 const insert=f.db.prepare("insert into pdf_files(relative_path,path_key,file_name,match_status,detected_codes_json,conversion_type,size_bytes,modified_at,scanned_at,is_present) values(?,?,'old.pdf','unmatched','[]','source',14,'old','old',1)");
 for(const path of paths){pdf(f.root,path);insert.run(path,path.toLowerCase().replaceAll('/','\\'));}
 for(const name of aliases)f.db.prepare("insert into material_batches(relative_path,product_directory,name,recognition_status,first_seen_at,last_seen_at,is_present) values(?,'类/SKU-M','01.20240101','recognized','old','old',1)").run(`类/SKU-M/${name}/01.20240101`);
 f.db.prepare("update pdf_files set management_state='needs_review' where id=1").run();
 const indices=f.db.prepare('select * from pdf_files order by id').all();const batches=f.db.prepare('select * from material_batches order by id').all();
 pdf(f.root,'类/SKU-M/02.未转曲源文件/current.pdf');expect(await f.service.scan()).toMatchObject({total:1,missing:0});
 expect(f.db.prepare('select * from pdf_files where id<=? order by id').all(indices.length)).toEqual(indices);expect(f.db.prepare('select * from material_batches order by id').all()).toEqual(batches);
 expect(f.repository.search({presence:'all'}).items.map(file=>file.fileName)).toEqual(['current.pdf']);expect(f.repository.latestScan()).toMatchObject({added:1,missing:0});
});
it.each(['batch','ancestor','non-pdf'])('does not call an internal batch empty when its %s is unobserved or occupied',kind=>{
 const f=fixture();const relativePath=`类/SKU-M/${production}/01.20261028`;const directory=join(f.root,...relativePath.split('/'));mkdirSync(directory,{recursive:true});
 const id=Number(f.db.prepare("insert into material_batches(relative_path,product_directory,name,recognition_status,first_seen_at,last_seen_at) values(?,'类/SKU-M','01.20261028','recognized','old','old')").run(relativePath).lastInsertRowid);
 if(kind==='non-pdf')writeFileSync(join(directory,'notes.txt'),'preserve');
 else {const original=kind==='batch'?directory:join(f.root,'类','SKU-M');const target=join(f.root,'excluded');renameSync(original,target);symlinkSync(target,original,'dir');}
 const service=new MaterialBatchService(f.db,()=>f.root);expect(service.previewDeletion(id)?.allowed).toBe(false);
 expect(f.db.prepare('select id from material_batches where id=?').get(id)).toEqual({id});
});
