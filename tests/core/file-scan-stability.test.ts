// @vitest-environment node
import {afterEach,expect,it,vi} from 'vitest';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fingerprintFile} from '../../src/core/files/file-fingerprint';
vi.mock('node:fs/promises',async importOriginal=>{const actual=await importOriginal<typeof fsPromises>();return {...actual,open:vi.fn(actual.open)};});
const cleanups:Array<()=>void>=[];
afterEach(()=>{vi.mocked(fsPromises.open).mockReset();cleanups.splice(0).forEach(cleanup=>cleanup());});
it('rejects a PDF changed while its bytes are being hashed',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'pdf-copying-'));cleanups.push(()=>rmSync(directory,{recursive:true,force:true}));
 const path=join(directory,'copying.pdf');writeFileSync(path,Buffer.alloc(1024*1024,65));
 const actual=await vi.importActual<typeof fsPromises>('node:fs/promises');
 vi.mocked(fsPromises.open).mockImplementation(async(...args)=>{
  const handle=await actual.open(...args),read=handle.read.bind(handle);
  let changed=false;
  handle.read=(async (...input:unknown[])=>{
   const result=await Reflect.apply(read,handle,input);
   if(!changed){changed=true;writeFileSync(path,'partially copied PDF');}
   return result;
  }) as typeof handle.read;
  return handle;
 });
 await expect(fingerprintFile(path)).rejects.toThrow(/正在变化/);
});

it('reports a read failure before blocked close and keeps it when close also fails', async () => {
 const directory=mkdtempSync(join(tmpdir(),'pdf-close-drain-'));
 cleanups.push(()=>rmSync(directory,{recursive:true,force:true}));
 const path=join(directory,'book.pdf');writeFileSync(path,'fixture PDF');
 const actual=await vi.importActual<typeof fsPromises>('node:fs/promises');
 const first=new Error('read failed');
 let release!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;});
 vi.mocked(fsPromises.open).mockImplementation(async(...args)=>{
  const handle=await actual.open(...args),close=handle.close.bind(handle);
  handle.read=async()=>{throw first;};
  handle.close=async()=>{await gate;await close();throw new Error('close failed');};
  return handle;
 });
 const onFailure=vi.fn();
 let terminal:unknown;
 const result=fingerprintFile(path,undefined,{onFailure}).catch(reason=>{terminal=reason;});
 try {
  await vi.waitFor(()=>expect(onFailure).toHaveBeenCalledWith(first));
  expect(terminal).toBeUndefined();
 } finally {release();await result;}
 expect(terminal).toBe(first);
});
