import {observeDrawingFiles,resolveObservedPath,type DrawingFileObservation,type ObservationIndex,type ObservedBatch} from '../files/drawing-file-observation.js';
import {buildProductDirectory} from '../files/directory-policy.js';
import {codeScopeFromFullCode} from '../files/batch-business-order.js';
import {FileError} from '../files/file-errors.js';
import {toWorkspacePathKey} from '../files/workspace-paths.js';
import { inspectIndexedPdfPresence } from '../files/pdf-presence.js';
import { DrawingForceReleaseService } from './drawing-force-release-service.js';
import {DrawingReuseService} from './drawing-reuse-service.js';
import type { PlannerDatabase } from '../../db/database.js';
import { resolveCanonicalProductId, listRawProductIds } from '../products/appearance-identity.js';
import { DrawingAssociationService } from './drawing-association-service.js';
import { MaterialBatchService } from '../files/material-batch-service.js';
import { DrawingDeletionService } from './drawing-deletion-service.js';
import type { DeleteDrawingInput } from './drawing-deletion-types.js';
import { DrawingRepository } from './drawing-repository.js';
import type { DrawingDetailRecord, DrawingNavigationBatch, DrawingSearchFilters, HistoricalDrawingStatus, PagedDrawingResult } from './drawing-types.js';

export class DrawingQueryError extends Error {
  constructor(public readonly code: 'NOT_FOUND' | 'INVALID_TRANSITION' | 'HISTORICAL_READ_ONLY' | 'PDF_NOT_AVAILABLE', message: string) { super(message); }
}

export class DrawingQueryService {
  readonly forceRelease: DrawingForceReleaseService;
  readonly associations: DrawingAssociationService;
  readonly reuse:DrawingReuseService;
  private readonly repository: DrawingRepository;
  private readonly batches: MaterialBatchService;
  private readonly deletion: DrawingDeletionService;
  constructor(private readonly database: PlannerDatabase,private readonly workspaceRoot?:()=>string|null) {
    this.forceRelease = new DrawingForceReleaseService(database);
    this.associations = new DrawingAssociationService(database);
    this.reuse = new DrawingReuseService(database);
    this.repository = new DrawingRepository(database);
    this.batches = new MaterialBatchService(database);
    this.deletion = new DrawingDeletionService(database);
  }

  search(filters: DrawingSearchFilters = {}): PagedDrawingResult {
    if (filters.productId!==undefined) filters={...filters,productId:resolveCanonicalProductId(this.database,filters.productId)};
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const result = this.repository.search(filters, page, pageSize);
    return {
      ...result,
      items: result.items.map((item) => ({
        ...item,
        batchUsage: this.batches.getDrawingUsage(item.fullCode, item.status),
      })),
      page,
      pageSize,
    };
  }

  navigationCounts(filters: DrawingSearchFilters = {}) { return this.repository.navigationCounts(filters); }

  navigation(): { batches: DrawingNavigationBatch[]; mainCategories: NonNullable<import('./drawing-types.js').DrawingNavigationCounts['mainCategories']> } {
    const usage = this.repository.businessUsage();
    return { mainCategories:this.repository.navigationCounts({}).mainCategories??[],batches: this.batches.list().map((batch) => {
      const evidence = usage.filter((item) => item.batchId === batch.id);
      const identities = (items: typeof evidence) => new Set(items.map((item) => `${item.origin}:${item.recordId}`)).size;
      const productIds = [...new Set(evidence.map((item) => item.productId))];
      return { ...batch,
        currentState: evidence.some((item) => item.current) ? 'current' : evidence.length ? 'historical' : 'indeterminate',
        confirmedDrawingCount: identities(evidence),
        usageProducts: productIds.map((productId) => {
          const items = evidence.filter((item) => item.productId === productId);
          return { productId, state: items.some((item) => item.current) ? 'current' : 'historical', drawingCount: identities(items) };
        }),
      };
    }) };
  }

  get(id: number): DrawingDetailRecord {
    const drawing = this.repository.getDetail(id);
    if (!drawing) throw new DrawingQueryError('NOT_FOUND', '图号记录不存在');
    const observe=(files:typeof drawing.sourceFiles)=>this.workspaceRoot?files.map(file=>{const fact=inspectIndexedPdfPresence(this.workspaceRoot!(),file);return{...file,indexedIsPresent:file.isPresent,isPresent:fact.status==='present'||fact.status==='index-stale',presenceStatus:fact.status,presenceMessage:fact.message};}):files;
    return { ...drawing,fileObservation:this.observeFiles(drawing),sourceFiles:observe(drawing.sourceFiles),outlinedFiles:observe(drawing.outlinedFiles), ...this.firstBusinessReferences(id), associationEvidence: this.associations.preview(undefined,[id]).records[0]?.evidence ?? [], associationHistory: this.associations.history(id), batchUsage: this.batches.getDrawingUsage(drawing.fullCode, drawing.status) };
  }

