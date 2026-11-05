import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {expect,test} from '@playwright/test';
import Database from 'better-sqlite3';
const verify=createRequire(import.meta.url)('../../scripts/verify-v52-installed.cjs');
test('V5.2 scoped files, exact BOM correction and anonymous matrix import preserve original data',async({page})=>{
 test.setTimeout(180000);
 const data=process.env.PHASE4_E2E_DATA_DIR!,workspace=process.env.PHASE4_WORKSPACE_ROOT!,evidence=join(process.cwd(),'test-results','v52-mail');
 mkdirSync(evidence,{recursive:true});writeFileSync(join(data,'settings.json'),JSON.stringify({workspaceRoot:workspace}));
 const snapshot=(file:string)=>{const db=new Database(file,{readonly:true});try{return Object.fromEntries((db.prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name").all() as {name:string}[]).map(({name})=>[name,db.prepare(`select * from "${name}" order by rowid`).all()]));}finally{db.close();}};
 const go=async(page:any,label:string)=>{const nav=page.getByRole('navigation',{name:'主导航'});if(!await nav.isVisible())await page.getByRole('button',{name:'展开导航',exact:true}).click();await nav.getByRole('button',{name:label,exact:true}).click();await page.getByRole('heading',{name:label,exact:true}).waitFor();};
 const writePdf=(file:string,text:string)=>{mkdirSync(dirname(file),{recursive:true});const stream=`BT /F1 12 Tf 20 100 Td (${text}) Tj ET`;const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];let pdf='%PDF-1.4\n';const offsets:number[]=[];for(const [index,object] of objects.entries()){offsets.push(Buffer.byteLength(pdf));pdf+=`${index+1} 0 obj\n${object}\nendobj\n`;}const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;writeFileSync(file,pdf);};
 await page.goto('/');
 const result=await verify({page,source:process.cwd(),workspace,evidence,writePdf,snapshot,databaseFile:join(data,'planner.db'),go});
 expect(result).toMatchObject({actualHttpAndDom:true,actualInstalledHttpAndDom:false,scopedFiles:{unindexedReadOnly:true,conflictOneRowNoPicker:true},bom:{dateCorrectedInPlace:true},mail:{recognizedTemplates:25,uniqueContacts:14,roleLinks:135,sourceCasesPersisted:25}});
});
