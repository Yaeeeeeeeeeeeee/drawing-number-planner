// @vitest-environment node
import {mkdtempSync,mkdirSync,openSync,closeSync,ftruncateSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {it,expect} from 'vitest';
import {inspectIndexedPdfPresence} from '../../src/core/files/pdf-presence';
it('observes concrete files independently of stale index state and size without modifying them',()=>{
 const root=mkdtempSync(join(tmpdir(),'v5-pdf-presence-'));
 try {
  for(const mb of [1,50,69,100,200]){
   const path=join(root,`${mb}.pdf`);const fd=openSync(path,'w');ftruncateSync(fd,mb*1024*1024);closeSync(fd);
   const before=statSync(path);
   expect(inspectIndexedPdfPresence(root,{relativePath:`${mb}.pdf`,isPresent:true})).toMatchObject({status:'present',path,sizeBytes:mb*1024*1024});
   expect(inspectIndexedPdfPresence(root,{relativePath:`${mb}.pdf`,isPresent:false})).toMatchObject({status:'index-stale',path});
   expect(statSync(path).mtimeMs).toBe(before.mtimeMs);
  }
  expect(inspectIndexedPdfPresence(root,{relativePath:'absent.pdf',isPresent:true}).status).toBe('missing');
  expect(inspectIndexedPdfPresence(root,{relativePath:'../outside.pdf',isPresent:true}).status).toBe('path-invalid');
  expect(inspectIndexedPdfPresence(root,null).status).toBe('index-missing');
  mkdirSync(join(root,'directory.pdf'));
  expect(inspectIndexedPdfPresence(root,{relativePath:'directory.pdf',isPresent:true}).status).toBe('path-invalid');
 }finally {rmSync(root,{recursive:true,force:true});}
});
