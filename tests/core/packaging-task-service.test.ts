import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {afterEach,expect,it,vi} from 'vitest';
import {openDatabase} from '../../src/db/database';
import {migrateDatabase} from '../../src/db/migrations';
import {DictionaryService} from '../../src/core/dictionaries/dictionary-service';
import {ProductService} from '../../src/core/products/product-service';
import {PlanningService} from '../../src/core/planning/planning-service';
import {FileService} from '../../src/core/files/file-service';
import {FileRepository} from '../../src/core/files/file-repository';
import {WorkspaceSettingsStore} from '../../src/core/files/workspace-settings';
import {PackagingCatalogService} from '../../src/core/packaging/packaging-catalog';
import {PackagingTaskService} from '../../src/core/packaging/packaging-task-service';
import * as packagingFiles from '../../src/core/packaging/packaging-file-operations';

const cleanups:(()=>void)[]=[];afterEach(()=>cleanups.splice(0).reverse().forEach(fn=>fn()));
const pdf='%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n';
function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'packaging-workflow-')),root=join(dir,'workspace');mkdirSync(root);const db=openDatabase(join(dir,'planner.db'));migrateDatabase(db,{databaseExists:false,createBackup:()=>undefined});cleanups.push(()=>{db.close();rmSync(dir,{recursive:true,force:true});});
 const dict=new DictionaryService(db),brand=dict.create({type:'brand',code:'02',name:'品牌'}),size=dict.create({type:'product_size',code:'0305',name:'冰柜'}),appearance=dict.create({type:'appearance',code:'01',name:'外观'}),color=dict.create({type:'color',code:'0',name:'白色'}),main=dict.create({type:'main_category',code:'02',name:'铭牌类'}),project=dict.create({type:'project_item',code:'01',name:'铭牌',parentId:main.id});
 const products=new ProductService(db),product=products.create({sku:'SKU1',model:'M1',brandId:brand.id,productSizeId:size.id,defaultAppearanceId:appearance.id,productCategory:'冰柜'});
 const plan=new PlanningService(db),input={productId:product.id,rows:[{clientId:'a',colorId:color.id,mainCategoryId:main.id,projectItemId:project.id}]},preview=plan.preview(input),drawing=plan.reserve({...input,rows:input.rows.map((row,i)=>({...row,expectedFullCode:preview.rows[i].fullCode}))})[0];
 const settings=new WorkspaceSettingsStore(join(dir,'settings.json'));settings.setWorkspaceRoot(root);const files=new FileService(new FileRepository(db),settings),catalog=new PackagingCatalogService(db,dir);
 catalog.saveConfig({projectItemId:project.id,mode:'manual',parameters:[]});
 const automation={inspect:vi.fn(),generate:vi.fn(),openPdf:vi.fn()};
 const options={workspaceRoot:()=>root,dataDir:dir,catalog,automation,files,stableDelayMs:0};const service=new PackagingTaskService(db,options);
 const create=()=>service.createTask({productId:product.id,name:'首批铭牌',type:'new',drawings:[{origin:'planned',id:drawing.id}]});
 return{dir,root,db,files,service,catalog,product,drawing,project,main,brand,create,options,plan,input,color,products,size,appearance,automation};
}
it('persists one unfinished task per real product without reserving or changing BOM/history',async()=>{
 const f=fixture(),before=f.db.prepare('select * from drawing_numbers').all();const task=await f.create();
 expect(task.items[0]).toMatchObject({fullCode:f.drawing.fullCode,state:'awaiting_upload',mode:'manual'});
 expect(task.taskDirectory.split(/[\\/]/).slice(0,3)).toEqual(['冰柜','SKU1-M1','00.临时文件']);
 await expect(f.create()).rejects.toThrow(/未完成/);
 const restored=new PackagingTaskService(f.db,f.options);expect((await restored.getTask(task.id)).items[0].fullCode).toBe(f.drawing.fullCode);
 expect(f.db.prepare('select * from drawing_numbers').all()).toEqual(before);expect(f.db.prepare('select count(*) n from bom_versions').get()).toEqual({n:0});
});
it('discovers one stable full-code manual PDF, requires exact review, archives/indexes only its product and keeps history',async()=>{
 const f=fixture(),task=await f.create();const rootFile=join(f.root,'冰柜','SKU1-M1','00.临时文件',`${f.drawing.fullCode}-铭牌.pdf`);writeFileSync(rootFile,pdf);
 const discovered=await f.service.discover(task.id),item=discovered.items[0];expect(item.state).toBe('awaiting_review');expect(existsSync(rootFile)).toBe(false);
 expect((await f.service.archivePreview(task.id)).ready).toBe(false);
 await expect(f.service.reviewItem(task.id,item.id,'0'.repeat(64))).rejects.toThrow(/变化|核对/);
 await f.service.reviewItem(task.id,item.id,item.sha256!);expect((await f.service.archivePreview(task.id)).ready).toBe(true);
 const archived=await f.service.archive(task.id,true);expect(archived.state).toBe('completed');
 const index=f.db.prepare('select * from pdf_files where drawing_id=?').get(f.drawing.id) as any;expect(index).toBeTruthy();expect(index.relative_path.replaceAll('\\','/')).toContain('/02.未转曲源文件/');
 expect(existsSync(join(f.root,index.relative_path))).toBe(true);expect(existsSync(join(f.root,'冰柜','SKU1-M1','00.临时文件'))).toBe(true);expect(existsSync(join(f.root,task.taskDirectory))).toBe(false);
 expect(f.db.prepare('select scope_kind from file_scan_runs order by id desc limit 1').get()).toEqual({scope_kind:'products'});
 expect((await f.service.getTask(task.id)).state).toBe('completed');
});
it('retains unknown files pending, does not autochoose a similar name, and links only after a manual choice',async()=>{
 const f=fixture(),task=await f.create(),file=join(f.root,'冰柜','SKU1-M1','00.临时文件','unidentified.pdf');writeFileSync(file,pdf);
 const found=await f.service.discover(task.id);expect(found.pendingFiles).toHaveLength(1);expect(found.items[0].fileName).toBeUndefined();expect(existsSync(file)).toBe(true);
 await expect(f.service.archive(task.id,true)).rejects.toThrow(/关联|检查|完成/);
 const linked=await f.service.linkFile(task.id,found.pendingFiles[0].id,found.items[0].id);expect(linked.items[0].state).toBe('awaiting_review');
 await expect(f.service.linkFile(task.id,found.pendingFiles[0].id,found.items[0].id)).rejects.toThrow(/关联|处理/);
});
it('keeps temporary files when indexing fails and resumes archive without overwriting the published PDF',async()=>{
 const f=fixture(),task=await f.create();writeFileSync(join(f.root,'冰柜','SKU1-M1','00.临时文件',`${f.drawing.fullCode}.pdf`),pdf);
 let current=await f.service.discover(task.id);await f.service.reviewItem(task.id,current.items[0].id,current.items[0].sha256!);
 const scan=vi.spyOn(f.files,'scanProducts').mockRejectedValueOnce(new Error('资料目录暂时无法访问'));
 await expect(f.service.archive(task.id,true)).rejects.toThrow(/无法访问/);
 current=await f.service.getTask(task.id);expect(current.state).toBe('awaiting_index');expect(existsSync(join(f.root,current.items[0].relativePath!))).toBe(true);
 scan.mockRestore();expect((await f.service.archive(task.id,true)).state).toBe('completed');
});
it('does not reuse reviewed hashes after external PDF edits',async()=>{
 const f=fixture(),task=await f.create();writeFileSync(join(f.root,'冰柜','SKU1-M1','00.临时文件',`${f.drawing.fullCode}.pdf`),pdf);
 let current=await f.service.discover(task.id);await f.service.reviewItem(task.id,current.items[0].id,current.items[0].sha256!);
 writeFileSync(join(f.root,current.items[0].relativePath!),pdf.replace('Catalog','Pages'));
 current=await f.service.getTask(task.id);expect(current.items[0].reviewedSha256).toBeUndefined();expect((await f.service.archivePreview(task.id)).ready).toBe(false);
});
it('copies formal PDFs for editing, keeps the original until review and retains a verified backup after replacement',async()=>{
 const f=fixture(),task=await f.create();writeFileSync(join(f.root,'冰柜','SKU1-M1','00.临时文件',`${f.drawing.fullCode}.pdf`),pdf);
 let current=await f.service.discover(task.id);await f.service.reviewItem(task.id,current.items[0].id,current.items[0].sha256!);await f.service.archive(task.id,true);
 const index=f.db.prepare('select id,relative_path as path from pdf_files where drawing_id=?').get(f.drawing.id) as {id:number;path:string},original=readFileSync(join(f.root,index.path));
 current=await f.service.createTask({productId:f.product.id,name:'修改铭牌',type:'modify',drawings:[{origin:'planned',id:f.drawing.id,sourcePdfFileId:index.id}]});
 expect(readFileSync(join(f.root,index.path))).toEqual(original);
 writeFileSync(join(f.root,current.items[0].relativePath!),pdf.replace('Catalog','Pages'));
 current=await f.service.getTask(current.id);await f.service.reviewItem(current.id,current.items[0].id,current.items[0].sha256!);
 const saved=await f.service.archive(current.id,true);expect(saved.state).toBe('completed');
 expect(readFileSync(join(f.dir,saved.items[0].backupRelativePath!))).toEqual(original);
 expect(readFileSync(join(f.root,index.path),'utf8')).toContain('Pages');
 expect(f.db.prepare('select id from pdf_files where drawing_id=?').get(f.drawing.id)).toEqual({id:index.id});
});
it('blocks replacement when someone changes the formal original after a modify task starts',async()=>{
 const f=fixture(),directory=join(f.root,'冰柜','SKU1-M1','02.未转曲源文件');mkdirSync(directory,{recursive:true});const source=join(directory,`${f.drawing.fullCode}.pdf`);writeFileSync(source,pdf);await f.files.scan();
 const task=await f.service.createTask({productId:f.product.id,name:'改图',type:'modify',drawings:[{origin:'planned',id:f.drawing.id}]});await f.service.reviewItem(task.id,task.items[0].id,task.items[0].sha256!);
 writeFileSync(source,pdf.replace('Catalog','ExternalEdit'));
 await expect(f.service.archive(task.id,true)).rejects.toThrow(/正式文件.*变化/);expect(readFileSync(source,'utf8')).toContain('ExternalEdit');expect(existsSync(join(f.root,task.items[0].relativePath!))).toBe(true);
});
it('isolates per-item generation failures and retries without reserving again or overwriting a successful/edited PDF',async()=>{
 const f=fixture();f.catalog.saveConfig({projectItemId:f.project.id,mode:'ait',parameters:[]});
 const template=f.catalog.uploadTemplate({name:'铭牌',mainCategoryId:f.main.id,projectItemId:f.project.id,brandIds:[],productIds:[],fields:[{objectName:'DRAWING_NO',sourceKey:'DRAWING_NO',required:true}],requiredFonts:[],status:'active'},{fileName:'铭牌.ait',buffer:Buffer.from('%!PS-Adobe-3.0\nAIT contract fixture')});
 const preview=f.plan.preview(f.input),second=f.plan.reserve({...f.input,rows:f.input.rows.map(row=>({...row,expectedFullCode:preview.rows[0].fullCode}))})[0];
 const task=await f.service.createTask({productId:f.product.id,name:'两张图',type:'new',drawings:[{origin:'planned',id:f.drawing.id},{origin:'planned',id:second.id}]});
 f.automation.generate.mockImplementationOnce(async()=>{throw new Error('缺少字体');}).mockImplementation(async(input)=>{writeFileSync(input.outputPath,pdf);const {pdfFact}=await import('../../src/core/packaging/packaging-file-operations');return{outputPath:input.outputPath,...await pdfFact(input.outputPath),preserveEditability:true};});
 let current=await f.service.generate(task.id);expect(current.items.map(item=>item.state)).toEqual(['failed','awaiting_review']);const successful=current.items[1].relativePath!,savedBytes=readFileSync(join(f.root,successful));
 current=await f.service.generate(task.id,{itemIds:[current.items[0].id]});expect(f.automation.generate).toHaveBeenCalledTimes(3);expect(readFileSync(join(f.root,successful))).toEqual(savedBytes);
 const old=current.items[0].relativePath!;writeFileSync(join(f.root,old),pdf.replace('Catalog','ManualEdit'));await f.service.getTask(task.id);
 await f.service.configureItem(task.id,current.items[0].id,{templateId:template.id,parameters:{length:100}});
 current=await f.service.generate(task.id,{itemIds:[current.items[0].id],regenerate:true});
 expect(current.items[0].relativePath).not.toBe(old);expect(readFileSync(join(f.root,old),'utf8')).toContain('ManualEdit');expect(f.db.prepare('select count(*) n from drawing_numbers').get()).toEqual({n:2});
});
it('pins the workspace of unfinished tasks when the configured root changes',async()=>{
 const f=fixture();let root=f.root;const service=new PackagingTaskService(f.db,{...f.options,workspaceRoot:()=>root});
 const task=await service.createTask({productId:f.product.id,name:'原目录任务',type:'new',drawings:[{origin:'planned',id:f.drawing.id}]});
 root=join(f.dir,'other');mkdirSync(root);await expect(service.discover(task.id)).rejects.toThrow(/资料根目录/);expect(existsSync(join(root,'冰柜'))).toBe(false);
});
it('does not match a similar model or a longer project name by filename substring',async()=>{
 const f=fixture(),task=await f.create(),folder=join(f.root,'冰柜','SKU1-M1','00.临时文件');
 writeFileSync(join(folder,'M10-铭牌.pdf'),pdf);writeFileSync(join(folder,'M1-其他铭牌.pdf'),pdf);
 const current=await f.service.discover(task.id);expect(current.items[0].relativePath).toBeUndefined();expect(current.pendingFiles.filter(file=>file.status==='pending')).toHaveLength(2);
});
async function readyManual(f:ReturnType<typeof fixture>){const task=await f.create();writeFileSync(join(f.root,'冰柜','SKU1-M1','00.临时文件',`${f.drawing.fullCode}.pdf`),pdf);const current=await f.service.discover(task.id);return current;}
it('serializes PDF review against configuration changes so old bytes cannot approve new settings',async()=>{
 const f=fixture(),task=await readyManual(f),item=task.items[0];const reviewing=f.service.reviewItem(task.id,item.id,item.sha256!);
 const results=await Promise.allSettled([reviewing,f.service.configureItem(task.id,item.id,{mode:'ait',parameters:{length:999}})]);
 expect(results[0].status).toBe('fulfilled');expect(results[1].status).toBe('rejected');expect((await f.service.getTask(task.id)).items[0]).toMatchObject({mode:'manual',parameters:{},state:'completed'});
});
it('resumes an indexed archive after an interruption during cleanup has already removed the task source',async()=>{
 const f=fixture(),task=await readyManual(f);await f.service.reviewItem(task.id,task.items[0].id,task.items[0].sha256!);
 const original=f.service.store.state.bind(f.service.store),state=vi.spyOn(f.service.store,'state').mockImplementation((id,next,error)=>{if(next==='completed')throw Error('simulated power loss');return original(id,next,error);});
 await expect(f.service.archive(task.id,true)).rejects.toThrow(/power loss/);state.mockRestore();expect(existsSync(join(f.root,task.items[0].relativePath!))).toBe(false);
 const restored=new PackagingTaskService(f.db,f.options);expect((await restored.archive(task.id,true)).state).toBe('completed');
});
it('backs up and finishes unchanged files included in a formal modification task',async()=>{
 const f=fixture(),directory=join(f.root,'冰柜','SKU1-M1','02.未转曲源文件');mkdirSync(directory,{recursive:true});const source=join(directory,`${f.drawing.fullCode}.pdf`);writeFileSync(source,pdf);await f.files.scan();
 const task=await f.service.createTask({productId:f.product.id,name:'无需改动的项目',type:'modify',drawings:[{origin:'planned',id:f.drawing.id}]});await f.service.reviewItem(task.id,task.items[0].id,task.items[0].sha256!);
 const saved=await f.service.archive(task.id,true);expect(saved.state).toBe('completed');expect(readFileSync(join(f.dir,saved.items[0].backupRelativePath!),'utf8')).toBe(pdf);expect(readFileSync(source,'utf8')).toBe(pdf);
});
it('retries an interrupted initial formal-file copy using its persisted original hash',async()=>{
 const f=fixture(),directory=join(f.root,'冰柜','SKU1-M1','02.未转曲源文件');mkdirSync(directory,{recursive:true});writeFileSync(join(directory,`${f.drawing.fullCode}.pdf`),pdf);await f.files.scan();
 const copy=vi.spyOn(packagingFiles,'copyPdfExclusive').mockRejectedValueOnce(new Error('disk temporarily unavailable'));
 const task=await f.service.createTask({productId:f.product.id,name:'复制中断',type:'modify',drawings:[{origin:'planned',id:f.drawing.id}]});copy.mockRestore();expect(task.items[0].state).toBe('failed');expect(task.items[0].originalSha256).toHaveLength(64);
 const restored=new PackagingTaskService(f.db,f.options);restored.recover();const recovered=await restored.discover(task.id);expect(recovered.items[0]).toMatchObject({state:'awaiting_review',sha256:task.items[0].originalSha256});
});
it('blocks serving or opening a task PDF from a different configured root',async()=>{
 const f=fixture();let root=f.root;const service=new PackagingTaskService(f.db,{...f.options,workspaceRoot:()=>root});const task=await service.createTask({productId:f.product.id,name:'旧根目录',type:'new',drawings:[{origin:'planned',id:f.drawing.id}]});writeFileSync(join(f.root,'冰柜','SKU1-M1','00.临时文件',`${f.drawing.fullCode}.pdf`),pdf);const current=await service.discover(task.id);
 root=join(f.dir,'new-root');mkdirSync(dirname(join(root,current.items[0].relativePath!)),{recursive:true});writeFileSync(join(root,current.items[0].relativePath!),pdf.replace('Catalog','Unrelated'));
 await expect(service.filePath(task.id,current.items[0].id)).rejects.toThrow(/资料根目录/);await expect(service.openItem(task.id,current.items[0].id)).rejects.toThrow(/资料根目录/);expect(f.automation.openPdf).not.toHaveBeenCalled();
});
it('shows a newly replaced PDF at a previously linked input filename as pending',async()=>{
 const f=fixture(),task=await readyManual(f),source=join(f.root,'冰柜','SKU1-M1','00.临时文件',`${f.drawing.fullCode}.pdf`);writeFileSync(source,pdf.replace('Catalog','NewArrival'));
 const found=await f.service.discover(task.id);expect(found.pendingFiles.filter(file=>file.status==='pending')).toHaveLength(1);expect(existsSync(source)).toBe(true);
 await f.service.reviewItem(task.id,found.items[0].id,found.items[0].sha256!);expect((await f.service.archivePreview(task.id)).ready).toBe(false);
});
it('requires a new explicit template choice when changed dimensions turn an automatic match into multiple matches',async()=>{
 const f=fixture();f.catalog.saveConfig({projectItemId:f.project.id,mode:'ait',parameters:[{key:'length',label:'长',type:'number',required:true,axis:'length',unit:'mm'}]});
 const upload=(name:string)=>f.catalog.uploadTemplate({name,mainCategoryId:f.main.id,projectItemId:f.project.id,brandIds:[],productIds:[],fields:[],requiredFonts:[],status:'active'},{fileName:`${name}.ait`,buffer:Buffer.from('%!PS-Adobe-3.0\nfixture')});
 const first=upload('小规格'),second=upload('大规格');f.catalog.saveRule({name:'小规格范围',templateId:first.id,conditions:[{key:'length',operator:'lte',value:200}],allowLengthWidthSwap:false,status:'active'});f.catalog.saveRule({name:'大规格范围',templateId:second.id,conditions:[{key:'length',operator:'gt',value:100}],allowLengthWidthSwap:false,status:'active'});
 f.catalog.saveDimension({name:'默认',projectItemId:f.project.id,scope:'specific',productIds:[f.product.id],parameters:{length:50},isDefault:true,status:'active'});
 const task=await f.create();expect(task.items[0].templateId).toBe(first.id);
 const changed=await f.service.configureItem(task.id,task.items[0].id,{parameters:{length:150},templateId:first.id});expect(changed.items[0].match?.status).toBe('multiple');expect(changed.items[0].templateId).toBeUndefined();
 expect((await f.service.configureItem(task.id,task.items[0].id,{templateId:first.id})).items[0].templateId).toBe(first.id);
});
it('prevents changing the workspace setting during a tracked file review',async()=>{
 const f=fixture(),task=await readyManual(f);const settings=new WorkspaceSettingsStore(join(f.dir,'guarded-settings.json'));settings.setWorkspaceRoot(f.root);const service=new FileService(new FileRepository(f.db),settings,undefined,()=>f.service.hasOperations());const nextRoot=join(f.dir,'different-root');mkdirSync(nextRoot);
 const reviewing=f.service.reviewItem(task.id,task.items[0].id,task.items[0].sha256!);expect(()=>service.updateSettings({workspaceRoot:nextRoot})).toThrow(/制图文件/);await reviewing;expect(settings.get().workspaceRoot).toBe(f.root);expect(service.updateSettings({workspaceRoot:nextRoot}).workspaceRoot).toBe(nextRoot);
});
