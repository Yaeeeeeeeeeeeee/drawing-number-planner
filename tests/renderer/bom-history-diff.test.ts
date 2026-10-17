import { describe, expect, it } from 'vitest';
import type { BomItemView } from '../../src/renderer/data/client';
import { compareBomItems, compareAttachments, bomFields } from '../../src/renderer/pages/bom/bom-history-diff';
const item=(projectItemId:number,overrides:Partial<Extract<BomItemView,{origin:'planned'}>>={}):BomItemView=>({bomItemId:projectItemId,projectItemId,projectItemName:`项目${projectItemId}`,origin:'planned',drawingId:projectItemId,fullCode:`02.0404.010.040100${projectItemId}`,displayName:'资料',status:'active',effectiveMaterialBatchId:null,effectiveBatchName:null,effectiveBatchRelativePath:null,material:'铜版纸',dimensions:'210×297',position:'内部',changeDetails:'原样',notes:null,usesWhiteMaterial:false,assets:[],qrCodes:[],...overrides});
const asset=(hash='a'.repeat(64),id=1)=>({id,assetId:id,role:'image' as const,inheritedFromBomItemAssetId:null,relativePath:`BOM/${id}.png`,originalFileName:'同名.png',mimeType:'image/png',sizeBytes:100,contentSha256:hash,createdAt:'2026-09-28'});
describe('BOM history presentation diff',()=>{
 it('matches reliable project identities and ignores row order and regenerated row IDs',()=>{
  const prev=[item(1),item(2)],selected=[item(2,{bomItemId:22}),item(1,{bomItemId:11})];
  const r=compareBomItems(selected,prev);expect(r.counts).toEqual({added:0,removed:0,modified:0,unchanged:2,pending:0});
  expect(r.rows[0].previous?.projectItemId).toBe(2);
 });
 it('counts modifications additions and removals from the full union',()=>{
  const r=compareBomItems([item(1,{material:'双胶纸',notes:'新版'}),item(3)],[item(1),item(2)]);
  expect(r.counts).toEqual({added:1,removed:1,modified:1,unchanged:0,pending:0});
  expect(r.rows.find(x=>x.kind==='modified')?.changedFields).toEqual(['material','notes']);
  expect(r.rows.find(x=>x.kind==='removed')?.previous?.projectItemId).toBe(2);
 });
 it('does not guess a duplicate project correspondence or count it as added or deleted',()=>{
  const r=compareBomItems([item(1),item(1,{bomItemId:2})],[item(1)]);
  expect(r.counts.added+r.counts.removed+r.counts.modified+r.counts.unchanged).toBe(0);
  expect(r.rows.every(x=>x.kind==='pending'&&Boolean(x.previous)!==Boolean(x.selected))).toBe(true);
  expect(r.counts.pending).toBe(3);
 });
 it('does not use equal labels or different drawing numbers as project identity',()=>{
  const r=compareBomItems([item(2,{projectItemName:'说明书'})],[item(1,{projectItemName:'说明书'})]);
  expect(r.counts.added).toBe(1);expect(r.counts.removed).toBe(1);
 });
 it('compares exact raw fields, references, batch snapshots and QR IDs rather than display labels',()=>{
  const prev=item(1,{effectiveMaterialBatchId:8,effectiveBatchName:'01.首批',effectiveBatchRelativePath:'old/path',qrCodes:[{id:5,name:'二维码',purposeDisplayName:'说明书',status:'active'}]});
  const next={...prev,effectiveBatchRelativePath:'new/path',material:'铜版纸 ',qrCodes:[{...prev.qrCodes[0],name:'重命名',status:'inactive' as const}]};
  const r=compareBomItems([next],[prev]);expect(r.rows[0].changedFields).toEqual(['batch','material']);
 });
 it('counts a changed drawing identity even if a bad stored display code looks the same',()=>{
  expect(compareBomItems([item(1,{drawingId:55})],[item(1)]).rows[0].changedFields).toContain('drawing');
 });
 it('does not invent historical changes from live status or dictionary display names',()=>{
  const r=compareBomItems([item(1,{status:'inactive',projectItemName:'新名称'})],[item(1)]);
  expect(r.counts.unchanged).toBe(1);
 });
 it('compares existing quantity and white-material fields without changing the API contract',()=>{
  const prev={...item(1),quantity:1};const next={...item(1),quantity:2,usesWhiteMaterial:true};
  expect(compareBomItems([next],[prev]).rows[0].changedFields).toEqual(['quantity','white']);
 });
 it('uses valid content hashes for attachments, never filenames',()=>{
  expect(compareAttachments([asset()],[asset('b'.repeat(64))]).kind).toBe('replaced');
  expect(compareAttachments([asset()],[asset('a'.repeat(64),2)]).kind).toBe('association');
  expect(compareAttachments([asset()],[asset()]).kind).toBe('unchanged');
 });
 it('marks unverified content or duplicate roles pending rather than unchanged',()=>{
  expect(compareAttachments([asset('unknown')],[asset('unknown')]).kind).toBe('unknown');
  expect(compareAttachments([asset(),asset('b'.repeat(64),2)],[asset()]).kind).toBe('unknown');
  expect(compareBomItems([item(1,{assets:[asset('unknown')]})],[item(1,{assets:[asset('unknown')]})]).counts.pending).toBe(1);
 });
 it('counts real attachment additions removals and replacements',()=>{
  expect(compareAttachments([],[asset()]).kind).toBe('added');
  expect(compareAttachments([asset()],[]).kind).toBe('removed');
  expect(compareBomItems([item(1,{assets:[asset('b'.repeat(64))]})],[item(1,{assets:[asset()]})]).counts.modified).toBe(1);
 });
 it('does not mutate or sort the loaded snapshots in place',()=>{
  const a=[item(2),item(1)],b=[item(1)];const before=JSON.stringify([a,b]);compareBomItems(a,b);expect(JSON.stringify([a,b])).toBe(before);
  expect(bomFields.map(x=>x.key)).toEqual(expect.arrayContaining(['drawing','batch','material','dimensions','position','changeDetails','notes','quantity','white']));
 });
});
it('excludes independent QR associations from BOM history change counts without altering the snapshots',()=>{
 const before=item(1,{qrCodes:[{id:5,name:'A',purposeDisplayName:'说明书',status:'active'}]}),after=item(1,{qrCodes:[{id:9,name:'B',purposeDisplayName:'售后卡',status:'active'}]});
 const result=compareBomItems([after],[before]);expect(result.counts.modified).toBe(0);expect(result.counts.unchanged).toBe(1);expect(after.qrCodes[0].id).toBe(9);expect(before.qrCodes[0].id).toBe(5);
});
