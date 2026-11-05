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
  const handle=await actual.open(...args),createReadStream=handle.createReadStream.bind(handle);
  handle.createReadStream=options=>{const stream=createReadStream(options);stream.once('data',()=>writeFileSync(path,'partially copied PDF'));return stream;};
  return handle;
 });
 await expect(fingerprintFile(path)).rejects.toThrow(/正在变化/);
});
