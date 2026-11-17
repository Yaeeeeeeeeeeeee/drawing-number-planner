// @vitest-environment node
import { mkdtempSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it } from 'vitest';
import { startServer } from '../../src/server/start-server';

it('streams only an indexed PDF and reports a missing file without changing the index', async () => {
  const root=mkdtempSync(join(tmpdir(),'pdf-reader-')); const library=join(root,'library');
  const dir=join(library,'未分类','UNKNOWN-M','02.未转曲源文件'); mkdirSync(dir,{recursive:true});
  const file=join(dir,'sample.pdf'); const original=Buffer.from('%PDF-1.4\nfixture'); writeFileSync(file,original);
  const server=await startServer({dataDir:join(root,'data'),port:0,token:'test',allowedOrigins:['http://127.0.0.1:5173']});
  try {
    const headers={origin:'http://127.0.0.1:5173','x-planner-token':'test','content-type':'application/json'};
    await fetch(`${server.url}/api/files/settings`,{method:'PUT',headers,body:JSON.stringify({workspaceRoot:library})});
    await fetch(`${server.url}/api/files/scan`,{method:'POST',headers,body:'{}'});
    const list=await (await fetch(`${server.url}/api/files?presence=all`)).json() as {items:{id:number}[]};
    const url=`${server.url}/api/files/${list.items[0].id}/content`;
    const response=await fetch(url); expect(response.status).toBe(200); expect(Buffer.from(await response.arrayBuffer())).toEqual(original);
    expect(readFileSync(file)).toEqual(original); unlinkSync(file);
    const missing=await fetch(url); expect(missing.status).toBe(422); expect((await missing.json()).error.code).toBe('PDF_FILE_UNAVAILABLE');
    expect((await (await fetch(`${server.url}/api/files?presence=all`)).json()).total).toBe(1);
  } finally { await server.close(); rmSync(root,{recursive:true,force:true}); }
});
