import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { BomHistoryComparison } from '../../src/renderer/pages/bom/BomHistoryComparison';
import type { BomItemView, BomVersionView } from '../../src/renderer/data/client';
const item=(id:number,material='纸'):BomItemView=>({bomItemId:id,projectItemId:id,projectItemName:`资料${id}`,origin:'planned',drawingId:id,fullCode:`02.0404.010.040100${id}`,displayName:'资料',status:'active',effectiveMaterialBatchId:null,effectiveBatchName:null,effectiveBatchRelativePath:null,material,dimensions:'210×297',position:'内部',changeDetails:null,notes:null,usesWhiteMaterial:false,assets:[],qrCodes:[]});
const version=(id:number,items:BomItemView[],previousVersionId:number|null=null):BomVersionView=>({id,productId:1,model:'F60',versionNumber:id,previousVersionId,businessChangeDate:'2026-09-28',businessChangeDateLabel:'2026-09-28',notes:null,createdAt:'2026-09-28T00:00:00Z',updatedAt:'2026-09-28T00:00:00Z',editRevision:1,items});
const props={mainCategories:[],projects:[],batches:[],onOpenAsset:vi.fn(),previewOnly:false};
afterEach(cleanup);
describe('query-only BOM history comparison',()=>{
 it('computes union counts; changes open, unchanged closed; filters fields and expands all',async()=>{
  render(<BomHistoryComparison {...props} detail={version(2,[item(1,'铜版纸'),item(2),item(4)],1)} readVersion={vi.fn().mockResolvedValue(version(1,[item(1),item(2),item(3)]))}/>);
  await screen.findByRole('button',{name:/项目 1 · 资料1.*修改/});
  expect(screen.queryByLabelText('BOM 变更摘要')).toBeNull();
  const changed=screen.getByRole('button',{name:/项目 1 · 资料1/});expect(changed).toHaveAttribute('aria-expanded','true');
  expect(screen.getByRole('button',{name:/项目 2 · 资料2/})).toHaveAttribute('aria-expanded','false');
  const panel=document.getElementById(changed.getAttribute('aria-controls')!)!;
  expect(within(panel).getByText('材质')).toBeVisible();expect(within(panel).queryByText('尺寸')).toBeNull();
  fireEvent.click(within(panel).getByRole('button',{name:'全部字段'}));expect(within(panel).getByText('尺寸')).toBeVisible();
  fireEvent.click(screen.getByRole('button',{name:'全部收起'}));expect(changed).toHaveAttribute('aria-expanded','false');
  fireEvent.click(screen.getByRole('button',{name:'全部展开'}));expect(screen.getByRole('button',{name:/项目 2 · 资料2/})).toHaveAttribute('aria-expanded','true');
 });
 it('shows complete first record without a blank previous column or invented counts',()=>{
  render(<BomHistoryComparison {...props} detail={version(1,[item(1)])}/>);
  expect(screen.getByRole('button',{name:/首次记录/})).toBeVisible();expect(screen.getByText('尺寸')).toBeVisible();expect(screen.queryByText('修改 1 项')).toBeNull();expect(screen.queryByRole('columnheader',{name:'上一条记录'})).toBeNull();
 });
 it('does not treat unreadable or mismatched predecessors as first records',async()=>{
  const read=vi.fn().mockRejectedValue(new Error('missing'));const {rerender}=render(<BomHistoryComparison {...props} detail={version(2,[item(1)],1)} readVersion={read}/>);
  expect(await screen.findByText(/上一条记录读取失败/)).toBeVisible();expect(screen.queryByText('首次记录，无历史版本可对照')).toBeNull();
  rerender(<BomHistoryComparison {...props} detail={version(3,[item(1)],1)} readVersion={vi.fn().mockResolvedValue({...version(1,[]),productId:9})}/>);
  expect(await screen.findByText(/上一条关系不匹配/)).toBeVisible();
 });
 it('ignores a late previous-version response after a same-ID snapshot revision changes',async()=>{
  let resolve!:(v:BomVersionView)=>void;const oldRead=vi.fn(()=>new Promise<BomVersionView>(r=>{resolve=r;}));const nextRead=vi.fn().mockResolvedValue(version(1,[item(1,'新版')]));
  const {rerender}=render(<BomHistoryComparison {...props} detail={version(2,[item(1)],1)} readVersion={oldRead}/>);
  rerender(<BomHistoryComparison {...props} detail={{...version(2,[item(1,'新版')],1),editRevision:2}} readVersion={nextRead}/>);
  expect(await screen.findByRole('button',{name:/项目 1 · 资料1.*未变化/})).toBeVisible();resolve(version(1,[item(1)]));
  await waitFor(()=>expect(screen.getByRole('button',{name:/项目 1 · 资料1.*未变化/})).toBeVisible());
 });
});
it('exposes changed raw batch snapshots on demand when normalized labels look identical',async()=>{
 const a=item(1),b={...a,effectiveMaterialBatchId:9,effectiveBatchName:'01.20260928',effectiveBatchRelativePath:'old/path'},c={...b,effectiveBatchName:'02.20260928',effectiveBatchRelativePath:'new/path'};
 render(<BomHistoryComparison {...props} detail={version(2,[c],1)} readVersion={vi.fn().mockResolvedValue(version(1,[b]))}/>);
 await screen.findByRole('button',{name:/项目 1 · 资料1.*修改/});expect(screen.getByText('old/path')).not.toBeVisible();
 fireEvent.click(screen.getByText('批次详情'));expect(screen.getByText('old/path')).toBeVisible();expect(screen.getByText('01.20260928')).toBeVisible();
 const field=screen.getByRole('rowheader',{name:'生效批次'}).closest('tr')!;expect(field).not.toHaveTextContent('old/path');expect(field).not.toHaveTextContent('关联编号');
});
it('keeps effective batch values compact and moves raw snapshot information outside BOM field cells',()=>{
 const b={...item(1),effectiveBatchName:'01.20260928',effectiveBatchRelativePath:'完整/目录',effectiveMaterialBatchId:9};
 render(<BomHistoryComparison {...props} detail={version(1,[b])}/>);
 const row=screen.getByRole('rowheader',{name:'生效批次'}).closest('tr')!;
 expect(row).toHaveTextContent('20260928');expect(row.querySelector('details')).toBeNull();expect(row).not.toHaveTextContent('关联编号');expect(row).not.toHaveTextContent('原始名称');
 expect(screen.queryByRole('rowheader',{name:'二维码关联'})).toBeNull();expect(screen.getByText(b.fullCode)).toBeVisible();expect(screen.queryAllByRole('button',{name:/复制/})).toHaveLength(0);
 fireEvent.click(screen.getByText('批次详情'));expect(screen.getByText('完整/目录')).toBeVisible();expect(screen.queryAllByRole('button',{name:/复制/})).toHaveLength(0);
});

it('renders selected values before previous values in static field, attachment and batch columns',async()=>{
 const old={...item(1,'旧纸'),effectiveMaterialBatchId:1,effectiveBatchName:'旧批次',effectiveBatchRelativePath:'old'}, next={...old,material:'新纸',effectiveBatchName:'新批次',effectiveBatchRelativePath:'new'};
 render(<BomHistoryComparison {...props} detail={version(2,[next],1)} readVersion={vi.fn().mockResolvedValue(version(1,[old]))}/>);
 await screen.findByRole('button',{name:/项目 1 · 资料1.*修改/});
 const row=screen.getByRole('rowheader',{name:'材质'}).closest('tr')!;expect(within(row).getAllByRole('cell').map(c=>c.textContent)).toEqual(['新纸','旧纸']);
 expect(screen.queryByRole('button',{name:/恢复.*布局/})).toBeNull();
 fireEvent.click(screen.getByText('批次详情'));expect(Array.from(document.querySelectorAll('.bom-history-batch-snapshots section')).map(e=>e.getAttribute('aria-label'))).toEqual(['所选记录批次详情','上一条记录批次详情']);
});
