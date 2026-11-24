import {join} from 'node:path';
import {expect,test} from '@playwright/test';
import {openDatabase} from '../../src/db/database';
import {DictionaryService} from '../../src/core/dictionaries/dictionary-service';
import {ProductService} from '../../src/core/products/product-service';

test('product create and edit drawers preserve the filtered list and its scroll at desktop sizes',async({page})=>{
  const db=openDatabase(join(process.env.PHASE4_E2E_DATA_DIR!,'planner.db'));
  try {
    const dictionary=new DictionaryService(db);
    const brand=dictionary.create({type:'brand',code:'93',name:'Drawer Brand'});
    const size=dictionary.create({type:'product_size',code:'9382',name:'Drawer Size'});
    const products=new ProductService(db);
    for(let i=0;i<65;i++){
      products.create({sku:'DRAWER'+i,model:'ZC'+(100+i)+'（WB55）',productCategory:'Drawer products',brandId:brand.id,productSizeId:size.id});
    }
    await page.goto('/');
    await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'产品档案',exact:true}).click();
    const section=page.locator('.products-compact:visible');
    const filter=section.getByLabel('搜索产品',{exact:true});
    await filter.fill('DRAWER');
    await section.getByRole('button',{name:'筛选',exact:true}).click();
    const table=section.locator('.table-wrap');
    await expect(table.locator('tbody tr').first()).toContainText('DRAWER');
    for(const [width,height] of [[1280,900],[1440,900],[1920,1080],[2560,1440]]){
      await page.setViewportSize({width,height});
      await table.evaluate(e=>{e.scrollTop=500});
      await expect.poll(()=>table.evaluate(e=>e.scrollTop)).toBeGreaterThan(0);
      const edit=table.getByRole('button',{name:/^编辑 ZC/}).nth(5);
      await edit.scrollIntoViewIfNeeded();
      const scroll=await table.evaluate(e=>e.scrollTop);
      const row=edit.locator('xpath=ancestor::tr');
      const model=await row.locator('td[data-column-key=model]').innerText();
      expect(model.replace(/\s/g,'')).toMatch(/^ZC\d+（WB55）$/);
      expect((await row.boundingBox())!.height).toBe(53);
      await edit.click();
      const dialog=page.getByRole('dialog');
      await expect(dialog.getByRole('button',{name:'保存修改'})).toBeVisible();
      await expect(row).toHaveAttribute('aria-selected','true');
      await expect.poll(async()=>{const box=await dialog.boundingBox();return box?Math.round(box.x+box.width):0}).toBe(width);
      await dialog.getByRole('button',{name:'取消'}).click();
      await expect(edit).toBeFocused();
      await expect(filter).toHaveValue('DRAWER');
      expect(await table.evaluate(e=>e.scrollTop)).toBe(scroll);
      const create=section.getByRole('button',{name:'新建产品',exact:true});
      await create.click();
      await expect(dialog.getByRole('button',{name:'保存产品'})).toBeVisible();
      await expect(table).toBeVisible();
      await expect(dialog.getByLabel('型号',{exact:true})).toHaveValue('');
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(create).toBeFocused();
      await expect(row).toHaveAttribute('aria-selected','true');
      expect(await table.evaluate(e=>e.scrollTop)).toBe(scroll);
    }
  }finally{db.close();}
});
