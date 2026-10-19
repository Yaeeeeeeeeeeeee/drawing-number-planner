const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { DatabaseSync } = require('node:sqlite');
const [sourceArg, executableArg] = process.argv.slice(2);
const source = path.resolve(sourceArg), executable = path.resolve(executableArg), directory = path.dirname(executable);
const { _electron } = createRequire(path.join(source, 'package.json'))('@playwright/test');
const seed = path.join(directory, 'resources/app/acceptance-seed/planner.db');
const hash = () => crypto.createHash('sha256').update(fs.readFileSync(seed)).digest('hex');
const before = hash();
function snapshot(file) {
  const db = new DatabaseSync(file,{readOnly:true});
  try { return Object.fromEntries(db.prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name").all().map(({name})=>[name,db.prepare(`select * from "${name.replaceAll('"','""')}" order by rowid`).all()])); }
  finally {db.close();}
}
(async () => {
  const app = await _electron.launch({ executablePath: executable, timeout: 45000 });
  try {
    const page = await app.firstWindow();
    await page.getByRole('heading', { name:'图号规划', exact:true }).waitFor({ timeout:30000 });
    const root = await app.evaluate(({app})=>app.getPath('userData'));
    assert.equal(path.basename(root),process.env.PLANNER_ACCEPTANCE_REVISION.slice(0,7));
    assert.ok(root.includes('DrawingNumberPlannerAcceptance'));
    const originalDatabase = snapshot(path.join(root,'planner.db'));
    const native = await app.evaluate(({ BrowserWindow, Menu }) => {
      const window = BrowserWindow.getAllWindows()[0];
      return { menuVisible:window.isMenuBarVisible(), autoHide:window.isMenuBarAutoHide(), recoveryMenuPreserved:Menu.getApplicationMenu().items[0].submenu.items.some(item => item.label === '安全恢复') };
    });
    assert.equal(native.menuVisible, false); assert.equal(native.autoHide, true); assert.equal(native.recoveryMenuPreserved, true);
    assert.equal(await page.locator('.workspace-topbar').count(), 0);
    assert.equal(await page.locator('#workspace-navigation').isVisible(), true);
    await page.getByRole('navigation', { name:'主导航' }).getByRole('button', { name:'二维码管理', exact:true }).click();
    await page.getByRole('heading', { name:'二维码管理', exact:true }).waitFor();
    const writes = [];
    page.on('request', request => { if (request.url().includes('/api/') && !['GET','HEAD'].includes(request.method()) && !request.url().endsWith('/api/session')) writes.push(request.method()+' '+request.url()); });
    const rows = [];
    for (const [width,height] of [[3840,2160],[1920,1080],[1100,760],[1024,760],[1023,760],[720,600]]) {
      await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(...size), [width,height]);
      await page.waitForTimeout(200);
      const toggle = page.getByRole('button', { name:'展开导航', exact:true });
      if (await toggle.isVisible()) await toggle.click();
      const layout = await page.evaluate(() => {
        const panel = document.querySelector('#workspace-navigation'), main = document.querySelector('main.workspace');
        const p = panel.getBoundingClientRect(), m = main.getBoundingClientRect();
        return { width:innerWidth, height:innerHeight, panelRight:p.right, mainLeft:m.left, mainTop:m.top, mainHeight:m.height, inert:main.inert, overflow:document.documentElement.scrollWidth > innerWidth };
      });
      assert.equal(layout.width,width); assert.equal(layout.height,height); assert.equal(layout.mainTop,0); assert.equal(layout.mainHeight,height); assert.equal(layout.overflow,false); assert.equal(layout.inert,width<1024);
      if (width>=1024) assert.ok(layout.panelRight<=layout.mainLeft);
      await page.screenshot({ path:path.join(directory,`Windows-浮动目录-展开-${width}.png`) });
      await page.getByRole('button', { name:'关闭导航', exact:true }).click();
      const input = page.getByLabel('SKU / 型号', { exact:true });
      await input.fill('保留筛选');
      await toggle.click();
      if(width<1024) await page.keyboard.press('Escape');
      else await page.getByRole('button', { name:'关闭导航', exact:true }).click();
      assert.equal(await input.inputValue(),'保留筛选');
      assert.equal(await toggle.evaluate(n=>n===document.activeElement),true);
      await page.screenshot({ path:path.join(directory,`Windows-浮动目录-收起-${width}.png`) });
      rows.push(layout);
    }
    // Read-only verification of the new endpoint on the original existing sample.
    // Do not delete, restore or add a sample dictionary to manufacture a scenario.
    const dictionaryPreflight = await page.evaluate(async()=>{
      const listed = await (await fetch('/api/dictionaries/brand?includeInactive=true&includeDeleted=true')).json();
      const item = listed.items[0];
      if (!item) throw Error('Original sample brand missing');
      const response = await fetch(`/api/dictionaries/items/${item.id}/permanent-deletion`);
      if (!response.ok) throw Error('Permanent deletion preflight unavailable');
      return response.json();
    });
    assert.equal(dictionaryPreflight.allowed,false); assert.ok(dictionaryPreflight.blockers.length);
    assert.deepEqual(writes,[]);
    // Reproduce the user's complete delete -> restore -> keyboard edit flow on
    // one EXISTING isolated sample brand, then restore its original name.
    // No new records, cascades, production data or original-file operations.
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1920,1080));
    await page.waitForTimeout(150);
    const toggle = page.getByRole('button',{name:'展开导航',exact:true});
    if(await toggle.isVisible())await toggle.click();
    await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'编码字典',exact:true}).click();
    const brand = dictionaryPreflight.item;
    assert.equal(brand.status,'active');assert.ok(!brand.deletedAt);
    const nativeDialogs=[];page.on('dialog',dialog=>{nativeDialogs.push(dialog.message());void dialog.dismiss();});
    await page.getByRole('button',{name:`删除 ${brand.name}`,exact:true}).click();
    await page.getByRole('button',{name:'确认删除',exact:true}).click();
    const deletedFilter=page.getByRole('checkbox',{name:'显示已删除',exact:true});
    await deletedFilter.check();
    await page.getByRole('button',{name:`恢复 ${brand.name}`,exact:true}).click();
    await page.getByRole('button',{name:'确认恢复',exact:true}).click();
    await page.getByRole('button',{name:`停用 ${brand.name}`,exact:true}).waitFor();
    const actionSizes=await page.locator('.dm-actions > button').evaluateAll(nodes=>nodes.map(n=>({width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height})));
    assert.ok(actionSizes.length>=3&&actionSizes.every(r=>r.width===76&&r.height===32));
    await page.getByRole('button',{name:`修改 ${brand.name}`,exact:true}).click();
    const input=page.getByLabel('修改名称',{exact:true});
    await input.click();await page.keyboard.press('Control+A');await page.keyboard.type('ABC');
    await page.keyboard.press('ArrowLeft');await page.keyboard.press('Backspace');assert.equal(await input.inputValue(),'AC');
    await page.keyboard.press('Delete');assert.equal(await input.inputValue(),'A');
    await page.keyboard.press('Control+A');await page.keyboard.type('Windows-Restore-Edit');
    assert.equal(await input.inputValue(),'Windows-Restore-Edit');
    assert.equal(await input.evaluate(n=>n===document.activeElement),true);
    const editorSizes=await page.locator('.dictionary-name-editor > button').evaluateAll(nodes=>nodes.map(n=>({width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height})));
    assert.equal(editorSizes.length,2);assert.ok(editorSizes.every(r=>r.width===76&&r.height===32));
    await page.screenshot({path:path.join(directory,'Windows-浮动目录-恢复后键盘编辑-1920.png')});
    await page.getByRole('button',{name:'保存',exact:true}).click();
    await page.getByRole('button',{name:'修改 Windows-Restore-Edit',exact:true}).click();
    await page.getByLabel('修改名称',{exact:true}).fill(brand.name);
    await page.getByRole('button',{name:'保存',exact:true}).click();
    await page.getByRole('button',{name:`修改 ${brand.name}`,exact:true}).waitFor();
    assert.deepEqual(nativeDialogs,[]);
    const suffix=`/api/dictionaries/items/${brand.id}`;
    assert.equal(writes.length,4);
    assert.ok(writes[0].startsWith('DELETE ')&&writes[0].endsWith(suffix));
    assert.ok(writes[1].startsWith('POST ')&&writes[1].endsWith(suffix+'/activate'));
    assert.ok(writes.slice(2).every(w=>w.startsWith('PATCH ')&&w.endsWith(suffix)));
    // Read-only acceptance of product dictionary options and explicit exit choices.
    // Do not execute product exit or clear history in the pre-existing sample.
    const product=await page.evaluate(async()=>{const response=await fetch('/api/products?status=all');return (await response.json()).items[0];});
    assert.ok(product,'Existing sample product required');
    if(await toggle.isVisible())await toggle.click();
    await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'产品档案',exact:true}).click();
    await page.getByRole('button',{name:`编辑 ${product.model}`,exact:true}).click();
    await page.getByLabel('品牌',{exact:true}).locator(`option[value="${product.brandId}"]`).waitFor({state:'attached'});
    await page.getByRole('button',{name:`删除档案 ${product.model}`,exact:true}).click();
    const cleanup=page.getByRole('region',{name:'产品删除检查与清理'});
    await cleanup.getByLabel('输入型号确认').fill(product.model);
    assert.equal(await cleanup.getByRole('radio',{checked:true}).count(),0);
    assert.equal(await cleanup.getByRole('button',{name:'核对处理结果',exact:true}).isDisabled(),true);
    await cleanup.getByLabel('继续保留占号',{exact:true}).check();
    await cleanup.getByLabel('保留业务历史',{exact:true}).check();
    const cleanupButtons=await cleanup.locator(':scope > .product-cleanup-actions > button').evaluateAll(nodes=>nodes.map(n=>({width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height})));
    assert.equal(cleanupButtons.length,2);assert.ok(cleanupButtons.every(r=>r.width===120&&r.height===36));
    await cleanup.getByRole('button',{name:'核对处理结果',exact:true}).scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(directory,'Windows-产品删除处理选项-1920.png')});
    await cleanup.getByLabel('释放占号',{exact:true}).check();
    await cleanup.getByLabel('永久清除业务历史',{exact:true}).check();
    assert.equal(await cleanup.getByRole('button',{name:'核对处理结果',exact:true}).isDisabled(),true);
    await cleanup.getByLabel('输入“永久清除历史”确认').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(directory,'Windows-产品释放与历史清除确认-1920.png')});
    await cleanup.getByRole('button',{name:'取消',exact:true}).click();
    if(await toggle.isVisible())await toggle.click();
    await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'图号库',exact:true}).click();
    await page.getByRole('columnheader',{name:'来源',exact:true}).waitFor();
    await page.locator('.drawing-project-name').first().waitFor();
    const projectFont=await page.locator('.drawing-project-name').first().evaluate(n=>getComputedStyle(n).fontSize);
    assert.equal(projectFont,'12px');
    await page.screenshot({path:path.join(directory,'Windows-图号来源与主类别标签-1920.png')});
    assert.equal(writes.length,4);
    assert.deepEqual(snapshot(path.join(root,'planner.db')),originalDatabase);assert.equal(hash(),before);
    fs.writeFileSync(path.join(directory,'windows-floating-navigation.json'),JSON.stringify({ revision:process.env.PLANNER_ACCEPTANCE_REVISION, native, rows, dictionaryPreflight, actionSizes, editorSizes,cleanupButtons,projectFont,sourceColumn:true,productDictionaryOptions:true,productExitChoicesReadOnly:true, restoredKeyboardEdit:true, originalDatabaseRestored:true, filterPreserved:true, seedUnchanged:true, writes, scope:'Installed EXE on native Windows; controlled delete/restore/rename of one existing isolated sample, product exit choices inspected read-only, original database rows restored. Physical user IME/4K/DPI remain manual.' },null,2));
  } finally { await app.close(); }
})().catch(error=>{ console.error(error);process.exitCode=1; });
