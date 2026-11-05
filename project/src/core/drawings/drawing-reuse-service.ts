import {createHash} from 'node:crypto';
import type {PlannerDatabase} from '../../db/database.js';
import {resolveCanonicalProductId} from '../products/appearance-identity.js';
import {DrawingAssociationError,type DrawingAssociationTarget} from './drawing-association-service.js';
export type DrawingReuseInput=DrawingAssociationTarget&{reason:string};
export interface DrawingReusePreview extends DrawingReuseInput { fingerprint:string; fullCode:string; versionLabel:string }
export class DrawingReuseService {
 constructor(private readonly db:PlannerDatabase){}
 preview(input:DrawingReuseInput):DrawingReusePreview {
  const origin=input.signedId>0?'planned':'historical',id=Math.abs(input.signedId);
  if(!Number.isSafeInteger(input.signedId)||!id||!Number.isSafeInteger(input.appearanceVersionId)||!input.appearanceVersionId||!input.reason.trim())throw new DrawingAssociationError('INVALID_REUSE','请选择图号与目标外观并填写沿用原因');
  const record=this.db.prepare(`select * from ${origin==='planned'?'drawing_numbers':'historical_drawing_numbers'} where id=? and deleted_at is null`).get(id) as {product_id:number|null;full_code:string;status:string}|undefined;
  const binding=this.db.prepare('select * from drawing_appearance_bindings where origin=? and record_id=?').get(origin,id) as {product_id:number;appearance_version_id:number}|undefined;
  const productId=resolveCanonicalProductId(this.db,input.productId);
  const version=this.db.prepare(`select version.* from product_appearance_versions version join products product on product.id=version.product_id join dictionary_items appearance on appearance.id=version.appearance_id where version.id=? and version.product_id=? and product.deleted_at is null and product.status='active' and appearance.type='appearance' and appearance.status='active' and appearance.deleted_at is null`).get(input.appearanceVersionId,productId) as {label:string}|undefined;
  // Reuse requires confirmed attribution, and cannot invent permission to share across products.
  if(!record||!binding||!version||resolveCanonicalProductId(this.db,binding.product_id)!==productId||!['reserved','active'].includes(record.status))throw new DrawingAssociationError('INVALID_REUSE','仅可将已确认归属且有效占号的图号沿用到同一产品的有效外观版本');
  if(binding.appearance_version_id===input.appearanceVersionId)throw new DrawingAssociationError('INVALID_REUSE','该版本已是图号原始归属');
  const existing=this.db.prepare('select * from drawing_appearance_usages where origin=? and record_id=? and appearance_version_id=?').get(origin,id,input.appearanceVersionId);
  const normalized={...input,productId,reason:input.reason.trim()};
  return {...normalized,fullCode:record.full_code,versionLabel:version.label,fingerprint:createHash('sha256').update(JSON.stringify({normalized,record,binding,version,existing})).digest('hex')};
 }
 confirm(input:DrawingReuseInput&{fingerprint:string;confirmed:true}) {return this.db.transaction(()=>{
  if(input.confirmed!==true)throw new DrawingAssociationError('INVALID_REUSE','请明确确认沿用');
  const preview=this.preview({signedId:input.signedId,productId:input.productId,appearanceVersionId:input.appearanceVersionId,reason:input.reason});
  if(preview.fingerprint!==input.fingerprint)throw new DrawingAssociationError('ASSOCIATION_STALE','图号或外观依据已变化，请重新预览');
  const origin=input.signedId>0?'planned':'historical',id=Math.abs(input.signedId),now=new Date().toISOString();
  const result=this.db.prepare('insert or ignore into drawing_appearance_usages(origin,record_id,product_id,appearance_version_id,reason,created_at) values(?,?,?,?,?,?)').run(origin,id,preview.productId,input.appearanceVersionId,preview.reason,now);
  if(result.changes)this.db.prepare('insert into drawing_appearance_usage_audit(origin,record_id,product_id,appearance_version_id,reason,evidence_json,created_at) values(?,?,?,?,?,?,?)').run(origin,id,preview.productId,input.appearanceVersionId,preview.reason,JSON.stringify(preview),now);
  return {updated:result.changes};
 }).immediate();}
}
