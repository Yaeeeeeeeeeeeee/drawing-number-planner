import {createRequire} from 'node:module';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createServer} from 'vite';
import {startServer} from '../../src/server/start-server';
import {dirname,join} from 'node:path';
import {expect,test} from '@playwright/test';
import Database from 'better-sqlite3';
const verify=createRequire(import.meta.url)('../../scripts/verify-ait-packaging-installed.cjs');
test('AIT catalog and durable manual drawing tasks use real UI, watcher, files, archive, original backups and scoped index',async({page})=>{
 test.setTimeout(180000);const data=mkdtempSync(join(tmpdir(),'ait-ui-isolated-')),workspace=join(data,'workspace');mkdirSync(workspace);
 const server=await startServer({port:0,dataDir:data,allowedOrigins:['http://127.0.0.1:5174']});
 const vite=await createServer({configFile:'vite.config.ts',server:{host:'127.0.0.1',port:5174,strictPort:true,proxy:{'/api':server.url}}});
 try{await vite.listen();
 const snapshot=(file:string)=>{const db=new Database(file,{readonly:true});try{return Object.fromEntries((db.prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name").all() as {name:string}[]).map(({name})=>[name,db.prepare(`select * from "${name}" order by rowid`).all()]));}finally{db.close();}};
 const go=async(page:any,label:string)=>{const nav=page.getByRole('navigation',{name:'主导航'});if(!await nav.isVisible())await page.getByRole('button',{name:'展开导航',exact:true}).click();await nav.getByRole('button',{name:label,exact:true}).click();await page.getByRole('heading',{name:label,exact:true}).waitFor();};
 const writePdf=(file:string,text:string)=>{mkdirSync(dirname(file),{recursive:true});const stream=`BT /F1 12 Tf 20 100 Td (${text}) Tj ET`,objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];let pdf='%PDF-1.4\n';const offsets:number[]=[];objects.forEach((object,index)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${index+1} 0 obj\n${object}\nendobj\n`;});const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;writeFileSync(file,pdf);};
 await page.goto('http://127.0.0.1:5174/');const result=await verify({page,source:process.cwd(),workspace,evidence:join(process.cwd(),'test-results','ait-packaging'),databaseFile:join(data,'planner.db'),snapshot,writePdf,go});expect(result).toMatchObject({actualHttpAndDom:true,watcherDetectedWithoutClick:true,formalBackupHashPreserved:true,realIllustratorGeneration:false});
 }finally{await vite.close();await server.close();rmSync(data,{recursive:true,force:true});}
});
