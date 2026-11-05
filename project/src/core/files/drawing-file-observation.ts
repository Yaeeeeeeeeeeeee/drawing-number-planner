import {accessSync,closeSync,constants,lstatSync,openSync,readSync,readdirSync,realpathSync,statSync,type Dirent} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {inspectDrawingCodesInFilename} from '../drawings/drawing-code.js';
import {parseMaterialBatch} from './material-batch-parser.js';
import {SOURCE_MATERIAL_DIRECTORY,PRODUCTION_CHANGE_DIRECTORIES} from './material-directory-policy.js';
import {resolveWorkspacePath,toWorkspacePathKey,validateWorkspaceRelativePath} from './workspace-paths.js';

export interface DrawingObservedFileRequest {kind:'drawing-file';origin:'planned'|'historical';recordId:number;relativePath:string}
export type DrawingObservationState='present'|'missing'|'unindexed'|'unconfigured'|'unavailable';
export interface DrawingObservedFile {pdfIndexId:number|null;fileName:string;relativePath:string;isPresent:boolean;indexed:boolean}
export interface DrawingObservedEntry {
  key:string;batchId:number|null;batchName:string;businessDate:string|null;
  usageState:'current'|'historical'|'indeterminate';state:'present'|'conflict'|'unavailable';message?:string;files:DrawingObservedFile[];
}
export interface DrawingObservedSection {state:DrawingObservationState;message:string;entries:DrawingObservedEntry[]}
export interface DrawingFileObservation {source:DrawingObservedSection;outlined:DrawingObservedSection}
export interface ObservedBatch {id:number;relativePath:string;name:string;businessDate:string|null;usageState:DrawingObservedEntry['usageState']}
export interface ObservationIndex {pdfIndexId:number;relativePath:string;contentSha256?:string|null}
interface ObservationInput {
  root:string|null;fullCode:string;directories:string[];indexedFiles:ObservationIndex[];batches:ObservedBatch[];
  /** Released codes require the already explicit index identity and unchanged bytes, even at a new path. */
  requireHashBoundIndex?:boolean;blockedPaths?:string[];
}
function digest(path:string):string {
  const hash=createHash('sha256'),fd=openSync(path,'r');const buffer=Buffer.allocUnsafe(64*1024);
  try {let count:number;while((count=readSync(fd,buffer,0,buffer.length,null))>0)hash.update(buffer.subarray(0,count));return hash.digest('hex');}
  finally {closeSync(fd);}
}
const missing=(error:unknown)=>['ENOENT','ENOTDIR'].includes(String((error as NodeJS.ErrnoException)?.code));
/** No scan, classification, identity reservation, or database writes: only the known product directories are observed. */
export function observeDrawingFiles(input:ObservationInput):DrawingFileObservation {
  const section=(state:DrawingObservationState,message:string):DrawingObservedSection=>({state,message,entries:[]});
  if(!input.root)return{source:section('unconfigured','资料根目录未配置'),outlined:section('unconfigured','资料根目录未配置')};
  try {if(!statSync(input.root).isDirectory())throw Error('not a directory');accessSync(input.root,constants.R_OK);}
  catch {return{source:section('unavailable','资料根目录无法访问，请检查本地路径或网络连接'),outlined:section('unavailable','资料根目录无法访问，请检查本地路径或网络连接')};}
  if(!input.directories.length)return{source:section('unindexed','未找到可靠的资料目录或文件索引，尚未核验磁盘'),outlined:section('unindexed','未找到可靠的资料目录或文件索引，尚未核验磁盘')};
  const indices=new Map(input.indexedFiles.map(file=>[toWorkspacePathKey(file.relativePath),file]));
  const batches=new Map(input.batches.map(batch=>[toWorkspacePathKey(batch.relativePath),batch]));
  const blocked=new Set((input.blockedPaths??[]).map(toWorkspacePathKey));
  const source=section('missing','未找到对应源文件'),outlined=section('missing','未找到对应转曲后文件');
  const groups={source:new Map<string,DrawingObservedEntry>(),outlined:new Map<string,DrawingObservedEntry>()};
  const hashes=new Map<string,string>();
  const unreadable=(target:DrawingObservedSection)=>{target.state='unavailable';target.message='部分资料目录或文件无法读取，不能确认文件缺失';};
  const safe=(relativePath:string):string=>{
    validateWorkspaceRelativePath(relativePath);
    const segments=relativePath.split(/[\\/]+/);let absolute=input.root!;
    // Refuse links anywhere in the path; skipped links are unobserved, never empty.
    for(const segment of segments){absolute=join(absolute,segment);if(lstatSync(absolute).isSymbolicLink())throw Error('linked directory');}
    return resolveWorkspacePath(input.root!,relativePath);
  };
  const add=(relativePath:string,role:'source'|'outlined')=>{
    const target=role==='source'?source:outlined;
    const fileName=relativePath.split(/[\\/]/).at(-1)!;
    if(!/\.pdf$/i.test(fileName))return;
    const inspection=inspectDrawingCodesInFilename(fileName);
    if(inspection.status!=='reliable'||inspection.code.fullCode!==input.fullCode)return;
    if(role==='outlined'&&!fileName.includes('（转曲）'))return;
    const pathKey=toWorkspacePathKey(relativePath),index=indices.get(pathKey);
    if(blocked.has(pathKey))return;
    try {
      const absolute=safe(relativePath);if(!statSync(absolute).isFile())throw Error('not a file');accessSync(absolute,constants.R_OK);
      if(input.requireHashBoundIndex){
        if(!index||!/^[a-f\d]{64}$/i.test(index.contentSha256??''))return;
        const sha=digest(absolute);hashes.set(pathKey,sha);if(sha!==index.contentSha256)return;
      }
      const parsed=role==='outlined'?parseMaterialBatch(relativePath):null;
      const batchPath=role==='source'?relativePath.split(/[\\/]/).slice(0,3).join('/'):(parsed?.relativePath??relativePath.split(/[\\/]/).slice(0,3).join('/'));
      const key=toWorkspacePathKey(batchPath),batch=batches.get(key);
      let entry=groups[role].get(key);
      if(!entry){entry={key,batchId:batch?.id??null,batchName:role==='source'?'未转曲源文件':batch?.name??parsed?.name??'未归批次',businessDate:batch?.businessDate??parsed?.businessDate??null,usageState:batch?.usageState??'indeterminate',state:'present',files:[]};groups[role].set(key,entry);}
      entry.files.push({pdfIndexId:index?.pdfIndexId??null,fileName,relativePath,isPresent:true,indexed:Boolean(index)});
    }catch{unreadable(target);}
  };
  const walk=(relativePath:string,role:'source'|'outlined',allowAbsent=false)=>{
    const target=role==='source'?source:outlined;
    let entries:Dirent[];
    try {entries=readdirSync(safe(relativePath),{withFileTypes:true});}
    catch(error){
      // A missing role directory is evidence only when its known product parent can
      // actually be listed. An inaccessible/disappeared ancestor is incomplete coverage.
      if(allowAbsent&&missing(error)){
        const segments=relativePath.split('/'),name=segments.pop()!;
        try{if(!readdirSync(safe(segments.join('/'))).includes(name))return;}catch{/* unavailable parent */}
      }
      unreadable(target);return;
    }
    for(const entry of entries){
      const path=`${relativePath}/${entry.name}`;
      if(entry.isSymbolicLink()){unreadable(target);continue;}
      if(entry.isDirectory())walk(path,role);else if(entry.isFile())add(path,role);
    }
  };
  for(const directory of new Set(input.directories.map(path=>path.replace(/\\/g,'/')))){
    walk(`${directory}/${SOURCE_MATERIAL_DIRECTORY}`,'source',true);
    walk(`${directory}/${PRODUCTION_CHANGE_DIRECTORIES[0]}`,'outlined',true);
  }
  for(const role of ['source','outlined'] as const){
    const target=role==='source'?source:outlined;
    target.entries=[...groups[role].values()];
    for(const entry of target.entries){
      entry.files.sort((left,right)=>left.relativePath.localeCompare(right.relativePath));
      if(entry.files.length>1){
        try {
          const values=entry.files.map(file=>{const key=toWorkspacePathKey(file.relativePath);let sha=hashes.get(key);if(!sha){sha=digest(safe(file.relativePath));hashes.set(key,sha);}return sha;});
          if(new Set(values).size>1){entry.state='conflict';entry.message=`同一批次有 ${entry.files.length} 个内容不同的文件，未选择任何实例`;}
        }catch{entry.state='unavailable';entry.message='同批次文件内容无法核验，未选择任何实例';unreadable(target);}
      }
    }
    target.entries.sort((left,right)=>(right.businessDate??'').localeCompare(left.businessDate??'')||left.key.localeCompare(right.key));
    if(target.state!=='unavailable'&&target.entries.length){target.state='present';target.message='文件存在';}
  }
  return{source,outlined};
}

/** Used only after a fresh observation has accepted this exact relative path. */
export function resolveObservedPath(root:string,relativePath:string):string {return realpathSync.native(resolveWorkspacePath(root,relativePath));}
