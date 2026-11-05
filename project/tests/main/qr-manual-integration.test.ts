// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer, type RunningServer } from '../../src/server/start-server';
import { createQrManualHandlers } from '../../src/main/qr-manual-actions';
import type { QrManualSelection, QrManualPreview } from '../../src/core/qr/qr-manual-service';
import type { ProductQrCode } from '../../src/core/qr/qr-types';
describe('actual manual desktop/service/HTTP integration',()=>{
 it('registers only native-selected external PDF, commits through trusted service and persists through restart',async()=>{
  const root=mkdtempSync(join(tmpdir(),'qr-e2e-'));let server:RunningServer|undefined;
  try{
   const dataDir=join(root,'data'),path=join(root,'ZU70SD-Warranty(pdgp845).pdf');writeFileSync(path,'%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
   server=await startServer({port:0,dataDir,token:'manual-token',allowedOrigins:['http://127.0.0.1:5173']});
   async function post(route:string,input:unknown){const response=await fetch(`${server!.url}${route}`,{method:'POST',headers:{'content-type':'application/json','x-planner-token':'manual-token',origin:'http://127.0.0.1:5173'},body:JSON.stringify(input)});expect(response.status).toBe(201);return await response.json() as {id:number};}
   const brand=await post('/api/dictionaries/brand',{code:'B',name:'Brand'}),size=await post('/api/dictionaries/product_size',{code:'S',name:'Size'}),appearance=await post('/api/dictionaries/appearance',{code:'A',name:'Appearance'});
   const product=await post('/api/products',{sku:'SKU70',model:'ZU70SD',productCategory:'冰柜',brandId:brand.id,productSizeId:size.id,defaultAppearanceId:appearance.id});
   const purposes=await(await fetch(`${server.url}/api/qr-purposes`)).json() as {items:Array<{id:number;key:string}>};const purpose=purposes.items.find(p=>p.key==='warranty')!;
   const openPath=vi.fn().mockResolvedValue('');const handlers=createQrManualHandlers({choosePdf:async()=>path,execute:async(action,input)=>server!.qrManualAction(action,input),openPath,showItemInFolder:vi.fn()});
   const selection=await handlers.select() as QrManualSelection;const preview=await handlers.action({},'preview',{token:selection.token,productId:product.id,purposeId:purpose.id,name:'ZU70SD Warranty',targetUrl:'https://qrs.ly/pdgp845'}) as QrManualPreview;
   const record=await handlers.action({},'commit',{previewId:preview.previewId}) as ProductQrCode;expect(record.files[0].relativePath).toBe(path);expect(record.status).toBe('inactive');
   const httpRecord=await(await fetch(`${server.url}/api/qr-codes/${record.id}`)).json() as ProductQrCode;expect(httpRecord.files[0].externalFileId).toBe(record.files[0].externalFileId);
   const untrusted=await fetch(`${server.url}/api/qr-manual/select`,{method:'POST',headers:{'content-type':'application/json','x-planner-token':'manual-token',origin:'http://127.0.0.1:5173'},body:JSON.stringify({path})});expect(untrusted.status).toBe(404);
   await handlers.action({},'open',{fileId:record.files[0].externalFileId});expect(openPath).toHaveBeenCalledWith(path);
   await server.close();server=await startServer({port:0,dataDir,token:'manual-token',allowedOrigins:['http://127.0.0.1:5173']});
   const restored=await(await fetch(`${server.url}/api/qr-codes/${record.id}`)).json() as ProductQrCode;expect(restored.files[0].externalFileId).toBe(record.files[0].externalFileId);await handlers.action({},'show',{fileId:record.files[0].externalFileId});
   const history=await(await fetch(`${server.url}/api/qr-codes/${record.id}/manual-history`)).json() as {revision:string;items:unknown[]};expect(history.items).toHaveLength(1);
   const unlink=await fetch(`${server.url}/api/qr-codes/${record.id}/manual-link`,{method:'DELETE',headers:{'content-type':'application/json','x-planner-token':'manual-token',origin:'http://127.0.0.1:5173'},body:JSON.stringify({revision:history.revision})});expect(unlink.status).toBe(200);expect((await unlink.json() as ProductQrCode).files).toEqual([]);
  }finally{await server?.close();rmSync(root,{recursive:true,force:true});}
 },20000);
});
