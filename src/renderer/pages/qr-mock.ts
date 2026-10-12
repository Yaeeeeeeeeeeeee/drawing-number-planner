import type { PlannerApi, ProductQrCodeView, QrFileView, QrPurposeView, ProductView } from '../data/client';

export const isQrMockEnabled = () => import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mock') === 'qr';
export function createQrMockApi(): PlannerApi {
  const purposes: QrPurposeView[] = ['说明书', '售后', '菜谱'].map((displayName, i) => ({ id: -10-i, key: ['user_manual','warranty','recipe'][i], englishName: ['User Manual','Warranty','Recipe'][i], displayName, defaultForAll: false, status: 'active', productCategories: [] }));
  const products = Array.from({length: 12}, (_, i) => ({id: -100-i, sku: `MOCK-F${60+i}`, model: `F${60+i}`, productCategory: '洗碗机', status: 'active'} as ProductView));
  const file = (id: number, present: boolean, pending = false): QrFileView => ({id, fileName: `F60-说明书-多语言验收样例（网址编码）-${Math.abs(id)}.png`, relativePath: `MOCK_ONLY/洗碗机/MOCK-F60-F60/供应商交付/多语言资料/二维码/F60-${Math.abs(id)}.png`, mimeType: 'image/png', isPresent: present, matchStatus: pending ? 'pending' : 'matched', detectedIdentifier: '验收样例'});
  let rows: ProductQrCodeView[] = products.flatMap((p,i)=>purposes.map((purpose,j)=>({id:-1000-i*3-j,productId:p.id,sku:p.sku,model:p.model,productCategory:p.productCategory,purposeId:purpose.id,key:purpose.key,englishName:purpose.englishName,displayName:purpose.displayName,purposeStatus:'active',name:`${p.model} ${purpose.displayName}二维码`,targetUrl:'https://example.invalid/manual/acceptance?language=zh-CN&source=mock-only',status:j===2?'inactive':'active',createdAt:'2026-10-01T08:00:00Z',updatedAt:'2026-10-01T08:00:00Z',files:i===0?[file(-2000-j,true)]:i%3===1?[file(-2000-i*3-j,false),file(-3000-i*3-j,true)]:[],pendingFiles:i%3===1?[file(-4000-i*3-j,true,true),file(-5000-i*3-j,false,true)]:[]})));
  const clone = <T,>(v:T):T => structuredClone(v);
  const get = (id:number) => {const row=rows.find(r=>r.id===id);if(!row)throw new Error('Mock 二维码不存在');return row;};
  const methods: Partial<PlannerApi> = {
    listProducts: async()=>clone(products), listQrPurposes:async()=>({items:clone(purposes)}),
    listQrCodes:async(f={})=>({items:clone(rows.filter(r=>(!f.search||`${r.sku} ${r.model}`.includes(f.search))&&(!f.productCategory||r.productCategory===f.productCategory)&&(!f.purposeId||r.purposeId===f.purposeId)&&(!f.status||f.status==='all'||r.status===f.status)&&(!f.fileStatus||f.fileStatus==='all'||(f.fileStatus==='none'?r.files.length===0:r.files.some(file=>file.isPresent===(f.fileStatus==='present'))))))}),
    getQrCode:async id=>clone(get(id)), updateQrCode:async(id,input)=>{Object.assign(get(id),input);return clone(get(id));},
    activateQrCode:async id=>{get(id).status='active';return clone(get(id));}, deactivateQrCode:async id=>{get(id).status='inactive';return clone(get(id));},
    listPendingQrFiles:async(productId,purposeId)=>({items:clone(rows.filter(r=>r.productId===productId&&r.purposeId===purposeId).flatMap(r=>r.pendingFiles))}),
    associateQrFile:async(id,fileId)=>{const row=get(id);const item=row.pendingFiles.find(f=>f.id===fileId);if(!item||!item.isPresent)throw new Error('待关联文件不存在或已缺失');row.files.push({...item,matchStatus:'matched'});row.pendingFiles=row.pendingFiles.filter(f=>f.id!==fileId);return clone(row);},
    deleteQrCode:async id=>{const row=get(id);if(row.files.length)throw new Error('二维码仍被文件引用，不能删除');rows=rows.filter(r=>r.id!==id);return {deleted:true};},
    createQrPurpose:async input=>{const row={...input,id:-900-purposes.length,status:'active' as const};purposes.push(row);return clone(row);},
    createQrCode:async input=>{if(rows.some(r=>r.productId===input.productId&&r.purposeId===input.purposeId))throw new Error('该产品已经存在此二维码用途');const p=products.find(p=>p.id===input.productId);const purpose=purposes.find(p=>p.id===input.purposeId);if(!p||!purpose)throw new Error('产品或用途不存在');const row={...rows[0],...input,id:-9000-rows.length,sku:p.sku,model:p.model,productCategory:p.productCategory,key:purpose.key,englishName:purpose.englishName,displayName:purpose.displayName,files:[],pendingFiles:[]};rows.push(row);return clone(row);},
  };
  return new Proxy(methods as PlannerApi,{get(target,key){if(key in target)return target[key as keyof PlannerApi];return async()=>{throw new Error(`二维码 Mock 未实现 ${String(key)}，禁止真实服务回退`);};}});
}
