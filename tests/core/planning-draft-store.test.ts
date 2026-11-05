import {mkdtempSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect,it} from 'vitest';
import {PlanningDraftStore} from '../../src/core/planning/planning-draft-store';
const input={step:3 as const,activeProductId:1,groups:[{productId:1,rows:[{clientId:'incomplete',notes:'pending',shareWhite:true}]}]};
const fixture=()=>{const dir=mkdtempSync(join(tmpdir(),'planning-drafts-'));return {dir,path:join(dir,'planning-drafts.json')};};
it('persists independent incomplete working modes and restores only input requiring a fresh check',()=>{
 const {path,dir}=fixture();const store=new PlanningDraftStore(path);
 expect(store.read('new')).toBeNull();
 const saved=store.save('new',{...input,fingerprint:'forged',approved:true} as any,0);
 expect(saved).toMatchObject({revision:1,requiresCheck:true,input});
 store.save('batch',{...input,step:2},0);
 const restored=new PlanningDraftStore(path);
 expect(restored.read('new')).toMatchObject({revision:1,requiresCheck:true,input});
 expect(restored.read('batch')?.input.step).toBe(2);
 expect(readFileSync(path,'utf8')).not.toContain('forged');
 expect(readFileSync(path,'utf8')).not.toContain('approved');
 expect(readdirSync(dir)).toEqual(['planning-drafts.json']);
});
it('rejects stale saves/deletes across store instances and keeps revisions after delete',()=>{
 const {path}=fixture();const first=new PlanningDraftStore(path),second=new PlanningDraftStore(path);
 const saved=first.save('new',input,0);
 expect(()=>second.save('new',input,0)).toThrowError(expect.objectContaining({code:'DRAFT_STALE'}));
 const newer=first.save('new',{...input,step:4},saved.revision);
 expect(()=>second.delete('new',saved.revision)).toThrowError(expect.objectContaining({code:'DRAFT_STALE'}));
 first.delete('new',newer.revision);expect(second.read('new')).toBeNull();
 expect(()=>second.save('new',input,0)).toThrowError(expect.objectContaining({code:'DRAFT_STALE'}));
 expect(()=>second.save('new',input)).toThrowError(expect.objectContaining({code:'DRAFT_STALE'}));
 const state=second.state('new');expect(state).toEqual({draft:null,revision:newer.revision+1});
 expect(second.save('new',input,state.revision).revision).toBeGreaterThan(newer.revision);
});
it('does not overwrite an invalid or unreadable draft file with an empty replacement',()=>{
 const {path}=fixture();writeFileSync(path,'{broken');const store=new PlanningDraftStore(path);
 expect(()=>store.read('new')).toThrowError(expect.objectContaining({code:'DRAFT_UNREADABLE'}));
 expect(()=>store.save('new',input)).toThrow();expect(()=>store.delete('new')).toThrow();
 expect(readFileSync(path,'utf8')).toBe('{broken');
 writeFileSync(path,JSON.stringify({version:99,modes:{}}));expect(()=>store.read('batch')).toThrow();
});
it('deletes only one mode and never accepts saved check approval fields in nested rows',()=>{
 const {path}=fixture();const store=new PlanningDraftStore(path);
 const first=store.save('new',{...input,groups:[{productId:1,rows:[{clientId:'r',fingerprint:'secret',expectedFullCode:'02.0404.010.0401001',available:true}]}]} as any);
 store.save('batch',input);store.delete('new',first.revision);
 expect(store.read('new')).toBeNull();expect(store.read('batch')).not.toBeNull();
 expect(readFileSync(path,'utf8')).not.toContain('secret');
});

it('rejects a delayed initial save after another client saved and deleted the draft',()=>{
 const {path}=fixture(),a=new PlanningDraftStore(path),b=new PlanningDraftStore(path);
 expect(a.read('new')).toBeNull();const saved=b.save('new',input);b.delete('new',saved.revision);
 const before=readFileSync(path,'utf8');expect(()=>a.save('new',input)).toThrowError(expect.objectContaining({code:'DRAFT_STALE'}));
 expect(readFileSync(path,'utf8')).toBe(before);expect(a.read('new')).toBeNull();
});
