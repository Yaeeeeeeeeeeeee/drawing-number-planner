import type { PlannerApi, ProductView, OutboundContactView, OutboundEmailTemplateView, OutboundSignatureView, OutboundPackageModeView } from '../../data/client';
import { partitionOutboundFiles } from '../../../core/outbound/outbound-partition';

export const isOutboundMockEnabled = () => import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mock') === 'outbound';
export type MockScenario = 'normal' | 'exceptions' | 'oversize';
export interface MockMaterial { id: number; name: string; code: string; batch: string; source: '当前批次' | '历史沿用'; state: 'normal' | 'carried_forward' | 'missing' | 'conflict' | 'needs_confirmation'; isPresent: boolean; selectable: boolean; reason: string; sizeBytes: number; changeDetails: string }
export interface MockPackage { id: number; name: string; product: string; mode: string; createdAt: string; items: MockMaterial[]; parts: Array<{ name: string; path: string; sizeBytes: number; count: number }> }
const copy = <T,>(value: T): T => structuredClone(value);
export const mockProducts = [{id:-1,sku:'MOCK-F60',model:'F60',productCategory:'洗碗机',brandId:-1,brandName:'样例品牌',status:'active'}, {id:-2,sku:'MOCK-T40',model:'T40',productCategory:'洗碗机',brandId:-1,brandName:'样例品牌',status:'active'}] as ProductView[];
export function mockMaterials(mode: OutboundPackageModeView, scenario: MockScenario, batch='03.20261001'): MockMaterial[] {
  const names=['说明书','包装箱','铭牌','能效标贴','售后卡','安装示意'];
  const rows=names.map((name,i):MockMaterial=>({id:-100-i,name:`02.0404.010.040100${i+1}-验收样例-F60白色-${name}（转曲）.pdf`,code:`02.0404.010.040100${i+1}`,batch,source:'当前批次',state:'normal',isPresent:true,selectable:true,reason:'',sizeBytes:20_000_000,changeDetails:`${name}：更新验收样例文字与排版。`}));
  if(mode==='change_only') rows.splice(3);
  else rows.slice(3).forEach(row=>{row.source='历史沿用';row.state='carried_forward';row.batch='02.20260901';row.changeDetails='沿用原资料，无本次修改。';});
  if(scenario==='exceptions') {
    const states=['missing','conflict','needs_confirmation'] as const;
    rows.slice(0,3).forEach((row,i)=>{row.state=states[i];row.isPresent=i!==0;row.selectable=false;row.reason=['转曲后文件缺失，禁止选择','候选资料存在冲突，确认前禁止选择','资料身份待确认，确认前禁止选择'][i];});
  }
  if(scenario==='oversize') { rows[0].sizeBytes=51_000_000;rows[0].reason='单文件 51MB，超过 50MB 上限，不能拆分文件内容。'; }
  return rows;
}
export function createOutboundMockStore() {
  let id=-1000;
  const oldItems=mockMaterials('current_complete','normal','02.20260901');
  const history:MockPackage[]=[{id:-900,name:'F60-包材资料-20260901',product:'MOCK-F60 · F60',mode:'当前完整包材资料',createdAt:'2026/9/1 10:00:00',items:copy(oldItems),parts:[{name:'F60-包材资料-20260901-part01.zip',path:'MOCK_ONLY/外发历史/F60-包材资料-20260901-part01.zip',sizeBytes:40_000_000,count:2},{name:'F60-包材资料-20260901-part02.zip',path:'MOCK_ONLY/外发历史/F60-包材资料-20260901-part02.zip',sizeBytes:40_000_000,count:2},{name:'F60-包材资料-20260901-part03.zip',path:'MOCK_ONLY/外发历史/F60-包材资料-20260901-part03.zip',sizeBytes:40_000_000,count:2}]}];
  return {
    history:()=>copy(history),
    generate(rows:MockMaterial[],selected:number[],product:ProductView,mode:OutboundPackageModeView):MockPackage {
      if(rows.some(row=>!row.selectable)) throw new Error('存在缺失、冲突或待确认资料，处理后才能打包。');
      const items=rows.filter(row=>selected.includes(row.id));
      if(!items.length) throw new Error('请选择至少一个可用文件。');
      const groups=partitionOutboundFiles(items);
      const name=`${product.model}-包材资料-${Math.abs(id)}`;
      const value:MockPackage={id:id--,name,product:`${product.sku} · ${product.model}`,mode:mode==='change_only'?'本次变更资料':'当前完整包材资料',createdAt:new Date().toLocaleString('zh-CN'),items:copy(items),parts:groups.map((group,i)=>({name:`${name}-part${String(i+1).padStart(2,'0')}.zip`,path:`MOCK_ONLY/外发结果/${name}-part${String(i+1).padStart(2,'0')}.zip`,sizeBytes:group.reduce((sum,row)=>sum+row.sizeBytes,0),count:group.length}))};
      history.unshift(copy(value));return copy(value);
    },
  };
}

