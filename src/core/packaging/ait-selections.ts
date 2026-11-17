import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, isAbsolute } from 'node:path';
import { PackagingCatalogError } from './packaging-catalog.js';

/** Capabilities are created only by private desktop IPC and expire with this service. */
export class AitSelections {
 private readonly selections=new Map<string,{path:string;sha256:string}>();
 private validate(path:string) {
  if(!isAbsolute(path)||!/\.ait$/iu.test(path))throw new PackagingCatalogError('INVALID_PACKAGING_INPUT','请选择 AIT 原始文件');
  try {const real=realpathSync.native(path);if(!statSync(real).isFile())throw new Error();const bytes=readFileSync(real);if(!bytes.length||bytes.length>20*1024*1024)throw new Error();return {path:real,sha256:createHash('sha256').update(bytes).digest('hex')};}
  catch {throw new PackagingCatalogError('PACKAGING_ASSET_UNAVAILABLE','模板文件不存在、无法读取或超过 20 MB');}
 }
 selectTrusted(path:string) {const value=this.validate(path),token=randomUUID();this.selections.set(token,value);return {token,fileName:basename(value.path),displayPath:value.path};}
 resolveFact(token:unknown):{path:string;sha256:string} {const value=typeof token==='string'?this.selections.get(token):undefined;if(!value)throw new PackagingCatalogError('INVALID_PACKAGING_INPUT','文件选择已失效，请重新选择');const current=this.validate(value.path);if(current.sha256!==value.sha256)throw new PackagingCatalogError('INVALID_PACKAGING_INPUT','原始 AIT 已变更，请重新选择');return current;}
 resolve(token:unknown):string {return this.resolveFact(token).path;}
}
