import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {expect,test} from '@playwright/test';
import Database from 'better-sqlite3';
const verify=createRequire(import.meta.url)('../../scripts/verify-v51-mail.cjs');
test('V5.1 real XLSX import -> exact changed PDF ZIP -> editable mail draft preserves business history',async({page})=>{
 test.setTimeout(120000);
 const data=process.env.PHASE4_E2E_DATA_DIR!,workspace=process.env.PHASE4_WORKSPACE_ROOT!,output=join(data,'v51-exports');
 mkdirSync(output,{recursive:true});writeFileSync(join(data,'settings.json'),JSON.stringify({workspaceRoot:workspace,outboundOutputRoot:output}));
 const snapshot=(file:string)=>{const db=new Database(file,{readonly:true});try{return Object.fromEntries((db.prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name").all() as {name:string}[]).map(({name})=>[name,db.prepare(`select * from "${name}" order by rowid`).all()]));}finally{db.close();}};
 const go=async(page:any,label:string)=>{const nav=page.getByRole('navigation',{name:'主导航'});if(!await nav.isVisible())await page.getByRole('button',{name:'展开导航',exact:true}).click();await nav.getByRole('button',{name:label,exact:true}).click();await page.getByRole('heading',{name:label,exact:true}).waitFor();};
 const writePdf=(file:string,text:string)=>{mkdirSync(join(file,'..'),{recursive:true});writeFileSync(file,`%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n% ${text}\n%%EOF\n`);};
 await page.goto('/');
 const result=await verify({page,source:process.cwd(),workspace,output,evidence:join(process.cwd(),'test-results','v51-mail'),writePdf,snapshot,databaseFile:join(data,'planner.db'),go});
 expect(result).toMatchObject({realXlsx:true,changedNameplateOnly:true,exactSelectedZipFileCount:1,protectedRowsUnchanged:true,zipAndSnapshotsUnchangedByDraft:true});
});