// Explicit in-memory reference adapter. No real API or desktop dependency is accepted.
export function createOutboundReferenceMockApi():PlannerApi {
  const stamp={createdAt:'2026-10-01T08:00:00Z',updatedAt:'2026-10-01T08:00:00Z'};
  let next=-100;
  const contacts:OutboundContactView[]=[{id:-1,company:'样例供应商',contactName:'张工',email:'supplier@example.invalid',defaultRecipientType:'to',status:'active',notes:null,...stamp},{id:-2,company:'样例项目组',contactName:'李工',email:'project@example.invalid',defaultRecipientType:'cc',status:'active',notes:null,...stamp}];
  ['王工','赵工','陈工','刘工','周工','吴工','郑工','孙工','徐工','何工'].forEach((contactName,index)=>contacts.push({
    id:-30-index,company:['样例供应商','样例项目组','样例印刷公司','样例包装公司','样例物流公司'][Math.floor(index/2)],
    contactName,email:`mock.contact${index+1}@example.invalid`,defaultRecipientType:index%2===0?'to':'cc',status:'active',notes:'仅供 Mock 筛选与多选测试',...stamp,
  }));
  const templates:OutboundEmailTemplateView[]=['initial','update'].map((materialType,i)=>({id:-10-i,key:materialType,name:materialType==='initial'?'首批包材资料':'包材更新通知',materialType:materialType as 'initial'|'update',subjectTemplate:'{{package_name}}',bodyTemplate:'{{contact_salutation}}：\n\n请核对以下包材资料。\n{{change_files}}\n{{package_files}}\n{{optional_blocks}}\n\n{{signature}}',status:'active',blocks:[],...stamp}));
  const signatures:OutboundSignatureView[]=[{id:-20,name:'项目组签名',content:'样例项目组\n仅供 UI 验收',isDefault:true,status:'active',...stamp}];
  const api:Partial<PlannerApi>={
    listOutboundContacts:async(status)=>copy(contacts.filter(row=>!status||status==='all'||row.status===status)),
    listOutboundTemplates:async(status)=>copy(templates.filter(row=>!status||status==='all'||row.status===status)),
    listOutboundSignatures:async(status)=>copy(signatures.filter(row=>!status||status==='all'||row.status===status)),
    renderOutboundTemplate:async(id,variables)=>{const template=templates.find(row=>row.id===id);if(!template)throw new Error('Mock 模板不存在');const render=(text:string)=>text.replace(/\{\{\s*(\w+)\s*\}\}/g,(_all,key:string)=>String(variables[key]??''));return {subject:render(template.subjectTemplate),body:render(template.bodyTemplate).replace(/\n(?=\d+\.)/g, '\n\n').replace(/\n(?=分包附件：)/g, '\n\n').replace(/\.zip(?=\r?$)/gmi, '')};},
    createOutboundContact:async(input)=>{const row={...input,notes:input.notes??null,id:next--,status:'active' as const,...stamp};contacts.push(row);return copy(row);},
    updateOutboundContact:async(id,input)=>{const row=contacts.find(row=>row.id===id);if(!row)throw new Error('联系人不存在');Object.assign(row,input);return copy(row);},
    createOutboundTemplate:async(input)=>{const row={...input,id:next--,status:'active' as const,blocks:[],...stamp};templates.push(row);return copy(row);},
    updateOutboundTemplate:async(id,input)=>{const row=templates.find(row=>row.id===id);if(!row)throw new Error('模板不存在');Object.assign(row,input);return copy(row);},
    createOutboundSignature:async(input)=>{if(input.isDefault)signatures.forEach(row=>row.isDefault=false);const row={...input,id:next--,status:'active' as const,...stamp};signatures.push(row);return copy(row);},
    updateOutboundSignature:async(id,input)=>{const row=signatures.find(row=>row.id===id);if(!row)throw new Error('签名不存在');if(input.isDefault)signatures.forEach(row=>row.isDefault=false);Object.assign(row,input);return copy(row);},
    createOutboundTemplateBlock:async(id,input)=>{const template=templates.find(row=>row.id===id);if(!template)throw new Error('模板不存在');const row={...input,id:next--,templateId:id,status:'active' as const,...stamp};template.blocks.push(row);return copy(row);},
    updateOutboundTemplateBlock:async(id,input)=>{const row=templates.flatMap(row=>row.blocks).find(row=>row.id===id);if(!row)throw new Error('段落不存在');Object.assign(row,input);return copy(row);},
  };
  const methods:Record<string,unknown>={...api};
  for(const [kind,rows] of [['Contact',contacts],['Template',templates],['Signature',signatures],['TemplateBlock',templates.flatMap(row=>row.blocks)]] as const) {
    const current=()=>kind==='TemplateBlock'?templates.flatMap(row=>row.blocks):rows;
    for(const action of ['activate','deactivate'])methods[`${action}Outbound${kind}`]=async(id:number)=>{const row=current().find(row=>row.id===id);if(!row)throw new Error('Mock 记录不存在');row.status=action==='activate'?'active':'inactive';return copy(row);};
    methods[`deleteOutbound${kind}`]=async(id:number)=>{if(kind==='Template'&&templates.find(row=>row.id===id)?.blocks.length)throw new Error('模板仍被附加段落引用，不能删除');if(kind==='TemplateBlock'){for(const template of templates){template.blocks=template.blocks.filter(row=>row.id!==id);}}else{const index=rows.findIndex(row=>row.id===id);if(index>=0)rows.splice(index,1);}return {deleted:true};};
  }
  return new Proxy(methods,{get(target,key){if(key in target)return target[String(key)];return async()=>{throw new Error(`外发 Mock 未实现 ${String(key)}，禁止真实服务回退`);};}}) as unknown as PlannerApi;
}
