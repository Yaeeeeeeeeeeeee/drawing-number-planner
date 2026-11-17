import {existsSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'vite';
import {expect,test} from '@playwright/test';
if(existsSync('/usr/bin/chromium'))test.use({channel:undefined,launchOptions:{executablePath:'/usr/bin/chromium'}});

function pdf(first='First page',second='Second page',metadata='original',rotation=0,width=120.5){
 const stream=(text:string)=>`BT /F1 12 Tf 10 70 Td (${text}) Tj ET`;
 const contents=[stream(first),stream(second)];
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',`<< /Type /Page /Parent 2 0 R /Rotate ${rotation} /MediaBox [0 0 ${width} 100] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>`,`<< /Length ${contents[0].length} >>\nstream\n${contents[0]}\nendstream`,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 120 100] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>',`<< /Length ${contents[1].length} >>\nstream\n${contents[1]}\nendstream`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Title (${metadata}) >>`];
 let result='%PDF-1.4\n';const offsets=[0];objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(result));result+=`${i+1} 0 obj\n${o}\nendobj\n`;});const xref=Buffer.byteLength(result);result+=`xref\n0 ${offsets.length}\n0000000000 65535 f \n${offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size ${offsets.length} /Root 1 0 R /Info 8 0 R >>\nstartxref\n${xref}\n%%EOF\n`;return Buffer.from(result);
}

test('compares real decoded first-page RGBA, excluding metadata and all later pages',async({page})=>{
 const dir=mkdtempSync(join(tmpdir(),'qr-first-page-'));const vite=await createServer({configFile:'vite.config.ts',server:{host:'127.0.0.1',port:5175,strictPort:true}});
 const original=pdf(),metadata=pdf('First page','Second page','different encoding metadata'),later=pdf('First page','Entirely changed second page');
 const files={original,metadata,later,changed:pdf('Changed first'),rotated:pdf('First page','Second page','rotated',90),dimensions:pdf('First page','Second page','different size',0,121.5),broken:Buffer.from('%PDF-1.4\ninvalid')};
 for(const [key,bytes]of Object.entries(files))writeFileSync(join(dir,`${key}.pdf`),bytes);
 try {
  await vite.listen();await page.goto('http://127.0.0.1:5175/');
  const result=await page.evaluate(async(input)=>{
   // Vite loads the exact production helper, worker and bundled assets into a real browser canvas.
   const modulePath='/data/qr-first-page-pixels.ts';const {compareQrFirstPagePixels,decodeQrFirstPagePixels}=await import(modulePath);
   const base=await decodeQrFirstPagePixels(input.original);const rotated=await decodeQrFirstPagePixels(input.rotated);
   let dark=0,opaque=true;for(let i=0;i<base.data.length;i+=4){if(base.data[i]<128)dark++;if(base.data[i+3]!==255)opaque=false;}
   const results:Record<string,string>={};for(const key of ['metadata','later','changed','rotated','dimensions'])results[key]=await compareQrFirstPagePixels(input.original,input[key]);
   try{await compareQrFirstPagePixels(input.original,input.broken);results.broken='equal';}catch{results.broken='unavailable';}
   const controller=new AbortController();controller.abort();try{await compareQrFirstPagePixels(input.original,input.original,controller.signal);results.aborted='equal';}catch{results.aborted='unavailable';}
   return {results,width:base.width,height:base.height,rotatedWidth:rotated.width,rotatedHeight:rotated.height,dark,opaque};
  },Object.fromEntries(Object.entries(files).map(([key,bytes])=>[key,bytes.toString('base64')])));
  expect(original.equals(metadata)).toBe(false);expect(original.equals(later)).toBe(false);
  expect(result).toMatchObject({results:{metadata:'equal',later:'equal',changed:'different',rotated:'different',dimensions:'different',broken:'unavailable',aborted:'unavailable'},width:121,height:100,rotatedWidth:100,rotatedHeight:121,opaque:true});expect(result.dark).toBeGreaterThan(20);
  for(const [key,bytes]of Object.entries(files))expect(readFileSync(join(dir,`${key}.pdf`))).toEqual(bytes);
 }finally{await vite.close();rmSync(dir,{recursive:true,force:true});}
});
