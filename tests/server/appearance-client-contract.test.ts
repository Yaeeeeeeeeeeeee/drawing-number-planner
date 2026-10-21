// @vitest-environment node
import Fastify from 'fastify';
import { expect, it } from 'vitest';
import { openDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';
import { ProductService } from '../../src/core/products/product-service';
import { AppearanceService } from '../../src/core/products/appearance-service';
import { registerAppearanceRoutes } from '../../src/server/routes/appearances';
import { createAppearanceApi } from '../../src/renderer/data/appearance-client';
it('uses the renderer factory against real appearance routes and returns only scoped plus shared QR facts', async () => {
  const db = openDatabase(':memory:');
  migrateDatabase(db, { databaseExists: false, createBackup() {} });
  const app = Fastify();
  try {
    db.exec("insert into dictionary_items(id,type,code,name,created_at) values(101,'brand','02','品牌','2026-01-01'),(102,'product_size','0209','尺寸','2026-01-01'),(103,'color','1','黑色','2026-01-01')");
    const p = new ProductService(db).create({sku:'CONTRACT',model:'合同型号',brandId:101,productSizeId:102,productCategory:'冰柜'});
    registerAppearanceRoutes(app, new AppearanceService(db));
    const api = createAppearanceApi(async <T,>(url: string, init?: RequestInit) => {
      const response = await app.inject({ method: (init?.method ?? 'GET') as 'GET'|'POST'|'PUT', url,
        ...(init?.headers ? {headers:init.headers as Record<string,string>} : {}),
        ...(init?.body ? {payload:String(init.body)} : {}) });
      if(response.statusCode >= 400) throw new Error(response.json().error.message ?? response.json().error.code);
      return response.json<T>();
    });
    const initial = await api.listAppearanceVersions!(p.id);
    const old = initial.items[0];
    const draft = await api.createAppearanceDraft!(p.id,{label:'新版黑色',colorIds:[103],predecessorId:old.id});
    expect(draft).toMatchObject({status:'draft',colorIds:[103],predecessorId:old.id});
    const qr = db.prepare("insert into product_qr_codes(product_id,purpose_id,appearance_version_id,name,target_url,status,created_at,updated_at) values(?,1,?,?,?,'inactive','2026-01-01','2026-01-01')");
    const oldQr = Number(qr.run(p.id,old.id,'原版QR','https://example.com/1111111').lastInsertRowid);
    const newQr = Number(qr.run(p.id,draft.id,'新版QR','https://example.com/2222222').lastInsertRowid);
    const sharedQr = Number(qr.run(p.id,null,'共用QR','https://example.com/3333333').lastInsertRowid);
    const resources = await api.getAppearanceResources!(draft.id);
    expect(resources).toMatchObject({appearanceVersionId:draft.id,colorIds:[103],drawings:[],pdfs:[],outboundPackages:[]});
    expect(resources.qrCodes.map(row=>row.id).sort()).toEqual([newQr,sharedQr].sort());
    expect(resources.qrCodes.find(row=>row.id===sharedQr)?.appearanceVersionId).toBeNull();
    expect(resources.qrCodes.some(row=>row.id===oldQr)).toBe(false);
    expect(resources.unboundCounts.qrCodes).toBe(0);
    const updated = await api.updateAppearanceDraft!(draft.id,{label:'更名黑色',colorIds:[103],predecessorId:old.id,expectedRevision:draft.revision});
    const versions = await api.listAppearanceVersions!(p.id);
    expect(versions.items.find(row=>row.id===old.id)?.status).toBe('current');
    await api.activateAppearanceVersion!(draft.id,{expectedRevision:updated.revision,expectedIdentityRevision:versions.revision});
    expect((await api.getAppearanceVersion!(draft.id)).status).toBe('current');
    expect((await api.getAppearanceVersion!(old.id)).status).toBe('historical');
  } finally { await app.close(); db.close(); }
});
