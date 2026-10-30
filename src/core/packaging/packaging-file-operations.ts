import { constants, lstatSync, readFileSync, renameSync, rmdirSync, unlinkSync, type Stats } from 'node:fs';
import { open } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { PackagingFileError, assertSafeAbsolutePath, ensureSafeDirectory, packagingPathSegments, type PackagingWorkspace } from './packaging-workspace.js';
export { PackagingFileError } from './packaging-workspace.js';
export interface PdfFact {sha256:string;sizeBytes:number;mtimeMs:number}
const fail=(code:string,message:string):never=>{throw new PackagingFileError(code,message);};
function same(left:Stats,right:Stats):boolean{return left.dev===right.dev&&left.ino===right.ino&&left.size===right.size&&left.mtimeMs===right.mtimeMs&&left.ctimeMs===right.ctimeMs;}
function regular(path:string):Stats{assertSafeAbsolutePath(path);const stats=lstatSync(path);if(!stats.isFile()||stats.isSymbolicLink())fail('PACKAGING_PDF_INVALID','PDF 必须为普通文件');return stats;}
function unchanged(path:string,expected:Stats):void{if(!same(regular(path),expected))fail('PACKAGING_FILE_CHANGED','PDF 文件正在变化，请等待写入完成');}
async function observe(path:string):Promise<{fact:PdfFact;stats:Stats}>{
  const before=regular(path),handle=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
  try{
    if(!same(before,await handle.stat()))fail('PACKAGING_FILE_CHANGED','PDF 文件在读取前已变化');
    const hash=createHash('sha256');let start=Buffer.alloc(0),tail=Buffer.alloc(0),size=0;
    for await(const chunk of handle.createReadStream({autoClose:false})){
      const bytes=chunk as Buffer;hash.update(bytes);size+=bytes.length;
      if(start.length<8)start=Buffer.concat([start,bytes]).subarray(0,8);
      tail=Buffer.concat([tail,bytes]).subarray(-1024);
    }
    if(!same(before,await handle.stat()))fail('PACKAGING_FILE_CHANGED','PDF 文件正在变化，请等待写入完成');unchanged(path,before);
    if(size!==before.size||!/^%PDF-\d\.\d/u.test(start.toString('ascii'))||!/(?:^|[\r\n])%%EOF[\t\r\n ]*$/u.test(tail.toString('latin1')))fail('PACKAGING_PDF_INVALID','PDF 文件不完整，缺少有效文件头或 EOF 结束标记');
    return{fact:{sha256:hash.digest('hex'),sizeBytes:size,mtimeMs:before.mtimeMs},stats:before};
  }finally{await handle.close();}
}
export async function pdfFact(path:string):Promise<PdfFact>{return(await observe(path)).fact;}
export async function stablePdfFact(path:string,intervalMs=250):Promise<PdfFact>{
  if(!Number.isFinite(intervalMs)||intervalMs<0)fail('PACKAGING_PDF_INVALID','文件稳定检查间隔无效');
  const first=await observe(path);await delay(intervalMs);const second=await observe(path);
  if(!same(first.stats,second.stats)||first.fact.sha256!==second.fact.sha256)fail('PACKAGING_FILE_CHANGED','PDF 文件尚未稳定，请等待复制完成');return second.fact;
}
/** Exclusively owns its new inode; rollback never deletes a replaced or edited file. */
export async function copyPdfExclusive(source:string,destination:string,expectedSourceSha256?:string):Promise<PdfFact>{
  const original=await observe(source);if(expectedSourceSha256!==undefined&&original.fact.sha256!==expectedSourceSha256)fail('PACKAGING_FILE_CHANGED','PDF 自人工确认后已变化，请重新检查确认');ensureSafeDirectory(dirname(destination));assertSafeAbsolutePath(destination);
  const input=await open(source,constants.O_RDONLY|(constants.O_NOFOLLOW??0));let output:Awaited<ReturnType<typeof open>>|undefined,owned:Stats|undefined;
  try{
    if(!same(original.stats,await input.stat()))fail('PACKAGING_FILE_CHANGED','源 PDF 已变化');
    output=await open(destination,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600);owned=await output.stat();
    const bytes=Buffer.alloc(64*1024);let position=0;
    while(true){const{bytesRead}=await input.read(bytes,0,bytes.length,position);if(!bytesRead)break;let written=0;while(written<bytesRead){const result=await output.write(bytes,written,bytesRead-written,position+written);if(!result.bytesWritten)fail('PACKAGING_COPY_FAILED','PDF 写入未完成');written+=result.bytesWritten;}position+=bytesRead;owned=await output.stat();}
    await output.sync();owned=await output.stat();
    if(!same(original.stats,await input.stat()))fail('PACKAGING_FILE_CHANGED','源 PDF 在复制期间发生变化');unchanged(source,original.stats);
    const copied=await observe(destination);const after=await observe(source);
    if(copied.fact.sha256!==original.fact.sha256||after.fact.sha256!==original.fact.sha256||!same(after.stats,original.stats))fail('PACKAGING_FILE_CHANGED','PDF 复制校验失败，源文件已变化');
    return copied.fact;
  }catch(error){
    if(output&&owned){try{const current=lstatSync(destination);if(same(current,owned)){assertSafeAbsolutePath(destination);unlinkSync(destination);}}catch{/* Keep anything whose identity can no longer be proved. */}}
    throw error;
  }finally{await output?.close();await input.close();}
}
function synchronousHash(path:string,expected:Stats):string{unchanged(path,expected);const hash=createHash('sha256').update(readFileSync(path)).digest('hex');unchanged(path,expected);return hash;}
export async function replacePdfWithBackup(input:{source:string;destination:string;backup:string;expectedOriginalSha256:string;expectedSourceSha256?:string}):Promise<PdfFact>{
  const{source,destination,backup,expectedOriginalSha256,expectedSourceSha256}=input;
  const paths=[source,destination,backup].map(p=>assertSafeAbsolutePath(p).toLocaleLowerCase('en-US'));
  if(new Set(paths).size!==paths.length)fail('PACKAGING_PATH_INVALID','源文件、正式文件和备份必须使用不同路径');
  const original=await observe(destination);if(original.fact.sha256!==expectedOriginalSha256)fail('PACKAGING_ORIGINAL_CHANGED','正式 PDF 自创建任务后已变更，不能替换');
  const sourceObservation=await observe(source);if(expectedSourceSha256!==undefined&&sourceObservation.fact.sha256!==expectedSourceSha256)fail('PACKAGING_FILE_CHANGED','PDF 自人工确认后已变化，请重新检查确认');
  try{await copyPdfExclusive(destination,backup);}catch(error){
    // An existing exact backup is a valid retry after an interrupted publication.
    if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;
    if((await pdfFact(backup)).sha256!==expectedOriginalSha256)fail('PACKAGING_BACKUP_CONFLICT','原文件备份已存在且校验不一致');
  }
  const backupObservation=await observe(backup);if(backupObservation.fact.sha256!==expectedOriginalSha256)fail('PACKAGING_BACKUP_CONFLICT','原文件备份校验失败');
  const stage=join(dirname(destination),`.packaging-${randomUUID()}.pdf`);
  // Keep verified backup, source and any staging file on failure for recovery.
  const staged=await copyPdfExclusive(source,stage,expectedSourceSha256??sourceObservation.fact.sha256);const stagedStats=regular(stage);
  const current=await observe(destination);
  if(!same(original.stats,current.stats)||current.fact.sha256!==expectedOriginalSha256)fail('PACKAGING_ORIGINAL_CHANGED','正式 PDF 在归档期间发生变化，不能替换');
  // No asynchronous gap between the last identity/hash check and atomic publication.
  if(synchronousHash(backup,backupObservation.stats)!==expectedOriginalSha256||synchronousHash(stage,stagedStats)!==staged.sha256||synchronousHash(destination,original.stats)!==expectedOriginalSha256)fail('PACKAGING_FILE_CHANGED','归档文件校验失败');
  renameSync(stage,destination);
  return staged;
}
export async function cleanupOwnedTaskFiles(workspace:PackagingWorkspace,taskDirectory:string,owned:{relativePath:string;sha256:string}[]):Promise<{removed:string[];retained:string[]}>{
  const segments=packagingPathSegments(taskDirectory);if(segments.length!==4||segments[2]!=='00.临时文件'||!segments[3].startsWith('当前任务_'))fail('PACKAGING_PATH_INVALID','只能清理指定任务临时目录');
  const directory=segments.join('/'),absolute=workspace.path(directory),removed:string[]=[],retained:string[]=[];
  for(const entry of owned){
    try{
      const child=packagingPathSegments(entry.relativePath);
      if(child.length!==5||child.slice(0,4).join('/')!==directory){retained.push(entry.relativePath);continue;}
      const path=workspace.path(entry.relativePath),observation=await observe(path);
      if(observation.fact.sha256!==entry.sha256){retained.push(entry.relativePath);continue;}
      workspace.path(entry.relativePath);
      if(synchronousHash(path,observation.stats)!==entry.sha256){retained.push(entry.relativePath);continue;}
      unlinkSync(path);removed.push(entry.relativePath);
    }catch{retained.push(entry.relativePath);}
  }
  try{workspace.path(directory);rmdirSync(absolute);}catch{/* Unknown or edited content keeps the task folder. Never remove root00. */}
  return{removed,retained};
}
