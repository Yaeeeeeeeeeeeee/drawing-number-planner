import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
export const sha256 = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
export function inventory(root) {
 const result=[];
 const walk=dir=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){
  const file=path.join(dir,e.name);if(fs.lstatSync(file).isSymbolicLink())throw Error('Linked delivery path: '+file);
  if(e.isDirectory())walk(file);else if(e.isFile())result.push({path:path.relative(root,file).split(path.sep).join('/'),sha256:sha256(file)});else throw Error('Unexpected delivery entry: '+file);
 }};walk(root);return result.sort((a,b)=>a.path.localeCompare(b.path));
}
export function verifyManifest(root,manifest,{allowOriginalReports=false}={}) {
 if(!Array.isArray(manifest.files)||manifest.files.length===0)throw Error('Empty delivery manifest');
 const actual=new Map(inventory(root).map(entry=>[entry.path,entry.sha256])),listed=new Set();
 for(const entry of manifest.files){
  if(typeof entry.path!=='string'||entry.path.includes('\\')||entry.path.split('/').some(p=>!p||p==='.'||p==='..')||path.isAbsolute(entry.path)||!/^([a-f0-9]{64})$/.test(entry.sha256)||listed.has(entry.path))throw Error('Invalid manifest entry: '+entry.path);
  listed.add(entry.path);if(actual.get(entry.path)!==entry.sha256)throw Error('Manifest hash mismatch: '+entry.path);
 }
 for(const name of actual.keys())if(!listed.has(name)&&name!=='delivery-manifest.json'){
  if(allowOriginalReports&&/^(Windows[^/]*\.(png|txt)|windows-verification\.json|sample-reuse-verification\.json)$/.test(name))continue;
  throw Error('Unmanifested delivery file: '+name);
 }
 return {verifiedFiles:listed.size,totalFiles:actual.size};
}