  private observeFiles(drawing: ReturnType<DrawingRepository['getDetail']> & {}): DrawingFileObservation {
    const root=this.workspaceRoot?.()??null;
    if(!root)return observeDrawingFiles({root,fullCode:drawing.fullCode,directories:[],indexedFiles:[],batches:[]});
    const files=[...drawing.sourceFiles,...drawing.outlinedFiles];
    const productIds=new Set([drawing.productId,...(drawing.businessUsage??[]).map(usage=>usage.productId)].filter((id):id is number=>id!=null).flatMap(id=>listRawProductIds(this.database,id)));
    const directories=new Set<string>();
    for(const productId of productIds){
      const product=this.database.prepare('select product_category as productCategory,sku,model from products where id=?').get(productId) as {productCategory:string;sku:string;model:string}|undefined;
      if(product)directories.add(buildProductDirectory(product));
    }
    for(const file of files){const segments=file.relativePath.split(/[\\/]+/);if(segments.length>=4)directories.add(segments.slice(0,2).join('/'));}
    const batchScope:string[]=[],batchParameters:Array<string|number>=[];
    if(productIds.size){batchScope.push(`product_id in (${[...productIds].map(()=>'?').join(',')})`);batchParameters.push(...productIds);}
    if(directories.size){batchScope.push(`lower(replace(product_directory,char(47),char(92))) in (${[...directories].map(()=>'?').join(',')})`);batchParameters.push(...[...directories].map(toWorkspacePathKey));}
    const rawBatches=batchScope.length?this.database.prepare(`select id,relative_path as relativePath,product_directory as productDirectory,product_id as productId,coalesce(display_name,name) as name,business_date as businessDate from material_batches where ${batchScope.join(' or ')}`).all(...batchParameters) as Array<ObservedBatch&{productDirectory:string;productId:number|null}>:[];
    for(const batch of rawBatches){if(batch.productId!=null&&productIds.has(batch.productId))directories.add(batch.productDirectory);}
    const selections=new Map<string,ReturnType<MaterialBatchService['getCurrentBatchSelection']>>();
    const batches:ObservedBatch[]=rawBatches.map(batch=>{
      let selection=selections.get(batch.productDirectory);
      if(!selection){selection=this.batches.getCurrentBatchSelection(batch.productDirectory,codeScopeFromFullCode(drawing.fullCode)??undefined);selections.set(batch.productDirectory,selection);}
      return {...batch,usageState:selection.status==='selected'?selection.batchId===batch.id?'current':'historical':'indeterminate'};
    });
    const column=drawing.origin==='planned'?'drawing_id':'historical_drawing_id';
    const indexedFiles=this.database.prepare(`select id as pdfIndexId,relative_path as relativePath,content_sha256 as contentSha256 from pdf_files where ${column}=?`).all(Math.abs(drawing.id)) as ObservationIndex[];
    const released=Boolean(this.database.prepare('select 1 from drawing_force_releases where full_code=?').get(drawing.fullCode));
    const blockedPaths=(this.database.prepare('select relative_path as path from drawing_force_release_files where full_code=?').all(drawing.fullCode) as Array<{path:string}>).map(row=>row.path);
    return observeDrawingFiles({root,fullCode:drawing.fullCode,directories:[...directories],indexedFiles:released?indexedFiles:files.map(file=>({pdfIndexId:file.pdfIndexId,relativePath:file.relativePath})),batches,requireHashBoundIndex:released,blockedPaths});
  }

  resolveObservedFile(input: unknown): string {
    if(!input||typeof input!=='object')throw new FileError('INVALID_PDF_FILE_ID','图号文件参数无效');
    const request=input as Record<string,unknown>;
    if(request.kind!=='drawing-file'||!['planned','historical'].includes(String(request.origin))||!Number.isSafeInteger(request.recordId)||Number(request.recordId)<=0||typeof request.relativePath!=='string')throw new FileError('INVALID_PDF_FILE_ID','图号文件参数无效');
    const signedId=request.origin==='historical'?-Number(request.recordId):Number(request.recordId),drawing=this.repository.getDetail(signedId);
    if(!drawing)throw new FileError('PDF_FILE_NOT_FOUND','图号记录不存在');
    const key=toWorkspacePathKey(request.relativePath),observation=this.observeFiles(drawing);
    const found=[...observation.source.entries,...observation.outlined.entries].some(entry=>entry.state==='present'&&entry.files.some(file=>toWorkspacePathKey(file.relativePath)===key&&file.isPresent));
    const root=this.workspaceRoot?.();
    if(!found||!root)throw new FileError('PDF_FILE_UNAVAILABLE','此图号的文件未通过当前实际核验，请刷新详情');
    return resolveObservedPath(root,request.relativePath);
  }

