// @vitest-environment node
import {afterEach, expect, it} from 'vitest';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,unlinkSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase,type PlannerDatabase} from '../../src/db/database';
import {migrateDatabase} from '../../src/db/migrations';
import {FileRepository} from '../../src/core/files/file-repository';
import {FileService} from '../../src/core/files/file-service';
import {WorkspaceSettingsStore} from '../../src/core/files/workspace-settings';
import {scanPdfWorkspace} from '../../src/core/files/pdf-scanner';
const production='03.量产后的变更文件（已量产的产品看最新日期）';
const cleanups:Array<()=>void>=[];
afterEach(()=>cleanups.splice(0).reverse().forEach(cleanup=>cleanup()));
function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'scoped-pdf-')),root=join(dir,'library');mkdirSync(root);
 const db=openDatabase(':memory:');migrateDatabase(db,{databaseExists:false,createBackup:()=>undefined});
 cleanups.push(()=>rmSync(dir,{recursive:true,force:true}),()=>db.close());
 const repository=new FileRepository(db),settings=new WorkspaceSettingsStore(join(dir,'settings.json'));settings.setWorkspaceRoot(root);
 return {root,db,repository,settings,service:new FileService(repository,settings)};
}
function pdf(root:string,path:string,content='%PDF stable'){const absolute=join(root,...path.split('/'));mkdirSync(join(absolute,'..'),{recursive:true});writeFileSync(absolute,content);return absolute;}
function snapshot(db:PlannerDatabase){return ['pdf_files','material_batches','file_scan_runs','file_scan_changes','pdf_file_decisions'].map(table=>db.prepare(`select * from ${table} order by rowid`).all());}
it('updates only the complete requested product while preserving other PDFs, batches and decisions',async()=>{
 const f=fixture();const a=pdf(f.root,'类/SKU-A/02.未转曲源文件/a.pdf');pdf(f.root,`类/SKU-A/${production}/01.20260101/old.pdf`);
 const b=pdf(f.root,`类/SKU-A2/${production}/01.20260101/b.pdf`);await f.service.scan();
 const beforePdf=f.db.prepare("select * from pdf_files where file_name='b.pdf'").get();const beforeBatch=f.db.prepare("select * from material_batches where product_directory like '%A2'").get();
 unlinkSync(a);pdf(f.root,'类/SKU-A/02.未转曲源文件/new.pdf','%PDF new content');pdf(f.root,'类/SKU-A/00.临时文件/ignored.pdf');
 // An inaccessible different product cannot abort this product's scan.
 const unrelated=join(f.root,'不可读');symlinkSync(join(f.root,'absent'),unrelated,'dir');
 expect(await f.service.scanProducts(['类/SKU-A'])).toMatchObject({total:2,missing:1,currentTotal:2});
 expect(f.db.prepare("select * from pdf_files where file_name='b.pdf'").get()).toEqual(beforePdf);
 expect(f.db.prepare("select * from material_batches where product_directory like '%A2'").get()).toEqual(beforeBatch);
 expect(readFileSync(b,'utf8')).toBe('%PDF stable');expect(f.repository.latestScan()).toMatchObject({added:1,missing:1,unchanged:1,scope:{kind:'products',productDirectories:['类/SKU-A']}});
 expect(f.repository.search({presence:'all'}).items.some(file=>file.fileName==='ignored.pdf')).toBe(false);
});
it('does not borrow an ignored file from an unobserved product as move evidence',async()=>{
 const f=fixture();pdf(f.root,'类/SKU-A/02.未转曲源文件/old.pdf');pdf(f.root,'类/SKU-B/02.未转曲源文件/ignored.pdf');await f.service.scan();
 const ignored=f.repository.search({presence:'all'}).items.find(file=>file.fileName==='ignored.pdf')!;
 const preview=f.service.previewManagement({ids:[ignored.id],action:'ignore'});f.service.applyManagement({...preview});
 const oldDecision=f.db.prepare('select * from pdf_file_decisions').all();pdf(f.root,'类/SKU-A/02.未转曲源文件/new.pdf');
 await f.service.scanProducts(['类/SKU-A']);
 expect(f.db.prepare("select management_state from pdf_files where file_name='new.pdf'").get()).toEqual({management_state:'included'});
 expect(f.db.prepare('select * from pdf_file_decisions').all()).toEqual(oldDecision);
});
it.each([[],['类'],['类/SKU-A/02.未转曲源文件'],['../SKU-A'],['类//SKU-A'],['/类/SKU-A'],['C:\\类\\SKU-A']].map(scope=>({scope})))('rejects invalid scope $scope without changing the index',async ({scope})=>{
 const f=fixture();pdf(f.root,'类/SKU-A/02.未转曲源文件/a.pdf');await f.service.scan();const before=snapshot(f.db);
 await expect(f.service.scanProducts(scope)).rejects.toThrow();expect(snapshot(f.db)).toEqual(before);
});
it('preserves the index when a selected product directory is missing or linked',async()=>{
 const f=fixture();pdf(f.root,'类/SKU-A/02.未转曲源文件/a.pdf');await f.service.scan();const before=snapshot(f.db);
 await expect(f.service.scanProducts(['类/MISSING'])).rejects.toThrow();
 symlinkSync(join(f.root,'类','SKU-A'),join(f.root,'类','LINK'),'dir');await expect(f.service.scanProducts(['类/LINK'])).rejects.toThrow();
 expect(snapshot(f.db)).toEqual(before);
});
it('shares the full-scan mutex and rejects injected out-of-scope scanner records',async()=>{
 const f=fixture();pdf(f.root,'类/SKU-A/02.未转曲源文件/a.pdf');pdf(f.root,'类/SKU-B/02.未转曲源文件/b.pdf');
 let release!:()=>void;const delayed=new FileService(f.repository,f.settings,async root=>{await new Promise<void>(resolve=>{release=resolve;});return scanPdfWorkspace(root);});
 const scan=delayed.scanProducts(['类/SKU-A']);await expect(delayed.scan()).rejects.toMatchObject({code:'SCAN_IN_PROGRESS'});release();
 await expect(scan).rejects.toMatchObject({code:'SCAN_FAILED'});expect(f.repository.latestScan()).toBeNull();
});
it('does not submit partial absence when a file changed after directory enumeration',async()=>{
 const f=fixture();const file=pdf(f.root,'类/SKU-A/02.未转曲源文件/a.pdf');await f.service.scan();const before=snapshot(f.db);
 const changing=new FileService(f.repository,f.settings,async(root,options)=>{const files=await scanPdfWorkspace(root,options);writeFileSync(file,'%PDF being copied with more bytes');return files;});
 await expect(changing.scan()).rejects.toMatchObject({code:'SCAN_FAILED'});expect(snapshot(f.db)).toEqual(before);
});

