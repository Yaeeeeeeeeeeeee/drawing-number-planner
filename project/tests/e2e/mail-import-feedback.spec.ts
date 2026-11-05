import {createRequire} from 'node:module';
import {join} from 'node:path';
import {expect,test} from '@playwright/test';
import Database from 'better-sqlite3';
const verify=createRequire(import.meta.url)('../../scripts/verify-1.3.1-mail-import.cjs');
test('single reviewed supplier template imports shared CC and keeps failure/success feedback visible at the submit button',async({page})=>{
 const databaseFile=join(process.env.PHASE4_E2E_DATA_DIR!,'planner.db');
 const snapshot=(file:string)=>{const db=new Database(file,{readonly:true});try{return Object.fromEntries((db.prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name").all() as {name:string}[]).map(({name})=>[name,db.prepare(`select * from "${name}" order by rowid`).all()]));}finally{db.close();}};
 const go=async(page:any,label:string)=>{const nav=page.getByRole('navigation',{name:'主导航'});if(!await nav.isVisible())await page.getByRole('button',{name:'展开导航',exact:true}).click();await nav.getByRole('button',{name:label,exact:true}).click();await page.getByRole('heading',{name:label,exact:true}).waitFor();};
 await page.goto('/');
 expect(await verify({page,source:process.cwd(),evidence:join(process.cwd(),'test-results','hotfix131'),databaseFile,snapshot,go})).toMatchObject({singleTemplateSharedCc:true,errorVisibleBesideButton:true,protectedRowsPreserved:true});
});