  private firstBusinessReferences(signedId:number) {
    const column=signedId<0?'historical_drawing_id':'drawing_id',id=Math.abs(signedId);
    const batches=this.database.prepare(`select id,coalesce(display_name,name) as name,sequence_number as sequenceNumber,business_date as businessDate,product_directory as directory
      from material_batches where recognition_status='recognized' and id in (
        select material_batch_id from pdf_files where ${column}=@id
        union select effective_material_batch_id from bom_items where ${column}=@id
        union select package.selected_material_batch_id from outbound_package_items item join outbound_packages package on package.id=item.package_id where item.${column}=@id and package.status='completed'
      )`).all({id}) as Array<{id:number;name:string;sequenceNumber:number|null;businessDate:string|null;directory:string}>;
    const sameDirectory=new Set(batches.map(batch=>batch.directory)).size===1;
    const bySequence=sameDirectory&&batches.every(batch=>batch.sequenceNumber!==null);
    const byDate=batches.every(batch=>batch.businessDate!==null&&/^\d{4}-\d{2}-\d{2}$/.test(batch.businessDate)&&Number.isFinite(Date.parse(batch.businessDate)));
    const comparable=bySequence||byDate;
    const order=(batch:typeof batches[number])=>bySequence?batch.sequenceNumber!:Date.parse(batch.businessDate!);
    const earliest=comparable&&batches.length?batches.filter(batch=>order(batch)===Math.min(...batches.map(order))):[];
    const firstBom=this.database.prepare(`select version.id,version.product_id as productId,version.version_number as versionNumber,version.business_change_date as businessDate,product.model
      from bom_versions version join bom_items item on item.bom_version_id=version.id join products product on product.id=version.product_id
      where item.${column}=? order by version.created_at,version.id limit 1`).get(id) as {id:number;productId:number;versionNumber:number;businessDate:string|null;model:string}|undefined;
    return {firstOccurrenceBatch:earliest.length===1?{id:earliest[0].id,name:earliest[0].name}:null,firstBatchAmbiguous:batches.length>0&&earliest.length!==1,firstBom:firstBom??null};
  }

  transition(id: number, target: 'active' | 'voided'): DrawingDetailRecord {
    const drawing = this.get(id);
    if (drawing.deletedAt) throw new DrawingQueryError('INVALID_TRANSITION', '请先恢复已删除的图号记录');
    if (drawing.readOnly) throw new DrawingQueryError('HISTORICAL_READ_ONLY', '历史图号的编码和文件关联不可修改；停用不释放号码。');
    const allowed = (drawing.status === 'reserved' && (target === 'active' || target === 'voided'))
      || (drawing.status === 'active' && target === 'voided')
      || (drawing.status === 'voided' && target === 'active');
    if (!allowed) {
      const labels: Record<string, string> = { reserved: '已占号', active: '正式使用', voided: '作废' };
      throw new DrawingQueryError('INVALID_TRANSITION', `不支持从${labels[drawing.status] ?? drawing.status}变更为${labels[target] ?? target}`);
    }
    this.repository.updateStatus(id, target);
    return this.get(id);
  }

  previewDeletion(id: number) { return this.deletion.preview(id); }

  deleteDrawing(input: DeleteDrawingInput) { return this.deletion.delete(input); }
  deleteDrawings(inputs: DeleteDrawingInput[]) { return this.deletion.deleteBatch(inputs); }

  restoreDrawing(id: number) { return this.deletion.restore(id); }

  resolveDeletedScan(id: number, resolution: 'reimport' | 'ignore') {
    return this.deletion.resolveScan(id, resolution);
  }

  updateHistoricalStatus(historicalId: number, status: HistoricalDrawingStatus): DrawingDetailRecord {
    const drawing = this.get(-historicalId);
    if (drawing.deletedAt) throw new DrawingQueryError('INVALID_TRANSITION', '请先恢复已删除的图号记录');
    if (drawing.origin !== 'historical') throw new DrawingQueryError('NOT_FOUND', '图号记录不存在');
    this.repository.updateHistoricalStatus(historicalId, status);
    return this.get(-historicalId);
  }

  associatePdf(id: number, pdfIndexId: number, conversionType: 'source' | 'outlined'): DrawingDetailRecord {
    const drawing = this.get(id);
    if (drawing.readOnly) throw new DrawingQueryError('HISTORICAL_READ_ONLY', '历史图号的编码和文件关联不可修改；停用不释放号码。');
    if (!this.repository.associatePdf(id, pdfIndexId, conversionType)) {
      throw new DrawingQueryError('PDF_NOT_AVAILABLE', 'PDF 索引不存在或文件当前缺失');
    }
    return this.get(id);
  }
}