it('keeps an existing empty product scope uncommitted if its directory disappears during enumeration',async()=>{
 const f=fixture();const file=pdf(f.root,'类/SKU-A/02.未转曲源文件/a.pdf');await f.service.scan();unlinkSync(file);const before=snapshot(f.db);
 const changing=new FileService(f.repository,f.settings,async(root,options)=>{const files=await scanPdfWorkspace(root,options);rmSync(join(root,'类','SKU-A'),{recursive:true});return files;});
 await expect(changing.scanProducts(['类/SKU-A'])).rejects.toMatchObject({code:'SCAN_FAILED'});expect(snapshot(f.db)).toEqual(before);
});
it('handles wildcard, apostrophe and supplementary Unicode characters as exact directory segments',async()=>{
 const f=fixture(),selected="类/😀_%'SKU-A";const a=pdf(f.root,`${selected}/02.未转曲源文件/a.pdf`);pdf(f.root,"类/😀_X'SKU-A/02.未转曲源文件/b.pdf");await f.service.scan();
 const b=f.db.prepare("select * from pdf_files where file_name='b.pdf'").get();unlinkSync(a);expect(await f.service.scanProducts([selected])).toMatchObject({missing:1,total:0});
 expect(f.db.prepare("select * from pdf_files where file_name='b.pdf'").get()).toEqual(b);
});

it('marks only the selected Unicode product batch missing when its last PDF disappears',async()=>{
 const f=fixture(),selected='类/Ä-SKU';const path=pdf(f.root,`${selected}/${production}/01.20260101/a.pdf`);pdf(f.root,`类/OTHER/${production}/01.20260101/b.pdf`);await f.service.scan();
 const other=f.db.prepare("select * from material_batches where product_directory='类\\OTHER'").get();unlinkSync(path);await f.service.scanProducts([selected]);
 expect(f.db.prepare("select is_present from material_batches where product_directory=?").get(selected.replaceAll('/','\\'))).toEqual({is_present:0});
 expect(f.db.prepare("select * from material_batches where product_directory='类\\OTHER'").get()).toEqual(other);
});
it('rejects a PDF changed after hashing but before the final index transaction',async()=>{
 const f=fixture();const path=pdf(f.root,'类/SKU-A/02.未转曲源文件/a.pdf');await f.service.scan();const before=snapshot(f.db);
 const controller=new AbortController();await expect(f.service.scanProducts(['类/SKU-A'],{id:'test',signal:controller.signal,throwIfCancelled(){},beginFinalizing(){},report(progress){
  if(progress.phase==='fingerprinting'&&progress.processed===1)writeFileSync(path,'%PDF changed after hashing');
 }})).rejects.toMatchObject({code:'SCAN_FAILED'});expect(snapshot(f.db)).toEqual(before);
});
