import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'vite';
import {expect,test} from '@playwright/test';
import {startServer} from '../../src/server/start-server';
import {openDatabase} from '../../src/db/database';
import {DictionaryService} from '../../src/core/dictionaries/dictionary-service';

test('preserves module drafts and opens a real AIT drawer without resizing the table',async({page})=>{
 const data=mkdtempSync(join(tmpdir(),'v16-workspace-')),root=join(data,'library');mkdirSync(root);
 writeFileSync(join(data,'settings.json'),JSON.stringify({workspaceRoot:root}));
 const server=await startServer({port:0,dataDir:data,allowedOrigins:['http://127.0.0.1:5174']});
 const db=openDatabase(join(data,'planner.db')),dictionary=new DictionaryService(db);
 dictionary.create({type:'brand',code:'02',name:'SAMKYO'});
 const main=dictionary.create({type:'main_category',code:'02',name:'铭牌类'});
 dictionary.create({type:'project_item',code:'01',name:'铭牌',parentId:main.id});
 const vite=await createServer({configFile:'vite.config.ts',server:{host:'127.0.0.1',port:5174,strictPort:true,proxy:{'/api':server.url}}});
 try{
  await vite.listen();await page.setViewportSize({width:1920,height:1080});await page.goto('http://127.0.0.1:5174/');
  const nav=page.getByRole('navigation',{name:'主导航'});
  await nav.getByRole('button',{name:'BOM 管理',exact:true}).click();
  // Native date inputs do not expose the textbox role consistently in Chromium.
  const businessDate=page.getByLabel('业务变更日期',{exact:true});await businessDate.fill('2026-10-17');
  await nav.getByRole('button',{name:'编码字典',exact:true}).click();
  await nav.getByRole('button',{name:'BOM 管理',exact:true}).click();
  await expect(businessDate).toHaveValue('2026-10-17');
  await nav.getByRole('button',{name:'包材模板',exact:true}).click();
  const tableElement=page.locator('#pkg-panel-templates .table-wrap');await expect(tableElement).toBeVisible();
  await page.evaluate(async()=>{await Promise.all(document.getAnimations().map(animation=>animation.finished.catch(()=>{})));await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));});
  const before=await tableElement.boundingBox();
  await page.getByRole('button',{name:'新增 AIT 模板',exact:true}).click();
  const drawer=page.getByRole('dialog',{name:'新增 AIT 模板',exact:true});await expect(drawer).toBeVisible();
  const after=await tableElement.boundingBox();expect(after).toEqual(before);
  const bounds=await drawer.boundingBox();expect(bounds!.x+bounds!.width).toBe(1920);expect(bounds!.width).toBeLessThan(1000);
  await drawer.getByLabel('模板名称',{exact:true}).fill('未保存的铭牌模板');
  page.once('dialog',dialog=>dialog.dismiss());await page.keyboard.press('Escape');await expect(drawer).toBeVisible();
  await expect(drawer.getByLabel('模板名称',{exact:true})).toHaveValue('未保存的铭牌模板');
  const evidence=join(process.cwd(),'work','v16-corrections','evidence');mkdirSync(evidence,{recursive:true});
  await page.screenshot({path:join(evidence,'phase2-ait-drawer-1920.png'),fullPage:true});
  await page.setViewportSize({width:600,height:900});await expect(drawer).toBeVisible();
  const narrow=await drawer.boundingBox();expect(narrow!.width).toBe(600);
  await expect(drawer.getByRole('button',{name:'保存模板',exact:true})).toBeVisible();
  await page.screenshot({path:join(evidence,'phase2-ait-drawer-600.png'),fullPage:true});
  page.once('dialog',dialog=>dialog.accept());await drawer.getByRole('button',{name:'取消',exact:true}).click();await expect(drawer).not.toBeVisible();
 }finally{await vite.close();await server.close();db.close();rmSync(data,{recursive:true,force:true});}
});
