import { pdfDirectoryProductSql } from '../files/pdf-product-context.js';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import type { PlannerDatabase } from '../../db/database.js';
import {createDatabaseBackup} from '../../db/backup.js';
import { resolveCanonicalProductId } from '../products/appearance-identity.js';
import {effectiveDrawingProductSql,getDrawingProductEvidence} from './drawing-product-evidence.js';

export interface DrawingAssociationTarget { signedId: number; productId: number; appearanceVersionId?: number|null }
export interface DrawingAssociationDiagnosis { signedId: number; fullCode: string; state: 'associated' | 'ready' | 'missing-product' | 'missing-version' | 'ambiguous' | 'conflict'; evidence: string[]; targets: DrawingAssociationTarget[]; untouched: boolean; automaticEligible:boolean }
export class DrawingAssociationError extends Error { constructor(public readonly code: string, message: string) { super(message); } }

/** Directory recognition is a suggestion. Confirmed product identity and occupation are independent. */
export class DrawingAssociationService {
  constructor(private readonly db: PlannerDatabase) {}
  preview(productId?: number, signedIds?: number[]) {
    const rows=this.db.prepare(`select -id as signedId,full_code as fullCode,product_id as productId,detected_sku as detectedSku,detected_model as detectedModel,
      appearance_code as appearanceCode,color_code as colorCode from historical_drawing_numbers where deleted_at is null
      union all select id,full_code,product_id,null,null,appearance_code,color_code from drawing_numbers where deleted_at is null`).all() as Array<{signedId:number;fullCode:string;productId:number|null;detectedSku:string|null;detectedModel:string|null;appearanceCode:string;colorCode:string}>;
    const records:DrawingAssociationDiagnosis[]=rows.filter(row=>!signedIds||signedIds.includes(row.signedId)).map(row=>{
      const origin=row.signedId>0?'planned':'historical';
      const binding=this.db.prepare('select product_id,appearance_version_id from drawing_appearance_bindings where origin=? and record_id=?').get(origin,Math.abs(row.signedId)) as {product_id:number;appearance_version_id:number|null}|undefined;
      const facts=getDrawingProductEvidence(this.db,origin,Math.abs(row.signedId));
      const trustworthyProducts=[...new Set(facts.map(fact=>fact.productId))];
      const evidence:string[]=facts.map(fact=>`${fact.source}: 产品 ID ${fact.productId}${fact.appearanceVersionId===null?'':`，原外观版本 ID ${fact.appearanceVersionId}`}`);
      let candidates=trustworthyProducts;
      if(!candidates.length&&row.productId!==null){candidates=[resolveCanonicalProductId(this.db,row.productId)];evidence.push(`原扫描产品 ID ${row.productId} 仅为候选`);}
      if(!candidates.length&&row.detectedSku&&row.detectedModel){
        candidates=[...new Set((this.db.prepare('select id from products where lower(sku)=lower(?) and model=? and deleted_at is null').all(row.detectedSku,row.detectedModel) as Array<{id:number}>).map(product=>resolveCanonicalProductId(this.db,product.id)))];
        if(candidates.length)evidence.push(`目录 SKU ${row.detectedSku} / 型号 ${row.detectedModel} 精确候选，尚未归类`);
      }
      if(!trustworthyProducts.length&&!binding){
        const directoryProducts=this.db.prepare(`select distinct ${pdfDirectoryProductSql} as productId from pdf_files file
          where ${origin==='planned'?'file.drawing_id':'file.historical_drawing_id'}=? and file.management_state='included'`).all(Math.abs(row.signedId)) as Array<{productId:number|null}>;
        const directoryIds=directoryProducts.flatMap(product=>product.productId===null?[]:[product.productId]);
        if(directoryIds.length){
          candidates=[...new Set([...candidates,...directoryIds])];
          evidence.push('关联 PDF 的完整 SKU-型号目录精确对应产品档案');
        }
      }
      candidates=candidates.filter(id=>Boolean(this.db.prepare('select id from products where id=? and deleted_at is null').get(id)));
      if(origin==='historical'&&!binding)evidence.push('扫描信息为归类候选；唯一产品可直接归类，多产品歧义保留待处理');
      const knownColor=Boolean(this.db.prepare("select id from dictionary_items where type='color' and code=?").get(row.colorCode));
      const knownAppearance=Boolean(this.db.prepare("select id from dictionary_items where type='appearance' and code=?").get(row.appearanceCode));
      if(!knownColor||!knownAppearance)evidence.push('图号外观或颜色编码尚缺少字典依据，请人工核验');
      const conflictingProducts=trustworthyProducts.length>1;
      if(conflictingProducts)evidence.push('独立业务依据指向多个产品，必须人工核验；未自动覆盖任何已有归属');
      const targets:DrawingAssociationTarget[]=binding?[{signedId:row.signedId,productId:resolveCanonicalProductId(this.db,binding.product_id),appearanceVersionId:binding.appearance_version_id}]:candidates.map(id=>({signedId:row.signedId,productId:id,appearanceVersionId:null}));
      const untouched=!binding;
      return {signedId:row.signedId,fullCode:row.fullCode,state:conflictingProducts?'conflict':binding?'associated':!candidates.length?'missing-product':candidates.length>1?'ambiguous':!knownColor||!knownAppearance?'conflict':'ready',evidence,targets,untouched,
        automaticEligible:!binding&&!conflictingProducts&&trustworthyProducts.length===1&&knownColor&&knownAppearance};
    });
    const filtered=productId===undefined?records:records.filter(record=>record.targets.some(target=>target.productId===resolveCanonicalProductId(this.db,productId)));
    return {records:filtered,fingerprint:this.fingerprint(),summary:this.summary(records)};
  }
  private summary(records:DrawingAssociationDiagnosis[]){
    const effective=this.db.prepare(`select ${effectiveDrawingProductSql('identity.origin','identity.id')} as productId from (select ? as origin,? as id) identity`);
    const associated=new Set(records.filter(row=>(effective.get(row.signedId>0?'planned':'historical',Math.abs(row.signedId)) as {productId:number|null}).productId!==null).map(row=>row.signedId));
    return {historicalTotal:records.filter(row=>row.signedId<0).length,historicalAssociated:records.filter(row=>row.signedId<0&&associated.has(row.signedId)).length,
      historicalConfirmedBindings:records.filter(row=>row.signedId<0&&!row.untouched).length,
      plannedTotal:records.filter(row=>row.signedId>0).length,plannedAssociated:records.filter(row=>row.signedId>0&&associated.has(row.signedId)).length,
      plannedConfirmedBindings:records.filter(row=>row.signedId>0&&!row.untouched).length,
      ready:records.filter(row=>row.state==='ready').length,automaticReady:records.filter(row=>row.state==='ready'&&row.automaticEligible).length,
      ambiguous:records.filter(row=>row.state==='ambiguous').length,conflicts:records.filter(row=>row.state==='conflict').length,missingProduct:records.filter(row=>row.state==='missing-product').length};
  }
  private fingerprint(){
    const tables=['products','dictionary_items','product_identity_members','product_identity_state','product_appearance_versions','drawing_appearance_bindings','drawing_numbers','historical_drawing_numbers','bom_versions','bom_items','pdf_files','material_batches','outbound_batch_scopes','outbound_packages','outbound_package_items'];
    return createHash('sha256').update(JSON.stringify(tables.map(table=>[table,this.db.prepare(`select * from ${table} order by rowid`).all()]))).digest('hex');
  }
  private backup(){
    if(this.db.name===':memory:'||this.db.name===''||this.db.inTransaction)return undefined;
    return createDatabaseBackup(this.db,this.db.name,join(dirname(this.db.name),'backups'),'restore');
  }
  confirm(input:{targets:DrawingAssociationTarget[];fingerprint:string;reason:string;confirmed:true}){
    if(input.confirmed!==true)throw new DrawingAssociationError('CONFIRMATION_REQUIRED','请确认预览结果后再修复');
    if(new Set(input.targets.map(target=>target.signedId)).size!==input.targets.length)throw new DrawingAssociationError('INVALID_ASSOCIATION','关联预览包含重复图号');
    const snapshot=this.preview();
    if(snapshot.fingerprint!==input.fingerprint)throw new DrawingAssociationError('ASSOCIATION_STALE','关联依据已变化，请重新预览');
    const backupPath=this.backup();
    return this.db.transaction(()=>{
      const preview=this.preview();
      if(preview.fingerprint!==input.fingerprint)throw new DrawingAssociationError('ASSOCIATION_STALE','关联依据已变化，请重新预览');
      for(const target of input.targets){
        const row=preview.records.find(record=>record.signedId===target.signedId);
        if(!row||row.state!=='ready'||!row.targets.some(candidate=>candidate.productId===target.productId&&(candidate.appearanceVersionId??null)===(target.appearanceVersionId??null)))throw new DrawingAssociationError('ASSOCIATION_AMBIGUOUS','关联目标不唯一，请逐条人工纠正');
        this.write(target,input.reason,row.evidence);
      }
      return {updated:input.targets.length,before:preview.summary,after:this.preview().summary,backupPath};
    }).immediate();
  }
  /** Explicit one-click classification authorized by the user. Never runs at startup. */
  classify(signedIds?: number[]) {
    const backupPath=this.backup();
    return this.db.transaction(()=>{
      const preview=this.preview(undefined,signedIds);
      const ready=preview.records.filter(row=>row.state==='ready');
      for(const row of ready)this.write(row.targets[0],'用户一键归类：唯一产品候选',row.evidence);
      const after=this.preview(undefined,signedIds).summary;
      for(const row of ready){
        const saved=this.db.prepare('select product_id from drawing_appearance_bindings where origin=? and record_id=?').get(row.signedId>0?'planned':'historical',Math.abs(row.signedId)) as {product_id:number}|undefined;
        if(!saved||resolveCanonicalProductId(this.db,saved.product_id)!==row.targets[0].productId)
          throw new DrawingAssociationError('ASSOCIATION_SAVE_FAILED','图号归类保存校验失败，已回滚，请重新诊断');
      }
      return {updated:ready.length,before:preview.summary,after,backupPath};
    }).immediate();
  }
  correct(target:DrawingAssociationTarget,reason:string){return this.correctMany([target],reason);}
  correctMany(targets:DrawingAssociationTarget[],reason:string){
    if(!targets.length||new Set(targets.map(target=>target.signedId)).size!==targets.length)throw new DrawingAssociationError('INVALID_ASSOCIATION','请选择不重复的图号记录');
    const backupPath=this.backup();return this.db.transaction(()=>{const before=this.preview().summary;for(const target of targets)this.write(target,reason,['用户人工明确确认产品归属']);return {updated:targets.length,before,after:this.preview().summary,backupPath};}).immediate();
  }
  private write(target:DrawingAssociationTarget,reason:string,evidence:string[]){
    if(!reason.trim())throw new DrawingAssociationError('REASON_REQUIRED','请输入关联修正原因');
    const canonical=resolveCanonicalProductId(this.db,target.productId),versionId=target.appearanceVersionId??null;
    const product=this.db.prepare('select id from products where id=? and deleted_at is null').get(canonical);
    const version=versionId===null||this.db.prepare('select id from product_appearance_versions where id=? and product_id=?').get(versionId,canonical);
    const origin=target.signedId>0?'planned':'historical',id=Math.abs(target.signedId),table=target.signedId>0?'drawing_numbers':'historical_drawing_numbers';
    const row=this.db.prepare(`select product_id from ${table} where id=? and deleted_at is null`).get(id) as {product_id:number|null}|undefined;
    if(!product||!version||!row)throw new DrawingAssociationError('INVALID_ASSOCIATION','图号、产品或原外观版本不存在');
    const previous=this.db.prepare('select product_id,appearance_version_id from drawing_appearance_bindings where origin=? and record_id=?').get(origin,id) as {product_id:number;appearance_version_id:number|null}|undefined;
    if(previous&&(previous.appearance_version_id!==versionId||resolveCanonicalProductId(this.db,previous.product_id)!==canonical)&&this.db.prepare('select 1 from drawing_appearance_usages where origin=? and record_id=?').get(origin,id))throw new DrawingAssociationError('INVALID_ASSOCIATION','该图号已有明确外观沿用关系，不能改写原始归属');
    const now=new Date().toISOString();
    this.db.prepare('insert into drawing_association_audit(origin,record_id,previous_product_id,previous_appearance_version_id,product_id,appearance_version_id,evidence_json,reason,created_at) values(?,?,?,?,?,?,?,?,?)').run(origin,id,previous?.product_id??row.product_id,previous?.appearance_version_id??null,canonical,versionId,JSON.stringify(evidence),reason.trim(),now);
    this.db.prepare(`insert into drawing_appearance_bindings(origin,record_id,product_id,appearance_version_id,source,revision,updated_at) values(?,?,?,?,?,1,?) on conflict(origin,record_id) do update set product_id=excluded.product_id,appearance_version_id=excluded.appearance_version_id,source=excluded.source,revision=revision+1,updated_at=excluded.updated_at`).run(origin,id,canonical,versionId,'confirmed',now);
  }
  diagnoseProduct(productId:number,options:{autoApply:boolean}){
    if(!options.autoApply)return this.preview(productId);
    const preview=this.preview(productId);
    const targets=preview.records.filter(row=>row.state==='ready'&&row.automaticEligible).map(row=>row.targets[0]);
    if(targets.length)this.confirm({targets,fingerprint:preview.fingerprint,reason:'精确图号 ID 的独立业务依据唯一确认产品',confirmed:true});
    return preview;
  }
  history(signedId:number){return this.db.prepare('select * from drawing_association_audit where origin=? and record_id=? order by id desc').all(signedId>0?'planned':'historical',Math.abs(signedId));}
}
