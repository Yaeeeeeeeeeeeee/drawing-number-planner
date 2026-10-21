import { createHash } from 'node:crypto';
import type { PlannerDatabase } from '../../db/database.js';
import { resolveCanonicalProductId } from '../products/appearance-identity.js';

export interface DrawingAssociationTarget { signedId: number; productId: number; appearanceVersionId: number }
export interface DrawingAssociationDiagnosis { signedId: number; fullCode: string; state: 'associated' | 'ready' | 'missing-product' | 'missing-version' | 'ambiguous' | 'conflict'; evidence: string[]; targets: DrawingAssociationTarget[]; untouched: boolean; automaticEligible:boolean }
export class DrawingAssociationError extends Error { constructor(public readonly code: string, message: string) { super(message); } }

/** Scan product/directory fields provide candidates only. Automatic attribution needs independent explicit business evidence. */
export class DrawingAssociationService {
  constructor(private readonly db: PlannerDatabase) {}
  preview(productId?: number, signedIds?: number[]) {
    const rows = this.db.prepare(`select -id as signedId, full_code as fullCode, product_id as productId,
      detected_sku as detectedSku, detected_model as detectedModel, appearance_code as appearanceCode, color_code as colorCode
      from historical_drawing_numbers where deleted_at is null
      union all select id, full_code, product_id, null, null, appearance_code, color_code from drawing_numbers where deleted_at is null`).all() as Array<{signedId:number;fullCode:string;productId:number|null;detectedSku:string|null;detectedModel:string|null;appearanceCode:string;colorCode:string}>;
    const records: DrawingAssociationDiagnosis[] = rows.filter(row => !signedIds || signedIds.includes(row.signedId)).map(row => {
      const origin = row.signedId > 0 ? 'planned' : 'historical';
      const binding = this.db.prepare('select * from drawing_appearance_bindings where origin=? and record_id=?').get(origin, Math.abs(row.signedId)) as {product_id:number;appearance_version_id:number}|undefined;
      const evidence: string[] = [];
      let candidates: number[] = [];
      if (binding) { candidates=[resolveCanonicalProductId(this.db,binding.product_id)];evidence.push(`已确认产品 ID ${binding.product_id} / 外观版本 ID ${binding.appearance_version_id}`); }
      else if (row.productId !== null) { candidates = [resolveCanonicalProductId(this.db,row.productId)]; evidence.push(`原记录产品 ID ${row.productId}`); }
      else if (row.detectedSku && row.detectedModel) {
        candidates = [...new Set((this.db.prepare(`select id from products where lower(sku)=lower(?) and model=? and deleted_at is null`).all(row.detectedSku,row.detectedModel) as Array<{id:number}>).map(p=>resolveCanonicalProductId(this.db,p.id)))];
        if (candidates.length) evidence.push(`原始目录 SKU ${row.detectedSku} 与型号 ${row.detectedModel} 精确一致`);
      }
      if(origin==='historical'&&!binding)evidence.push('扫描目录推导的产品及 SKU/型号只作为候选，不构成自动归属依据');
      const businessTargets=(this.db.prepare(`select distinct version.product_id,version.appearance_version_id
        from bom_items item join bom_versions version on version.id=item.bom_version_id
        where item.deleted_at is null and version.deleted_at is null and version.appearance_version_id is not null
          and ${origin==='historical'?'item.historical_drawing_id':'item.drawing_id'}=?`).all(Math.abs(row.signedId)) as Array<{product_id:number;appearance_version_id:number}>).map(fact=>({signedId:row.signedId,productId:resolveCanonicalProductId(this.db,fact.product_id),appearanceVersionId:fact.appearance_version_id}));
      if(!candidates.length&&businessTargets.length)candidates=[...new Set(businessTargets.map(target=>target.productId))];
      if(businessTargets.length)evidence.push('已有明确图号 ID 与外观版本的 BOM 实际使用关系');
      const colorKnown=Boolean(this.db.prepare("select id from dictionary_items where type='color' and code=?").get(row.colorCode));
      if(colorKnown)evidence.push(`图号原颜色编码 ${row.colorCode} 有字典依据`);
      const targets = binding ? [{signedId:row.signedId,productId:resolveCanonicalProductId(this.db,binding.product_id),appearanceVersionId:binding.appearance_version_id}] : candidates.flatMap(id => (this.db.prepare(`select version.id from product_appearance_versions version join dictionary_items appearance on appearance.id=version.appearance_id where version.product_id=? and appearance.code=?`).all(id,row.appearanceCode) as Array<{id:number}>).map(v=>({signedId:row.signedId,productId:id,appearanceVersionId:v.id})));
      if (targets.length) evidence.push(`图号原外观编码 ${row.appearanceCode} 精确一致`);
      const untouched=row.productId===null&&!binding;
      const businessConflict=!binding&&businessTargets.length>0&&(targets.length!==1||businessTargets.some(fact=>fact.productId!==targets[0].productId||fact.appearanceVersionId!==targets[0].appearanceVersionId));
      if(businessConflict)evidence.push('已有业务使用跨多个身份或版本，不能据此自动选择原始归属；请人工核验');
      const automaticEligible=untouched&&targets.length===1&&businessTargets.length>0&&!businessConflict;
      return {signedId:row.signedId,fullCode:row.fullCode,state: binding ? 'associated' : !colorKnown || businessConflict ? 'conflict' : !candidates.length ? 'missing-product' : !targets.length ? 'missing-version' : targets.length===1 ? 'ready' : 'ambiguous', evidence,targets,untouched,automaticEligible};
    });
    const filtered = productId === undefined ? records : records.filter(r=>r.targets.some(t=>t.productId===resolveCanonicalProductId(this.db,productId)));
    return { records:filtered, fingerprint:this.fingerprint(filtered) };
  }
  private fingerprint(records: DrawingAssociationDiagnosis[]) {
    const state = this.db.prepare('select * from product_identity_state order by product_id').all();
    const versions = this.db.prepare('select * from product_appearance_versions order by id').all();
    const bindings = this.db.prepare('select * from drawing_appearance_bindings order by origin,record_id').all();
    const sourceRecords={planned:this.db.prepare('select * from drawing_numbers order by id').all(),historical:this.db.prepare('select * from historical_drawing_numbers order by id').all()};
    const businessEvidence={versions:this.db.prepare('select * from bom_versions order by id').all(),items:this.db.prepare('select * from bom_items order by id').all()};
    return createHash('sha256').update(JSON.stringify({sourceRecords,state,versions,bindings,businessEvidence})).digest('hex');
  }
  confirm(input: { targets: DrawingAssociationTarget[]; fingerprint: string; reason: string; confirmed: true }) {
    return this.db.transaction(()=>{
      const preview = this.preview(undefined,input.targets.map(t=>t.signedId));
      if (preview.fingerprint!==input.fingerprint) throw new DrawingAssociationError('ASSOCIATION_STALE','关联依据已变化，请重新预览');
      for (const target of input.targets) {
        const row=preview.records.find(r=>r.signedId===target.signedId);
        if (!row || row.state!=='ready' || !row.targets.some(t=>t.productId===target.productId&&t.appearanceVersionId===target.appearanceVersionId)) throw new DrawingAssociationError('ASSOCIATION_AMBIGUOUS','关联目标不唯一，请逐条人工纠正');
        this.write(target,input.reason,row.evidence);
      }
      return {updated:input.targets.length};
    }).immediate();
  }
  correct(target: DrawingAssociationTarget, reason: string) { return this.db.transaction(()=>{ this.write(target,reason,['人工明确确认产品和外观版本']); return {updated:1}; }).immediate(); }
  private write(target: DrawingAssociationTarget, reason: string, evidence: string[]) {
    if (!reason.trim()) throw new DrawingAssociationError('REASON_REQUIRED','请输入关联修正原因');
    const canonical=resolveCanonicalProductId(this.db,target.productId);
    const version=this.db.prepare('select version.id from product_appearance_versions version join products product on product.id=version.product_id where version.id=? and version.product_id=? and product.deleted_at is null').get(target.appearanceVersionId,canonical);
    const origin=target.signedId>0?'planned':'historical', id=Math.abs(target.signedId), table=target.signedId>0?'drawing_numbers':'historical_drawing_numbers';
    const row=this.db.prepare(`select product_id from ${table} where id=? and deleted_at is null`).get(id) as {product_id:number|null}|undefined;
    if (!version||!row) throw new DrawingAssociationError('INVALID_ASSOCIATION','图号、产品或外观版本不存在');
    const previous=this.db.prepare('select product_id,appearance_version_id from drawing_appearance_bindings where origin=? and record_id=?').get(origin,id) as {product_id:number;appearance_version_id:number}|undefined;
    if(previous&&(previous.appearance_version_id!==target.appearanceVersionId||resolveCanonicalProductId(this.db,previous.product_id)!==canonical)&&this.db.prepare('select 1 from drawing_appearance_usages where origin=? and record_id=?').get(origin,id))throw new DrawingAssociationError('INVALID_ASSOCIATION','该图号已有明确外观沿用关系，不能改写原始归属');
    const now=new Date().toISOString();
    this.db.prepare(`insert into drawing_association_audit(origin,record_id,previous_product_id,previous_appearance_version_id,product_id,appearance_version_id,evidence_json,reason,created_at) values(?,?,?,?,?,?,?,?,?)`).run(origin,id,previous?.product_id??row.product_id,previous?.appearance_version_id??null,canonical,target.appearanceVersionId,JSON.stringify(evidence),reason.trim(),now);
    this.db.prepare(`insert into drawing_appearance_bindings(origin,record_id,product_id,appearance_version_id,source,revision,updated_at) values(?,?,?,?,?,1,?) on conflict(origin,record_id) do update set product_id=excluded.product_id,appearance_version_id=excluded.appearance_version_id,source=excluded.source,revision=revision+1,updated_at=excluded.updated_at`).run(origin,id,canonical,target.appearanceVersionId,'confirmed',now);
    // Historical foreign keys and encoded occupation remain immutable; the explicit binding is the correction.
  }
  diagnoseProduct(productId:number, options:{autoApply:boolean}) {
    if(!options.autoApply)return this.preview(productId);
    return this.db.transaction(()=>{
      const preview=this.preview(productId);
      for(const row of preview.records) if(row.state==='ready'&&row.untouched&&row.automaticEligible) this.write(row.targets[0],'独立明确 BOM 身份及版本依据的唯一关联',row.evidence);
      return preview;
    }).immediate();
  }
  history(signedId:number) { return this.db.prepare('select * from drawing_association_audit where origin=? and record_id=? order by id desc').all(signedId>0?'planned':'historical',Math.abs(signedId)); }
}
