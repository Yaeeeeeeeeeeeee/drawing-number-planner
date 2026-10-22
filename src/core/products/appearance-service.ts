import { createHash } from 'node:crypto';
import { drawingAppearanceRelationsSql } from '../drawings/drawing-appearance-scope.js';
import type { PlannerDatabase } from '../../db/database.js';
import { ensureProductIdentity, listRawProductIds, resolveCanonicalProductId } from './appearance-identity.js';
import type { AppearanceResources, AppearanceVersion, AppearanceDraftInput, AppearanceDraftUpdate, AppearanceActivationInput, AppearanceList, ProductMergeInput, ProductMergePreview, ProductMergeConfirm } from './appearance-types.js';
export class AppearanceError extends Error { constructor(public readonly code: 'NOT_FOUND'|'INVALID_INPUT'|'STALE_REVISION'|'MERGE_BLOCKED', message:string){super(message);} }
const select = `select id,product_id as productId,version_number as versionNumber,appearance_id as appearanceId,label,status,predecessor_id as predecessorId,revision,created_at as createdAt,activated_at as activatedAt from product_appearance_versions`;
export class AppearanceService {
 constructor(private readonly db:PlannerDatabase){}
 list(productId:number):AppearanceList {
  const canonical=this.identity(productId);
  return {productId:canonical,revision:this.revision(canonical),items:(this.db.prepare(`${select} where product_id=? order by version_number`).all(canonical) as AppearanceVersion[]).map(row=>({...row,colorIds:this.colors(row.id)}))};
 }
 get(id:number):AppearanceVersion { const row=this.db.prepare(`${select} where id=?`).get(id) as AppearanceVersion|undefined; if(!row)throw new AppearanceError('NOT_FOUND','外观版本不存在');return {...row,colorIds:this.colors(row.id)}; }
 createDraft(productId:number,input:AppearanceDraftInput):AppearanceVersion {
  return this.db.transaction(()=>{const canonical=this.identity(productId);this.validate(input,canonical);
   const id=Number(this.db.prepare(`insert into product_appearance_versions(product_id,version_number,appearance_id,label,status,predecessor_id,created_at) select ?,coalesce(max(version_number),0)+1,?,?,'draft',?,? from product_appearance_versions where product_id=?`).run(canonical,input.appearanceId??null,input.label.trim(),input.predecessorId??null,new Date().toISOString(),canonical).lastInsertRowid);
   this.setColors(id,input.colorIds??[]);this.bump(canonical);return this.get(id);
  })();
 }
 updateDraft(id:number,input:AppearanceDraftUpdate):AppearanceVersion {return this.db.transaction(()=>{const old=this.get(id);if(old.status!=='draft')throw new AppearanceError('INVALID_INPUT','只有草稿可以编辑');this.validate(input,old.productId);
  if(this.db.prepare(`update product_appearance_versions set appearance_id=?,label=?,predecessor_id=?,revision=revision+1 where id=? and revision=?`).run(input.appearanceId??null,input.label.trim(),input.predecessorId??null,id,input.expectedRevision).changes!==1)throw new AppearanceError('STALE_REVISION','外观草稿已变化');if(input.colorIds!==undefined)this.setColors(id,input.colorIds);this.bump(old.productId);return this.get(id);
 })();}
 activate(id:number,input:AppearanceActivationInput):AppearanceVersion {return this.db.transaction(()=>{const old=this.get(id);if(old.revision!==input.expectedRevision||this.revision(old.productId)!==input.expectedIdentityRevision)throw new AppearanceError('STALE_REVISION','外观资料已变化，请重新预览');
  this.validate({label:old.label,appearanceId:old.appearanceId,colorIds:old.colorIds},old.productId);
  const pointer=this.db.prepare('select bom_version_id from appearance_bom_current where appearance_version_id=?').get(id) as {bom_version_id:number}|undefined;
  if(pointer&&!this.db.prepare(`select 1 from bom_versions b join product_identity_members m on m.raw_product_id=b.product_id where b.id=? and b.appearance_version_id=? and b.deleted_at is null and m.canonical_product_id=?`).get(pointer.bom_version_id,id,old.productId))throw new AppearanceError('INVALID_INPUT','当前BOM与外观归属不一致');
  const members=listRawProductIds(this.db,old.productId);
  this.db.prepare(`delete from bom_current where product_id in (${members.map(()=>'?').join(',')})`).run(...members);
  if(pointer){const raw=this.db.prepare('select product_id from bom_versions where id=?').get(pointer.bom_version_id) as {product_id:number};
   // Legacy pointer remains raw-product scoped; it cannot point a primary raw ID to an alias BOM.
   this.db.prepare(`insert into bom_current(product_id,version_id,updated_at) values(?,?,?) on conflict(product_id) do update set version_id=excluded.version_id,updated_at=excluded.updated_at`).run(raw.product_id,pointer.bom_version_id,new Date().toISOString());}
  this.db.prepare(`update product_appearance_versions set status='historical' ,revision=revision+1 where product_id=? and status='current' and id<>?`).run(old.productId,id);
  this.db.prepare(`update product_appearance_versions set status='current',activated_at=?,revision=revision+1 where id=?`).run(new Date().toISOString(),id);this.bump(old.productId);return this.get(id);
 })();}
 mergePreview(input:ProductMergeInput):ProductMergePreview {
  const primary=this.identity(input.primaryProductId);const aliases=[...new Set(input.aliasProductIds)].sort((a,b)=>a-b);const blockers:string[]=[];
  if(primary!==input.primaryProductId||!aliases.length||aliases.includes(primary))blockers.push('请选择规范主产品和不同的原始别名产品');
  for(const id of aliases){if(this.identity(id)!==id)blockers.push(`产品${id}已经归并`);}
  const groups=[...new Set([primary,...aliases.map(id=>resolveCanonicalProductId(this.db,id))])];
  const ids=[...new Set(groups.flatMap(id=>listRawProductIds(this.db,id)))].sort((a,b)=>a-b);const marks=ids.map(()=>'?').join(',');
  const references=['drawing_numbers','historical_drawing_numbers','bom_versions','product_qr_codes','material_batches','outbound_packages','drawing_appearance_usages','drawing_appearance_usage_audit'].map(table=>({table,ids:(this.db.prepare(`select id from ${table} where product_id in (${marks}) order by id`).all(...ids) as {id:number}[]).map(r=>r.id)}));
  const pdfIds=(this.db.prepare(`select id from pdf_files where drawing_id in(select id from drawing_numbers where product_id in (${marks})) or historical_drawing_id in(select id from historical_drawing_numbers where product_id in (${marks})) or material_batch_id in(select id from material_batches where product_id in (${marks})) order by id`).all(...ids,...ids,...ids) as {id:number}[]).map(row=>row.id);
  references.push({table:'pdf_files',ids:pdfIds});
  references.push({table:'occupancy',ids:references.filter(ref=>['drawing_numbers','historical_drawing_numbers'].includes(ref.table)).flatMap(ref=>ref.ids)});
  const versions=groups.flatMap(id=>this.list(id).items);
  const qrRows=this.db.prepare(`select purpose_id,id from product_qr_codes where product_id in (${marks}) and deleted_at is null and (target_url is not null or status='active') order by id`).all(...ids) as {purpose_id:number;id:number}[];
  const grouped=new Map<number,number[]>();for(const r of qrRows)grouped.set(r.purpose_id,[...(grouped.get(r.purpose_id)??[]),r.id]);
  const qrConflicts=[...grouped].filter(([,v])=>v.length>1).map(([purposeId,qrCodeIds])=>({purposeId,qrCodeIds}));
  const revision=this.revision(primary);const raw=ids.map(id=>this.db.prepare('select * from products where id=?').get(id));
  // Conservative snapshot of every persisted business row detects child BOM/PDF/QR and occupancy changes.
  const tables=(this.db.prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name").all() as {name:string}[]).map(row=>row.name);
  const rows=tables.map(table=>({table,rows:this.db.prepare(`select * from "${table.replaceAll('"','""')}" order by rowid`).all()}));
  const fingerprint=createHash('sha256').update(JSON.stringify({raw,rows,versions,revision})).digest('hex');
  return {primaryProductId:primary,aliasProductIds:aliases,fingerprint,revision,references,versions,qrConflicts,blockers};
 }
 mergeConfirm(input:ProductMergeConfirm):ProductMergePreview {return this.db.transaction(()=>{
  if(input.confirmed!==true)throw new AppearanceError('INVALID_INPUT','请明确确认归并');const preview=this.mergePreview(input);
  if(preview.fingerprint!==input.expectedFingerprint||preview.revision!==input.expectedRevision)throw new AppearanceError('STALE_REVISION','归并影响范围已变化，请重新预览');
  if(preview.blockers.length)throw new AppearanceError('MERGE_BLOCKED',preview.blockers.join('；'));
  const protectedTables=['products','drawing_numbers','historical_drawing_numbers','material_batches','pdf_files','bom_versions','bom_items','bom_current','bom_assets','bom_item_assets','bom_item_qr_codes','product_qr_codes','qr_code_files','outbound_packages','outbound_package_items','outbound_package_parts','outbound_email_drafts','drawing_deletion_events','qr_manual_files','qr_manual_links','qr_manual_audit','outbound_batch_scopes','outbound_batch_scope_audit','outbound_v2_snapshots','drawing_appearance_usage_audit'];
  const preserved=protectedTables.map(table=>({table,rows:JSON.stringify(this.db.prepare(`select * from ${table} order by rowid`).all())}));
  const now=new Date().toISOString();const primary=input.primaryProductId;let next=(this.db.prepare('select max(version_number) as n from product_appearance_versions where product_id=?').get(primary) as {n:number}).n;
  for(const alias of preview.aliasProductIds){
   // Preserve all raw business FKs. Only explicit identity/version metadata is moved.
   this.db.prepare('update product_identity_members set canonical_product_id=?,merged_at=? where canonical_product_id=?').run(primary,now,alias);
   const versions=this.db.prepare('select id from product_appearance_versions where product_id=? order by version_number').all(alias) as {id:number}[];
   for(const version of versions)this.db.prepare(`update product_appearance_versions set product_id=?,version_number=?,status=case when status='current' then 'historical' else status end,revision=revision+1 where id=?`).run(primary,++next,version.id);
  }
  this.db.prepare(`update drawing_appearance_bindings set product_id=?,revision=revision+1,updated_at=? where appearance_version_id in(select id from product_appearance_versions where product_id=?) and product_id<>?`).run(primary,now,primary,primary);
  this.db.prepare(`update drawing_appearance_usages set product_id=? where appearance_version_id in(select id from product_appearance_versions where product_id=?) and product_id<>?`).run(primary,primary,primary);
  this.bump(primary);this.db.prepare('insert into product_merge_events(canonical_product_id,fingerprint,before_json,after_json,created_at) values(?,?,?,?,?)').run(primary,preview.fingerprint,JSON.stringify(preview),JSON.stringify({rawProductIds:listRawProductIds(this.db,primary)}),now);
  for(const {table,rows} of preserved)if(JSON.stringify(this.db.prepare(`select * from ${table} order by rowid`).all())!==rows)throw new AppearanceError('MERGE_BLOCKED','归并会改变原始业务记录，已全部回滚');
  if((this.db.pragma('foreign_key_check') as unknown[]).length)throw new AppearanceError('MERGE_BLOCKED','归并关联校验失败，已全部回滚');
  return {...this.mergePreview({primaryProductId:primary,aliasProductIds:[]}),aliasProductIds:preview.aliasProductIds,blockers:[]};
 })();}
 resources(id:number):AppearanceResources {
  const version=this.get(id),rawIds=listRawProductIds(this.db,version.productId),marks=rawIds.map(()=>'?').join(',');
  const count=(sql:string,...args:unknown[]) => (this.db.prepare(sql).get(...args) as {n:number}).n;
  const source=`coalesce((select primaryBinding.source from drawing_appearance_bindings primaryBinding where primaryBinding.origin=b.origin and primaryBinding.record_id=b.record_id and primaryBinding.appearance_version_id=b.appearance_version_id),case when exists(select 1 from drawing_appearance_usages usage where usage.origin=b.origin and usage.record_id=b.record_id and usage.appearance_version_id=b.appearance_version_id) then 'explicit-reuse' else 'bom-usage' end)`;
  const drawings=this.db.prepare(`select distinct d.id,'planned' as origin,d.full_code as fullCode,${source} as source from drawing_numbers d join ${drawingAppearanceRelationsSql} b on b.origin='planned' and b.record_id=d.id where b.appearance_version_id=? union all select distinct d.id,'historical',d.full_code,${source} from historical_drawing_numbers d join ${drawingAppearanceRelationsSql} b on b.origin='historical' and b.record_id=d.id where b.appearance_version_id=?`).all(id,id) as AppearanceResources['drawings'];
  const pdfs=this.db.prepare(`select distinct f.id,f.file_name as fileName,f.relative_path as relativePath,'drawing-association' as source from pdf_files f join ${drawingAppearanceRelationsSql} b on (b.origin='planned' and b.record_id=f.drawing_id) or (b.origin='historical' and b.record_id=f.historical_drawing_id) where b.appearance_version_id=?`).all(id) as AppearanceResources['pdfs'];
  const qrCodes=this.db.prepare(`select id,name,target_url as targetUrl,status,appearance_version_id as appearanceVersionId from product_qr_codes where (appearance_version_id=? or (appearance_version_id is null and product_id in (${marks}))) and deleted_at is null order by id`).all(id,...rawIds) as AppearanceResources['qrCodes'];
  const outboundAppearance=`coalesce(json_extract(snapshot.context_json,'$.request.appearanceVersionId'),json_extract(snapshot.context_json,'$.appearance.id'),json_extract(package.product_identity_json,'$.appearanceContext.appearanceVersionId'),json_extract(package.product_identity_json,'$.appearance.id'))`;
  const outboundPackages=this.db.prepare(`select package.id,package.package_name as packageName,package.created_at as createdAt from outbound_packages package left join outbound_v2_snapshots snapshot on snapshot.package_id=package.id where package.product_id in (${marks}) and ${outboundAppearance}=? order by package.id`).all(...rawIds,id) as AppearanceResources['outboundPackages'];
  return {appearanceVersionId:id,colorIds:version.colorIds,drawings,pdfs,qrCodes,outboundPackages,unboundCounts:{
   drawings:count(`select (select count(*) from drawing_numbers d where product_id in (${marks}) and not exists(select 1 from ${drawingAppearanceRelationsSql} b where b.origin='planned' and b.record_id=d.id))+(select count(*) from historical_drawing_numbers d where product_id in (${marks}) and not exists(select 1 from ${drawingAppearanceRelationsSql} b where b.origin='historical' and b.record_id=d.id)) as n`,...rawIds,...rawIds),
   pdfs:count(`select count(*) as n from pdf_files f where (f.drawing_id in(select id from drawing_numbers where product_id in (${marks})) or f.historical_drawing_id in(select id from historical_drawing_numbers where product_id in (${marks})) or f.material_batch_id in(select id from material_batches where product_id in (${marks}))) and not exists(select 1 from ${drawingAppearanceRelationsSql} b where (b.origin='planned' and b.record_id=f.drawing_id) or (b.origin='historical' and b.record_id=f.historical_drawing_id))`,...rawIds,...rawIds,...rawIds),
   qrCodes:0,
   boms:count(`select count(*) as n from bom_versions where product_id in (${marks}) and appearance_version_id is null and deleted_at is null`,...rawIds),
   outboundPackages:count(`select count(*) as n from outbound_packages package left join outbound_v2_snapshots snapshot on snapshot.package_id=package.id where package.product_id in (${marks}) and ${outboundAppearance} is null`,...rawIds)
  }};
 }
 private colors(id:number):number[]{return (this.db.prepare('select color_id from product_appearance_colors where appearance_version_id=? order by color_id').all(id) as {color_id:number}[]).map(row=>row.color_id);}
 private setColors(id:number,ids:number[]):void{this.db.prepare('delete from product_appearance_colors where appearance_version_id=?').run(id);for(const color of [...new Set(ids)].sort((a,b)=>a-b))this.db.prepare('insert into product_appearance_colors(appearance_version_id,color_id) values(?,?)').run(id,color);}
 private identity(id:number):number {if(!this.db.prepare('select 1 from products where id=? and deleted_at is null').get(id))throw new AppearanceError('NOT_FOUND','产品不存在');const canonical=resolveCanonicalProductId(this.db,id);ensureProductIdentity(this.db,canonical);return canonical;}
 private revision(id:number):number{return (this.db.prepare('select revision from product_identity_state where product_id=?').get(id) as {revision:number}).revision;}
 private bump(id:number){this.db.prepare('update product_identity_state set revision=revision+1 where product_id=?').run(id);}
 private validate(input:AppearanceDraftInput,productId:number){if(input.colorIds!==undefined&&(!Array.isArray(input.colorIds)||input.colorIds.some(color=>!Number.isSafeInteger(color)||color<=0||!this.db.prepare("select 1 from dictionary_items where id=? and type='color' and status='active' and deleted_at is null").get(color))))throw new AppearanceError('INVALID_INPUT','颜色配置引用了无效或已停用的颜色');if(!input.label?.trim())throw new AppearanceError('INVALID_INPUT','请填写外观名称');if(input.appearanceId!=null&&!this.db.prepare("select 1 from dictionary_items where id=? and type='appearance' and status='active' and deleted_at is null").get(input.appearanceId))throw new AppearanceError('INVALID_INPUT','外观编码无效');if(input.predecessorId!=null&&this.get(input.predecessorId).productId!==productId)throw new AppearanceError('INVALID_INPUT','前序外观不属于该产品');}
}
