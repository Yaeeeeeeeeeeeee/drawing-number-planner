import { createHash } from 'node:crypto';
import type { PlannerDatabase } from '../../db/database.js';
import { toWorkspacePathKey } from '../files/workspace-paths.js';
import type { DrawingForceReleaseInput, DrawingForceReleasePreview, DrawingForceReleaseReferences } from './drawing-force-release-types.js';

type Row = Record<string, any>;
export class DrawingForceReleaseError extends Error {
  constructor(public readonly code: 'DRAWING_NOT_FOUND'|'FORCE_CONFIRMATION_REQUIRED'|'FORCE_IMPACT_CHANGED'|'DRAWING_ALREADY_RELEASED', message:string) { super(message); }
}

// JSON history is matched by immutable identity. Code-only legacy facts are disclosed,
// but snapshots with a different explicit identity never become evidence for a new reservation.
export function referencesIdentity(value:unknown, origin:string, id:number, code:string):boolean {
  if (!value || typeof value!=='object') return false;
  if (Array.isArray(value)) return value.some(item=>referencesIdentity(item,origin,id,code));
  const row=value as Row;
  const ownId=origin==='planned'?row.drawingId??row.drawing_id:row.historicalDrawingId??row.historical_drawing_id;
  if (ownId===id) return true;
  if (row.origin===origin && (row.recordId===id || row.record_id===id)) return true;
  const hasIdentity=['drawingId','drawing_id','historicalDrawingId','historical_drawing_id','recordId','record_id'].some(key=>row[key]!=null);
  if (!hasIdentity && [row.fullCode,row.full_code,row.drawingCode,row.drawing_code_snapshot].includes(code)) return true;
  return Object.values(row).some(item=>referencesIdentity(item,origin,id,code));
}

export class DrawingForceReleaseService {
  constructor(private readonly db:PlannerDatabase) {}
  private collect(signedId:number) {
    const origin=signedId<0?'historical':'planned'; const id=Math.abs(signedId);
    const table=origin==='planned'?'drawing_numbers':'historical_drawing_numbers';
    const column=origin==='planned'?'drawing_id':'historical_drawing_id';
    const drawing=this.db.prepare(`select * from ${table} where id=?`).get(id) as Row|undefined;
    if(!drawing)throw new DrawingForceReleaseError('DRAWING_NOT_FOUND','图号记录不存在');
    if(this.db.prepare('select 1 from drawing_force_releases where origin=? and record_id=?').get(origin,id)
      || drawing.deletion_mode==='release')throw new DrawingForceReleaseError('DRAWING_ALREADY_RELEASED','图号已释放，不能重复操作');
    const code=String(drawing.deleted_full_code??drawing.full_code);
    const all=(sql:string,...args:any[])=>this.db.prepare(sql).all(...args) as Row[];
    const pdf=all(`select * from pdf_files where ${column}=? or (drawing_id is null and historical_drawing_id is null and exists(select 1 from json_each(detected_codes_json) where value=?) and not exists(select 1 from drawing_force_release_files q where q.path_key=lower(replace(pdf_files.relative_path,'/','\\')) and q.full_code=?)) order by id`,id,code,code);
    const bom=all(`select item.*, version.product_id as reference_product_id, version.deleted_at as version_deleted_at,
      exists(select 1 from bom_current c where c.version_id=version.id) as is_current
      from bom_items item join bom_versions version on version.id=item.bom_version_id where item.${column}=? order by item.id`,id);
    const previousReleases=all('select snapshot_json from drawing_force_releases where full_code=?',code).map(row=>JSON.parse(row.snapshot_json) as Row);
    const snapshotKey:Record<string,string>={bom_revision_snapshots:'bomSnapshots',outbound_v2_snapshots:'outboundSnapshots',product_merge_events:'merge'};
    const jsonRows=(table:string,columns:string[])=>all(`select * from ${table} order by 1`).filter(row=>{
      const previous=previousReleases.some(snapshot=>(table==='product_merge_events'?snapshot.audits?.merge:snapshot[snapshotKey[table]])?.some((old:Row)=>(old.id??old.package_id)===(row.id??row.package_id)));
      return !previous && columns.some(key=>referencesIdentity(JSON.parse(row[key]),origin,id,code));
    });
    const bomSnapshots=jsonRows('bom_revision_snapshots',['before_snapshot_json','after_snapshot_json']);
    const outbound=all(`select item.*, package.product_id as reference_product_id from outbound_package_items item join outbound_packages package on package.id=item.package_id where item.${column}=? order by item.id`,id);
    const outboundSnapshots=jsonRows('outbound_v2_snapshots',['files_json']);
    const packageIds=new Set([...outbound.map(row=>row.package_id),...outboundSnapshots.map(row=>row.package_id)]);
    const email=all('select * from outbound_email_drafts order by id').filter(row=>packageIds.has(row.package_id));
    const usages=all('select * from drawing_appearance_usages where origin=? and record_id=? order by id',origin,id);
    const bindings=all('select * from drawing_appearance_bindings where origin=? and record_id=?',origin,id);
    const lineage=origin==='planned'?all('select * from drawing_numbers where previous_drawing_id=? or source_drawing_id=? order by id',id,id):[];
    const audits={association:all('select * from drawing_association_audit where origin=? and record_id=? order by id',origin,id),
      usage:all('select * from drawing_appearance_usage_audit where origin=? and record_id=? order by id',origin,id),
      deletion:all('select * from drawing_deletion_events where origin=? and record_id=? order by id',origin,id),
      merge:jsonRows('product_merge_events',['before_json','after_json'])};
    const products=[...new Set([drawing.product_id,...bom.map(row=>row.reference_product_id),...outbound.map(row=>row.reference_product_id),...usages.map(row=>row.product_id),...bindings.map(row=>row.product_id)].filter((id):id is number=>typeof id==='number'))].sort((a,b)=>a-b);
    const references:DrawingForceReleaseReferences={drawingRecords:1,pdf:pdf.length,presentPdf:pdf.filter(row=>row.is_present).length,missingPdf:pdf.filter(row=>!row.is_present).length,
      currentBom:bom.filter(row=>row.is_current&&!row.deleted_at&&!row.version_deleted_at).length,
      historicalBom:bom.filter(row=>!row.is_current&&!row.deleted_at&&!row.version_deleted_at).length,
      deletedBom:bom.filter(row=>row.deleted_at||row.version_deleted_at).length,bomSnapshots:bomSnapshots.length,
      outboundItems:outbound.length,outboundSnapshots:outboundSnapshots.length,emailDrafts:email.length,
      appearanceUsages:usages.length,bindings:bindings.length,lineage:lineage.length,
      audits:Object.values(audits).reduce((sum,rows)=>sum+rows.length,0),products:products.length};
    const snapshot={drawing,pdf,bom,bomSnapshots,outbound,outboundSnapshots,email,usages,bindings,lineage,audits};
    const fingerprint=createHash('sha256').update(JSON.stringify({origin,id,snapshot})).digest('hex');
    return {preview:{signedId,origin,fullCode:code,fingerprint,references,affectedProductIds:products,affectedIdentities:[{signedId,origin}]} satisfies DrawingForceReleasePreview,snapshot,table,id,column};
  }
  private collectGroup(signedId:number) {
    const primary=this.collect(signedId);
    const peers=this.db.prepare(`select id as signedId from drawing_numbers where (deleted_at is null or deletion_mode='retain_occupied') and coalesce(deleted_full_code,full_code)=?
      union all select -id from historical_drawing_numbers where (deleted_at is null or deletion_mode='retain_occupied') and coalesce(deleted_full_code,full_code)=?`).all(primary.preview.fullCode,primary.preview.fullCode) as Array<{signedId:number}>;
    const group=[primary,...peers.filter(peer=>peer.signedId!==signedId).sort((a,b)=>a.signedId-b.signedId).map(peer=>this.collect(peer.signedId))];
    const references={...primary.preview.references};
    for(const member of group.slice(1))for(const key of Object.keys(references) as Array<keyof DrawingForceReleaseReferences>)references[key]+=member.preview.references[key];
    const unique=(key:'pdf'|'bomSnapshots'|'outboundSnapshots'|'lineage')=>new Set(group.flatMap(member=>member.snapshot[key].map((row:Row)=>row.id??row.package_id))).size;
    const files=[...new Map(group.flatMap(member=>member.snapshot.pdf.map(row=>[row.id,row] as const))).values()];
    references.pdf=files.length;references.presentPdf=files.filter(row=>row.is_present).length;references.missingPdf=files.filter(row=>!row.is_present).length;
    references.emailDrafts=new Set(group.flatMap(member=>member.snapshot.email.map(row=>row.id))).size;
    references.audits=new Set(group.flatMap(member=>Object.entries(member.snapshot.audits).flatMap(([kind,rows])=>rows.map(row=>`${kind}:${row.id}`)))).size;
    references.bomSnapshots=unique('bomSnapshots');references.outboundSnapshots=unique('outboundSnapshots');references.lineage=unique('lineage');
    const affectedProductIds=[...new Set(group.flatMap(member=>member.preview.affectedProductIds))].sort((a,b)=>a-b);
    references.products=affectedProductIds.length;
    const preview:DrawingForceReleasePreview={...primary.preview,references,affectedProductIds,
      affectedIdentities:group.flatMap(member=>member.preview.affectedIdentities),
      fingerprint:createHash('sha256').update(JSON.stringify(group.map(member=>member.preview.fingerprint))).digest('hex')};
    return {group,preview};
  }
  preview(signedId:number):DrawingForceReleasePreview { return this.db.transaction(()=>this.collectGroup(signedId).preview).deferred(); }
  confirm(input:DrawingForceReleaseInput) {
    if(input.confirmed!==true)throw new DrawingForceReleaseError('FORCE_CONFIRMATION_REQUIRED','请先查看影响并明确确认强制释放');
    return this.db.transaction(()=>{
      const {preview,group}=this.collectGroup(input.signedId);
      if(preview.fingerprint!==input.fingerprint)throw new DrawingForceReleaseError('FORCE_IMPACT_CHANGED','图号或引用已变化，请重新查看影响后确认');
      const now=new Date().toISOString();
      const releaseIds:number[]=[];
      for(const member of group){
        const {snapshot,table,id}=member;
        const result=this.db.prepare(`insert into drawing_force_releases(origin,record_id,full_code,fingerprint,snapshot_json,references_json,reason,created_at) values(?,?,?,?,?,?,?,?)`)
          .run(member.preview.origin,id,preview.fullCode,preview.fingerprint,JSON.stringify(snapshot),JSON.stringify(preview.references),input.reason?.trim()||null,now);
        const releaseId=Number(result.lastInsertRowid);releaseIds.push(releaseId);
        // Paths outlive PDF index IDs: removing/recreating an index must not remove isolation.
        for(const file of snapshot.pdf)this.db.prepare('insert or ignore into drawing_force_release_files(release_id,relative_path,path_key,full_code) values(?,?,?,?)')
          .run(releaseId,file.relative_path,toWorkspacePathKey(file.relative_path),preview.fullCode);
        this.db.prepare(`update pdf_files set drawing_id=null,historical_drawing_id=null,match_status='pending',classification_warning='drawing-force-released' where id in (select value from json_each(?))`)
          .run(JSON.stringify(snapshot.pdf.map(file=>file.id)));
        this.db.prepare(`update ${table} set full_code=?,deleted_full_code=?,deleted_at=?,deletion_mode='release',deleted_previous_status=status,deleted_reason=?,scan_resolution='ignore' where id=?`)
          .run(`__force_released__:${member.preview.origin}:${id}:${releaseId}`,preview.fullCode,now,input.reason?.trim()||null,id);
      }
      // Preserve lineage in the event while detaching mutable current management links.
      for(const member of group)if(member.preview.origin==='planned')this.db.prepare(`update drawing_numbers set previous_drawing_id=case when previous_drawing_id=? then null else previous_drawing_id end,source_drawing_id=case when source_drawing_id=? then null else source_drawing_id end where id<>? and not exists(select 1 from drawing_force_releases r where r.origin='planned' and r.record_id=drawing_numbers.id) and (previous_drawing_id=? or source_drawing_id=?)`).run(member.id,member.id,member.id,member.id,member.id);
      return {outcome:'force_released' as const,fullCode:preview.fullCode,occupied:false as const,releaseId:releaseIds[0],releaseIds};
    }).immediate();
  }
}
