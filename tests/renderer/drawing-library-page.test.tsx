import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import { DrawingLibraryPage } from '../../src/renderer/pages/DrawingLibraryPage';

beforeEach(() => {vi.stubGlobal('innerWidth', 1920);localStorage.removeItem('planner:page-size:drawings');});
afterEach(() => vi.unstubAllGlobals());

it('requests enough initial drawing records for a tall workspace without truncating the result', async () => {
  const api = { searchDrawings: vi.fn().mockResolvedValue({ items: [], total: 0 }), listDictionaries: vi.fn().mockResolvedValue([]) };
  render(<DrawingLibraryPage api={api as never} />);
  await waitFor(() => expect(api.searchDrawings).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 50 })));
});

describe('DrawingLibraryPage', () => {
  it('refreshes catalog metadata as well as list counts after independently confirmed force release',async()=>{
    let released=false;
    const row={id:7,origin:'planned',fullCode:'02.0209.010.0401001',model:'M1',status:'active',sourceFiles:[],outlinedFiles:[],currentBomUsage:[]};
    const api={listDictionaries:vi.fn().mockResolvedValue([]),listProducts:vi.fn().mockResolvedValue([]),getDrawingNavigation:vi.fn().mockResolvedValue({batches:[],mainCategories:[]}),getDrawingNavigationCounts:vi.fn().mockImplementation(()=>Promise.resolve({total:released?0:1,products:[],categories:[],batches:[],unassociated:0})),searchDrawings:vi.fn().mockImplementation(()=>Promise.resolve({items:released?[]:[row],total:released?0:1})),getDrawing:vi.fn().mockResolvedValue(row),getDrawingForceReleasePreview:vi.fn().mockResolvedValue({fullCode:row.fullCode,fingerprint:'impact',references:{drawingRecords:1},affectedProductIds:[]}),forceReleaseDrawing:vi.fn().mockImplementation(()=>{released=true;return Promise.resolve({occupied:false});})};
    render(<DrawingLibraryPage api={api as never}/>);
    fireEvent.click(await screen.findByRole('button',{name:'查看 / 管理'}));
    await waitFor(()=>expect(api.getDrawingNavigation).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button',{name:'强制取消占号并删除图号'}));
    fireEvent.click(await screen.findByRole('button',{name:'确认强制释放并删除'}));
    await waitFor(()=>expect(api.getDrawingNavigation.mock.calls.length).toBeGreaterThan(1));
    expect(api.forceReleaseDrawing).toHaveBeenCalledOnce();
  });
  it('refreshes product catalog metadata after classification even when no new binding was needed',async()=>{
    const product={id:9,sku:'SKU-ZU70SD',model:'ZU70SD',productCategory:'冰柜',status:'active'};
    const api={searchDrawings:vi.fn().mockResolvedValue({items:[],total:733}),listDictionaries:vi.fn().mockResolvedValue([]),listProducts:vi.fn().mockResolvedValueOnce([]).mockResolvedValue([product]),getDrawingNavigationCounts:vi.fn().mockResolvedValue({total:733,unassociated:0,recycle:0,categories:[{name:'冰柜',count:733}],products:[{productId:9,count:733}],batches:[]}),classifyDrawingAssociations:vi.fn().mockResolvedValue({updated:0,before:{historicalAssociated:733,historicalTotal:757,plannedAssociated:0,plannedTotal:0},after:{historicalAssociated:733,historicalTotal:757,plannedAssociated:0,plannedTotal:0},issues:[]})};
    render(<DrawingLibraryPage api={api as never}/>);await waitFor(()=>expect(api.listProducts).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button',{name:'自动归类'}));
    await screen.findByRole('button',{name:'产品 ZU70SD'});expect(api.listProducts.mock.calls.length).toBeGreaterThan(1);
  });
  it('does not discard loaded products when an unrelated dictionary request fails',async()=>{
    const api={searchDrawings:vi.fn().mockResolvedValue({items:[],total:0}),listDictionaries:vi.fn().mockRejectedValue(new Error('字典暂不可用')),listProducts:vi.fn().mockResolvedValue([{id:9,sku:'SKU-ZU70SD',model:'ZU70SD',productCategory:'冰柜',status:'active'}])};
    render(<DrawingLibraryPage api={api as never}/>);expect(await screen.findByRole('button',{name:'产品 ZU70SD'})).toBeVisible();
  });
  it('reloads the catalog on reactivation and ignores an obsolete product response',async()=>{
    let release!:(value:unknown)=>void;const product={id:9,sku:'SKU-ZU70SD',model:'ZU70SD',productCategory:'冰柜',status:'active'};
    const api={searchDrawings:vi.fn().mockResolvedValue({items:[],total:0}),listDictionaries:vi.fn().mockResolvedValue([]),listProducts:vi.fn().mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;})).mockResolvedValue([product])};
    const view=render(<DrawingLibraryPage api={api as never}/>);await waitFor(()=>expect(api.listProducts).toHaveBeenCalledOnce());
    view.rerender(<DrawingLibraryPage api={api as never} active={false}/>);view.rerender(<DrawingLibraryPage api={api as never} active/>);
    expect(await screen.findByRole('button',{name:'产品 ZU70SD'})).toBeVisible();await act(async()=>{release([]);});expect(screen.getByRole('button',{name:'产品 ZU70SD'})).toBeVisible();
  });
  it('shows the full drawing number once in the detail header when the display name is identical', async () => {
    const item={id:1,fullCode:'02.0209.010.0501001',displayName:'02.0209.010.0501001',origin:'planned',status:'reserved',readOnly:false,sourceFiles:[],outlinedFiles:[],currentBomUsage:[]};
    const api={searchDrawings:vi.fn().mockResolvedValue({items:[item],total:1}),listDictionaries:vi.fn().mockResolvedValue([]),getDrawing:vi.fn().mockResolvedValue(item)};
    render(<DrawingLibraryPage api={api as never}/>);fireEvent.click(await screen.findByRole('button',{name:item.fullCode}));
    const detail=await screen.findByRole('complementary',{name:'图号详情'});expect(within(detail).getAllByText(item.fullCode)).toHaveLength(1);
  });
  it('does not replace a new drawings PDF candidates with an old manual search response', async () => {
    const first = { id: 1, fullCode: '02.0209.010.0501001', origin: 'planned', status: 'active', model: 'T40', displayName: '第一记录', readOnly: false, sourceFiles: [], outlinedFiles: [], currentBomUsage: [] };
    const second = { ...first, id: 2, fullCode: '02.0209.010.0501002', displayName: '第二记录' };
    let resolveSearch!: (value: unknown) => void;
    const api = { searchDrawings: vi.fn().mockResolvedValue({ items: [first, second], total: 2 }), listDictionaries: vi.fn().mockResolvedValue([]),
      getDrawing: vi.fn().mockImplementation((id: number) => Promise.resolve(id === 1 ? first : second)),
      searchPdfFiles: vi.fn().mockResolvedValueOnce({ items: [{ id: 10, fileName: 'A.pdf', relativePath: 'A.pdf' }] })
        .mockImplementationOnce(() => new Promise(resolve => { resolveSearch = resolve; }))
        .mockResolvedValue({ items: [{ id: 20, fileName: 'B.pdf', relativePath: 'B.pdf' }] }) };
    render(<DrawingLibraryPage api={api as never} />);
    fireEvent.click(await screen.findByRole('button', { name: first.fullCode }));
    fireEvent.click(await screen.findByRole('button', { name: '改变产品所属' }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: '现有 PDF 索引' })).toHaveValue('10'));
    fireEvent.change(screen.getByLabelText('搜索现有 PDF'), { target: { value: 'old-search' } });
    fireEvent.click(screen.getByRole('button', { name: '搜索 PDF' }));
    fireEvent.click(screen.getByRole('button', { name: second.fullCode }));
    fireEvent.click(await screen.findByRole('button', { name: '改变产品所属' }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: '现有 PDF 索引' })).toHaveValue('20'));
    await act(async () => resolveSearch({ items: [{ id: 11, fileName: 'late-A.pdf', relativePath: 'A.pdf' }] }));
    expect(screen.getByRole('combobox', { name: '现有 PDF 索引' })).toHaveValue('20');
    expect(screen.queryByRole('option', { name: /late-A/ })).not.toBeInTheDocument();
  });
  it('blocks record changes during deletion preflight and clears it when changing records afterward', async () => {
    const first = { id: 1, fullCode: '02.0209.010.0501001', origin: 'planned', status: 'active', model: 'T40', displayName: '第一记录', readOnly: true, sourceFiles: [], outlinedFiles: [], currentBomUsage: [] };
    const second = { ...first, id: 2, fullCode: '02.0209.010.0501002', displayName: '第二记录' };
    let resolvePreview!: (value: unknown) => void;
    const api = { searchDrawings: vi.fn().mockResolvedValue({ items: [first, second], total: 2 }), listDictionaries: vi.fn().mockResolvedValue([]),
      getDrawing: vi.fn().mockImplementation((id: number) => Promise.resolve(id === 1 ? first : second)),
      getDrawingDeletionPreview: vi.fn().mockImplementation(() => new Promise(resolve => { resolvePreview = resolve; })) };
    render(<DrawingLibraryPage api={api as never} />);
    fireEvent.click(await screen.findByRole('button', { name: first.fullCode }));
    fireEvent.click(await screen.findByRole('button', { name: '改变产品所属' }));
    fireEvent.click(await screen.findByRole('button', { name: '删除图号（保留占号）' }));
    fireEvent.click(screen.getByRole('button', { name: second.fullCode }));
    expect(api.getDrawing).toHaveBeenCalledTimes(1);
    await act(async () => resolvePreview({ fullCode: first.fullCode, origin: 'planned', deletable: true, references: {}, blockers: [] }));
    fireEvent.click(screen.getByRole('button', { name: second.fullCode }));
    await screen.findByText('第二记录');
    expect(within(screen.getByRole('complementary', { name: '图号详情' })).queryByText(first.fullCode)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '确认删除' })).not.toBeInTheDocument();
  });
  it('ignores a late response for an earlier drawing selection', async () => {
    const first = { id: 1, fullCode: '02.0209.010.0501001', origin: 'planned', status: 'active', model: 'T40', displayName: '旧详情', readOnly: true, sourceFiles: [], outlinedFiles: [], currentBomUsage: [] };
    const second = { ...first, id: 2, fullCode: '02.0209.010.0501002', displayName: '最新详情' };
    let resolveFirst!: (value: unknown) => void;
    const api = { searchDrawings: vi.fn().mockResolvedValue({ items: [first, second], total: 2 }), listDictionaries: vi.fn().mockResolvedValue([]),
      getDrawing: vi.fn().mockImplementation((id: number) => id === 1 ? new Promise(resolve => { resolveFirst = resolve; }) : Promise.resolve(second)) };
    render(<DrawingLibraryPage api={api as never} />);
    fireEvent.click(await screen.findByRole('button', { name: first.fullCode }));
    fireEvent.click(screen.getByRole('button', { name: second.fullCode }));
    expect(await screen.findByText('最新详情')).toBeVisible();
    await act(async () => resolveFirst(first));
    await waitFor(() => expect(within(screen.getByRole('complementary', { name: '图号详情' })).getByText('最新详情')).toBeVisible());
    expect(within(screen.getByRole('complementary', { name: '图号详情' })).queryByText('旧详情')).not.toBeInTheDocument();
  });
  it('opens details outside the table without selecting batch checkboxes', async () => {
    window.history.replaceState({}, '', '/?mock=drawing-library');
    render(<DrawingLibraryPage api={{} as never} />);
    const trigger = await screen.findByRole('button', { name: '02.0209.010.0501001' });
    const checkbox = screen.getByRole('checkbox', { name: '选择图号 02.0209.010.0501001' });
    fireEvent.click(checkbox);
    expect(screen.queryByRole('complementary', { name: '图号详情' })).not.toBeInTheDocument();
    fireEvent.click(trigger);
    const detail = await screen.findByRole('complementary', { name: '图号详情' });
    expect(detail.closest('table')).toBeNull();
    expect(checkbox).toBeChecked();
    expect(within(detail).getByRole('button', { name: '复制完整图号' })).toBeVisible();
  });
  afterEach(() => window.history.replaceState({}, '', '/'));
  it('keeps detail attributes, state actions and file maintenance grouped without losing information', async () => {
    window.history.replaceState({}, '', '/?mock=drawing-library');
    const realCall = vi.fn();
    render(<DrawingLibraryPage api={new Proxy({}, { get: () => realCall }) as never} />);
    fireEvent.click(await screen.findByRole('button', { name: '02.0209.010.0501001' }));
    const detail = await screen.findByRole('complementary', { name: '图号详情' });
    expect(within(detail.querySelector('.drawing-detail-attributes')!).getAllByRole('term').map((term) => term.textContent)).toEqual(['SKU', '型号', '品牌', '产品类别', '主类别', '项目明细']);
    expect(within(detail).getByRole('combobox',{name:'图号业务状态'})).toBeVisible();
    expect(within(detail).getByRole('button', { name: '改变产品所属' })).toBeDisabled();
    expect(within(detail).queryByRole('region', { name: '文件维护 / 索引维护' })).not.toBeInTheDocument();
    expect(within(detail).getByRole('button', { name: '删除图号（保留占号）' })).toBeDisabled();
    fireEvent.keyDown(detail, { key: 'Escape' });
    expect(screen.queryByRole('complementary', { name: '图号详情' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '02.0209.010.0501001' })).toHaveFocus();
    expect(realCall).not.toHaveBeenCalled();
  });
  it('exposes the detail disclosure and returns focus to the drawing on close', async () => {
    const row = { id: 77, fullCode: '02.0209.010.0501077', origin: 'planned', status: 'active',
      model: 'T40', displayName: '说明书', readOnly: true, sourceFiles: [], outlinedFiles: [], currentBomUsage: [] };
    const api = { searchDrawings: vi.fn().mockResolvedValue({ items: [row], total: 1 }),
      listDictionaries: vi.fn().mockResolvedValue([]), getDrawing: vi.fn().mockResolvedValue(row) };
    render(<DrawingLibraryPage api={api as never} />);
    const trigger = await screen.findByRole('button', { name: row.fullCode });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    const detail = await screen.findByRole('complementary', { name: '图号详情' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(trigger.getAttribute('aria-controls')).toBe(detail.id);
    fireEvent.click(screen.getByRole('button', { name: '关闭图号详情' }));
    expect(trigger).toHaveFocus();
  });

  it('keeps all Mock maintenance and disk buttons disabled even with colliding real IDs', async () => {
    window.history.replaceState({}, '', '/?mock=drawing-library');
    const realCall = vi.fn();
    const api = new Proxy({}, { get: () => realCall });
    render(<DrawingLibraryPage api={api as never} />);
    fireEvent.click(await screen.findByRole('button', { name: '02.0209.010.0501001' }));
    expect(await screen.findByRole('button', { name: '改变产品所属' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /^删除图号$/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /打开转曲前文件.*的位置/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: '全选已加载' }));
    expect(screen.getByRole('button', { name: /批量删除/ })).toBeDisabled();
    expect(realCall).not.toHaveBeenCalled();
    window.history.replaceState({}, '', '/');
  });
  it('opens the recycle bin directly and offers release for retained deleted records', async () => {
    const row = { id: -1, fullCode: '02.0209.010.0401001', origin: 'historical', status: 'active', model: 'T40',
      displayName: '历史资料', deletedAt: '2026-09-30', deletionMode: 'retain_occupied', readOnly: true,
      sourceFiles: [], outlinedFiles: [], currentBomUsage: [] };
    const api = { searchDrawings: vi.fn().mockImplementation((filters) => Promise.resolve({ items: filters.deletionState === 'deleted' ? [row] : [], total: filters.deletionState === 'deleted' ? 1 : 0 })),
      listDictionaries: vi.fn().mockResolvedValue([]), getDrawing: vi.fn().mockResolvedValue(row),
      getDrawingDeletionPreview: vi.fn().mockResolvedValue({ fullCode: row.fullCode, origin: 'historical', references: {}, blockers: [], deletable: true }) };
    render(<DrawingLibraryPage api={api as never} />);
    fireEvent.click(await screen.findByRole('button', { name: '回收站' }));
    fireEvent.click(await screen.findByText(row.fullCode));
    fireEvent.click(await screen.findByRole('button', { name: '改变产品所属' }));
    fireEvent.click(await screen.findByRole('button', { name: '检查引用并释放占号' }));
    expect(await screen.findByLabelText('输入完整图号确认释放')).toBeVisible();
    expect(screen.getByText('释放后，该号码未来可能被重新规划使用。')).toBeVisible();
  });
  it('shows files from each known directory without a directory choice', async () => {
    const files = ['A', 'B'].map((directory, index) => ({ pdfIndexId: index + 1, fileName: `${directory}.pdf`,
      relativePath: `${directory}/00/${directory}.pdf`, isPresent: true, conversionType: 'outlined' }));
    const row = { id: 1, productId: 10, fullCode: '02.0209.010.0501001', origin: 'planned', status: 'active',
      model: 'T40', displayName: '外箱', sourceFiles: [], outlinedFiles: files, currentBomUsage: [], readOnly: true,
      batchUsage: { state: 'current', occurrences: files.map((file, index) => ({ batchId: index + 1, productId: 10,
        productDirectory: index === 0 ? 'A' : 'B', batchName: '00.首批大货', usageState: 'current', files: [file] })) } };
    const api = { searchDrawings: vi.fn().mockResolvedValue({ items: [row], total: 1 }),
      listDictionaries: vi.fn().mockResolvedValue([]), getDrawing: vi.fn().mockResolvedValue(row) };
    render(<DrawingLibraryPage api={api as never} />);
    fireEvent.click(await screen.findByText(row.fullCode));
    const panel = await screen.findByRole('complementary', {name: '图号详情'});
    expect(within(panel).queryByLabelText('当前文件所属资料目录')).toBeNull();
    expect(within(panel).queryByLabelText('查看资料批次')).toBeNull();
    expect(within(panel).getByText('A.pdf')).toBeVisible();
    expect(within(panel).getByText('B.pdf')).toBeVisible();
    expect(within(panel).getAllByText('当前批次')).toHaveLength(2);
  });
  it('retains each directory business state without promoting a historical file', async () => {
    const own = { pdfIndexId: 1, fileName: 'own-old.pdf', relativePath: 'A/00/own-old.pdf', isPresent: true, conversionType: 'outlined' };
    const other = { ...own, pdfIndexId: 2, fileName: 'other-current.pdf', relativePath: 'B/01/other-current.pdf' };
    const row = { id: 1, productId: 10, fullCode: '02.0209.010.0501001', origin: 'planned', status: 'active',
      model: 'T40', displayName: '外箱', sourceFiles: [], outlinedFiles: [own, other], currentBomUsage: [], readOnly: true,
      batchUsage: { state: 'current', occurrences: [
        { batchId: 1, productId: 10, productDirectory: 'A', batchName: '00.首批大货', usageState: 'historical', files: [own] },
        { batchId: 2, productId: 20, productDirectory: 'B', batchName: '01.20260929', usageState: 'current', files: [other] },
      ] } };
    const api = { searchDrawings: vi.fn().mockResolvedValue({ items: [row], total: 1 }),
      listDictionaries: vi.fn().mockResolvedValue([]), getDrawing: vi.fn().mockResolvedValue(row) };
    render(<DrawingLibraryPage api={api as never} />);
    fireEvent.click(await screen.findByText(row.fullCode));
    const panel = await screen.findByRole('complementary', {name: '图号详情'});
    expect(within(panel).getByText('own-old.pdf').closest('li')).toHaveAttribute('data-usage-state','historical');
    expect(within(panel).getByText('other-current.pdf').closest('li')).toHaveAttribute('data-usage-state','current');
    expect(within(panel).queryByLabelText('查看资料批次')).toBeNull();
  });
  it.each([true, false])('shows current and historical batches together and preserves unavailable current state (present=%s)', async (isPresent) => {
    const oldFile = { pdfIndexId: 1, fileName: 'old.pdf', relativePath: '00/old.pdf', isPresent: true, conversionType: 'outlined' };
    const currentFile = { ...oldFile, pdfIndexId: 2, fileName: 'current.pdf', relativePath: '06/current.pdf', isPresent };
    const row = { id: 1, fullCode: '02.0209.010.0501001', origin: 'planned', status: 'active',
      model: 'T40', displayName: '外箱', sourceFiles: [], outlinedFiles: [oldFile, currentFile],
      hasSourceFile: false, hasOutlinedFile: true, currentBomUsage: [], readOnly: true,
      batchUsage: { state: 'current', occurrences: [
        { batchId: 1, batchName: '00.首批大货', usageState: 'historical', files: [oldFile] },
        { batchId: 2, batchName: '06.20260309', usageState: 'current', files: [currentFile] },
      ] } };
    const api = { searchDrawings: vi.fn().mockResolvedValue({ items: [row], total: 1 }),
      listDictionaries: vi.fn().mockResolvedValue([]), getDrawing: vi.fn().mockResolvedValue(row) };
    render(<DrawingLibraryPage api={api as never} />);
    fireEvent.click(await screen.findByText(row.fullCode));
    const panel = await screen.findByRole('complementary', {name: '图号详情'});
    expect(within(panel).getByText('old.pdf')).toBeVisible();
    expect(within(panel).getByText('历史批次')).toBeVisible();
    expect(within(panel).getByText('当前批次')).toBeVisible();
    if(isPresent)expect(within(panel).getByText('current.pdf')).toBeVisible();
    else {
      expect(within(panel).getByText('文件状态尚未核验')).toBeVisible();
      expect(within(panel).queryByRole('button',{name:'打开转曲后文件 current.pdf 的位置'})).toBeNull();
    }
    expect(within(panel).queryByLabelText('查看资料批次')).toBeNull();
  });
  it('keeps one logical drawing and does not invent files from batch membership alone', async () => {
    const occurrences = Array.from({ length: 7 }, (_, index) => ({
      batchId: index + 1,
      productDirectory: '01.洗碗机\\SKU-T40',
      batchName: index === 6 ? '06.20260309' : `0${index}.20250${index + 1}01`,
      sequenceNumber: index,
      recognitionStatus: 'recognized',
      usageState: index === 6 ? 'current' : 'historical',
      files: [],
    }));
    const row = {
      id: -1, fullCode: '02.0209.010.0501001', displayName: '大外箱', sku: 'SKU', model: 'T40',
      brandName: 'SAMKYO', colorName: '白色', mainCategoryName: '包装类', projectItemName: '大外箱',
      status: 'active', origin: 'historical', hasSourceFile: true, hasOutlinedFile: true,
      dictionaryMappingStatus: 'mapped',
      batchUsage: { state: 'current', occurrenceCount: 7, currentProductCount: 1, historicalProductCount: 0,
        conflictWithBusinessStatus: false, occurrences },
    } as const;
    const api = {
      searchDrawings: vi.fn().mockResolvedValue({ items: [row], total: 1, page: 1, pageSize: 20 }),
      listDictionaries: vi.fn().mockResolvedValue([]),
      getDrawing: vi.fn().mockResolvedValue({ ...row, readOnly: true, readOnlyMessage: '永久占用的历史数据，不可修改',
        sourceFiles: [], outlinedFiles: [], currentBomUsage: [] }),
    };

    render(<DrawingLibraryPage api={api as never} />);

    expect(await screen.findAllByText(row.fullCode)).toHaveLength(1);
    expect(screen.queryByText('资料使用')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(row.fullCode));
    const panel = await screen.findByRole('complementary', {name:'图号详情'});
    expect(within(panel).queryByLabelText('查看资料批次')).toBeNull();
    expect(within(panel).getAllByText('未找到对应文件索引，尚未核验磁盘')).toHaveLength(2);
    expect(within(panel).queryByRole('button',{name:/打开.*的位置/})).toBeNull();
    expect(screen.queryByText('PDF 出现位置（7）')).not.toBeInTheDocument();
  });

  it('offers a separate open-location action for each present source/outlined file and disables missing rows', async () => {
    const row = { id: 10, fullCode: '02.0209.010.0401001', displayName: 'Drawing', sku: 'SKU', productId: 5,
      model: 'ZC220', productCategory: '冰柜', brandName: 'SAMKYO', colorName: '白色', mainCategoryName: '印刷件类',
      projectItemName: 'LOGO', status: 'active', origin: 'planned', hasSourceFile: true, hasOutlinedFile: true,
      dictionaryMappingStatus: 'mapped' } as const;
    const detail = { ...row, readOnly: false, readOnlyMessage: null,
      sourceFiles: [{ pdfIndexId: 21, fileName: 'source.pdf', relativePath: 'SKU/source.pdf', isPresent: true, conversionType: 'source' }],
      outlinedFiles: [
        { pdfIndexId: 22, fileName: 'outlined.pdf', relativePath: 'SKU/new/outlined.pdf', isPresent: true, conversionType: 'outlined' },
        { pdfIndexId: 23, fileName: 'missing.pdf', relativePath: 'SKU/old/missing.pdf', isPresent: false, conversionType: 'outlined' },
      ], currentBomUsage: [] } as const;
    const showFileInFolder = vi.fn().mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false,
      error: { code: 'PDF_FILE_UNAVAILABLE', message: '文件已不存在，请重新扫描资料库' } });
    window.plannerDesktop = { showFileInFolder };
    const api = { searchDrawings: vi.fn().mockResolvedValue({ items: [row], total: 1, page: 1, pageSize: 20 }),
      listDictionaries: vi.fn().mockResolvedValue([]), getDrawing: vi.fn().mockResolvedValue(detail),
      searchPdfFiles: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 }) };

    render(<DrawingLibraryPage api={api as never} />); fireEvent.click(await screen.findByText(row.fullCode));
    fireEvent.click(await screen.findByRole('button', { name: '打开转曲前文件 source.pdf 的位置' }));
    fireEvent.click(screen.getByRole('button', { name: '打开转曲后文件 outlined.pdf 的位置' }));

    await waitFor(() => expect(showFileInFolder).toHaveBeenNthCalledWith(1, 21));
    expect(showFileInFolder).toHaveBeenNthCalledWith(2, 22);
    expect(await screen.findByText('文件已不存在，请重新扫描资料库')).toBeVisible();
    expect(screen.queryByRole('button', { name: '打开转曲后文件 missing.pdf 的位置' })).not.toBeInTheDocument();
    expect(screen.queryByText('查看历史文件')).not.toBeInTheDocument();
  });

  it('runs real filters and opens the selected drawing detail', async () => {
    const drawing = { id: 1, fullCode: '02.0209.010.0401001', displayName: 'SAMKYO-ZC220白色-LOGO', sku: 'SKDZC220JP',
      model: 'ZC220', brandName: 'SAMKYO', colorName: '白色', mainCategoryName: '印刷件类',
      projectItemName: 'LOGO', status: 'active', origin: 'planned', hasSourceFile: true,
      hasOutlinedFile: false, dictionaryMappingStatus: 'mapped' };
    const api = {
      listDictionaries: vi.fn().mockResolvedValue([]), listProducts: vi.fn().mockResolvedValue([{ id:5, model:'T40', productCategory: '冰柜' }]),
      searchDrawings: vi.fn().mockResolvedValueOnce({ items: [], total: 0, page: 1, pageSize: 20 })
        .mockResolvedValueOnce({ items: [drawing], total: 1, page: 1, pageSize: 20 }),
      getDrawing: vi.fn().mockResolvedValue(drawing),
    };
    render(<DrawingLibraryPage api={api as never} />);
    await screen.findByText('图号库尚无记录');

    fireEvent.click(screen.getByRole('button', {name:'更多筛选'}));
    fireEvent.change(screen.getByLabelText('完整图号'), { target: { value: '02.0209' } });
    fireEvent.change(screen.getByLabelText('型号'), { target: { value: 'ZC220' } });
    fireEvent.change(screen.getByLabelText('关键词'), { target: { value: 'LOGO' } });
    fireEvent.change(screen.getByLabelText('状态'), { target: { value: 'active' } });
    fireEvent.click(screen.getByLabelText('精确图号'));
    fireEvent.change(screen.getByLabelText('产品类别'), { target: { value: '冰柜' } });
    fireEvent.change(screen.getByLabelText('SKU'), { target: { value: 'SKDZC220JP' } });
    fireEvent.change(screen.getByLabelText('源文件'), { target: { value: 'present' } });
    fireEvent.change(screen.getByLabelText('转曲后文件'), { target: { value: 'missing' } });
    fireEvent.click(screen.getByRole('button', { name: '查询' }));
    const code = await screen.findByText('02.0209.010.0401001');
    fireEvent.click(code);

    await waitFor(() => expect(api.searchDrawings).toHaveBeenLastCalledWith(expect.objectContaining({
      drawingNumber: '02.0209', exactDrawingNumber: true, model: 'ZC220', status: 'active',
      keyword: 'LOGO',
      sku: 'SKDZC220JP', productCategory: '冰柜', sourcePresence: 'present', outlinedPresence: 'missing',
    })));
    expect(screen.getAllByText('正式规划').length).toBeGreaterThan(0);
    expect(screen.queryByText((_, element) => element?.className === 'file-integrity-summary')).not.toBeInTheDocument();
    expect(await screen.findByRole('complementary', { name: '图号详情' })).toHaveTextContent('SAMKYO-ZC220白色-LOGO');
  });

  it('includes inactive product categories in the drawing filter dropdown', async () => {
    const api = {
      searchDrawings: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
      listDictionaries: vi.fn().mockResolvedValue([]),
      listProducts: vi.fn().mockResolvedValue([{ id:1, model:'A', productCategory: '在售冰柜', status: 'active' }, { id:2, model:'B', productCategory: '停用酒柜', status: 'inactive' }]),
    };

    render(<DrawingLibraryPage api={api as never} />);
    await waitFor(() => expect(api.listProducts).toHaveBeenCalledWith({ status: 'all' }));
    fireEvent.click(screen.getByRole('button', { name: '更多筛选' }));

    expect(await screen.findByRole('option', { name: '停用酒柜' })).toBeVisible();
  });

  it('shows dictionary filter loading failures instead of silently empty options', async () => {
    const api = { searchDrawings: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }), listDictionaries: vi.fn().mockRejectedValue(new Error('筛选项加载失败')) };
    render(<DrawingLibraryPage api={api as never} />);
    expect(await screen.findByText('筛选项加载失败')).toBeVisible();
  });

  it('marks historical codes whose dictionary segments are not mapped', async () => {
    const historical = { id: -1, fullCode: '99.9999.999.9999001', displayName: '99.9999.999.9999001',
      sku: null, model: '待识别', brandName: '99', colorName: '9', mainCategoryName: '99', projectItemName: '99',
      status: 'active', origin: 'historical', hasSourceFile: false, hasOutlinedFile: true,
      dictionaryMappingStatus: 'unmapped' };
    const api = { searchDrawings: vi.fn().mockResolvedValue({ items: [historical], total: 1, page: 1, pageSize: 20 }),
      listDictionaries: vi.fn().mockResolvedValue([]), getDrawing: vi.fn().mockResolvedValue(historical) };

    render(<DrawingLibraryPage api={api as never} />);

    expect(await screen.findByText(/历史扫描/)).toBeVisible();
    expect(screen.getByText(/字典待映射/)).toBeVisible();
  });

  it('separates business status, file completeness, and current BOM usage in planned maintenance detail', async () => {
    const row = { id: 10, fullCode: '02.0209.010.0401001', displayName: 'SAMKYO-ZC220白色-LOGO', sku: 'SKU-220',
      productId: 5, model: 'ZC220', productCategory: '冰柜', brandName: 'SAMKYO', colorName: '白色',
      mainCategoryName: '印刷件类', projectItemName: 'LOGO', status: 'reserved', origin: 'planned',
      hasSourceFile: true, hasOutlinedFile: false, dictionaryMappingStatus: 'mapped' } as const;
    const detail = { ...row, readOnly: false, readOnlyMessage: null,
      sourceFiles: [{ pdfIndexId: 21, fileName: 'source.pdf', relativePath: 'SKU/source.pdf', isPresent: true, conversionType: 'source' }],
      outlinedFiles: [], currentBomUsage: [{ bomVersionId: 31, productId: 5, model: 'ZC220', colorId: 4,
        colorName: '白色', versionNumber: 2, projectItemId: 7, projectItemName: 'LOGO', quantity: 1, usesWhiteMaterial: false }] };
    const api = { searchDrawings: vi.fn().mockResolvedValue({ items: [row], total: 1, page: 1, pageSize: 20 }),
      listDictionaries: vi.fn().mockResolvedValue([]), getDrawing: vi.fn().mockResolvedValue(detail),
      searchPdfFiles: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 }) };

    render(<DrawingLibraryPage api={api as never} />);
    fireEvent.click(await screen.findByText(row.fullCode));

    const panel = await screen.findByRole('complementary', { name: '图号详情' });
    expect(within(panel).getByRole('combobox',{name:'图号业务状态'})).toHaveValue('inactive');
    expect(within(panel).getByText('source.pdf')).toBeVisible();
    expect(within(panel).getByText('存在')).toBeVisible();
    expect(within(panel).getByText('未找到对应文件索引，尚未核验磁盘')).toBeVisible();
    expect(panel).not.toHaveTextContent('SKU/source.pdf');
    expect(panel).toHaveTextContent('首次 BOM');
    expect(panel).toHaveTextContent('未进入 BOM');
    expect(panel).not.toHaveTextContent('BOM v2');
  });

  it('confirms lifecycle actions and refreshes both detail and its visible row', async () => {
    const reserved = { id: 10, fullCode: '02.0209.010.0401001', displayName: 'Drawing', sku: 'SKU', productId: 5,
      model: 'ZC220', productCategory: '冰柜', brandName: 'SAMKYO', colorName: '白色', mainCategoryName: '印刷件类',
      projectItemName: 'LOGO', status: 'reserved', origin: 'planned', hasSourceFile: false, hasOutlinedFile: false,
      dictionaryMappingStatus: 'mapped', readOnly: false, readOnlyMessage: null, sourceFiles: [], outlinedFiles: [], currentBomUsage: [] } as const;
    const active = { ...reserved, status: 'active' as const };
    const voided = { ...reserved, status: 'voided' as const };
    const api = { searchDrawings: vi.fn().mockResolvedValue({ items: [reserved], total: 1, page: 1, pageSize: 20 }),
      listDictionaries: vi.fn().mockResolvedValue([]), getDrawing: vi.fn().mockResolvedValueOnce(voided).mockResolvedValueOnce(active).mockResolvedValueOnce(voided),
      searchPdfFiles: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 }),
      activateDrawing: vi.fn().mockResolvedValue(active), voidDrawing: vi.fn().mockResolvedValue(voided) };
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<DrawingLibraryPage api={api as never} />);
    fireEvent.click(await screen.findByText(reserved.fullCode));
    fireEvent.click(await screen.findByRole('button', { name: '改变产品所属' }));
    fireEvent.change(await screen.findByRole('combobox',{name:'图号业务状态'}),{target:{value:'active'}});

    await waitFor(() => expect(api.activateDrawing).toHaveBeenCalledWith(10));
    expect(confirm).toHaveBeenCalledWith('确认将该图号变更为正式使用？此操作会记录业务状态。');
    expect(api.getDrawing).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('combobox',{name:'图号业务状态'})).toHaveValue('active');
    fireEvent.change(screen.getByRole('combobox',{name:'图号业务状态'}),{target:{value:'inactive'}});
    await waitFor(() => expect(api.voidDrawing).toHaveBeenCalledWith(10));
    expect(confirm).toHaveBeenLastCalledWith('确认停用该图号？停用期间号码继续占用，可恢复使用。');
    expect(api.getDrawing).toHaveBeenCalledTimes(3);
    expect(screen.getByRole('combobox',{name:'图号业务状态'})).toHaveValue('inactive');
  });

  it('deletes a drawing from the danger zone with explicit lifecycle mode and reference preview', async () => {
    const reserved = { id: 10, fullCode: '02.0209.010.0401001', displayName: 'Drawing', sku: 'SKU', productId: 5,
      model: 'ZC220', productCategory: '冰柜', brandName: 'SAMKYO', colorName: '白色', mainCategoryName: '印刷件类',
      projectItemName: 'LOGO', status: 'reserved', origin: 'planned', hasSourceFile: false, hasOutlinedFile: false,
      dictionaryMappingStatus: 'mapped', readOnly: false, readOnlyMessage: null, sourceFiles: [], outlinedFiles: [], currentBomUsage: [] } as const;
    const api = { searchDrawings: vi.fn().mockResolvedValue({ items: [reserved], total: 1, page: 1, pageSize: 20 }),
      listDictionaries: vi.fn().mockResolvedValue([]), getDrawing: vi.fn().mockResolvedValue(reserved),
      searchPdfFiles: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 }),
      getDrawingDeletionPreview: vi.fn().mockResolvedValue({ signedId: 10, origin: 'planned', fullCode: reserved.fullCode,
        status: 'reserved', deletable: true, blockers: [], references: { presentPdf: 1, missingPdf: 0,
          currentBom: 0, historicalBom: 2, currentMaterial: 0, historicalMaterial: 3, lineage: 0, outboundSnapshot: 1 } }),
      deleteDrawing: vi.fn().mockResolvedValue({ outcome: 'deleted_retained', fullCode: reserved.fullCode, occupied: true }) };
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    confirm.mockClear();

    render(<DrawingLibraryPage api={api as never} />);
    fireEvent.click(await screen.findByText(reserved.fullCode));
    fireEvent.click(await screen.findByRole('button', { name: '改变产品所属' }));
    fireEvent.click(await screen.findByRole('button', { name: '删除图号（保留占号）' }));
    expect(await screen.findByText('当前 PDF：1')).toBeVisible();
    expect(screen.getByText('历史 BOM：2')).toBeVisible();
    expect(screen.getByText('历史批次：3')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));

    await waitFor(() => expect(api.deleteDrawing).toHaveBeenCalledWith(10, {
      mode: 'retain_occupied', confirmedCode: reserved.fullCode,
    }));
    expect(api.getDrawingDeletionPreview).toHaveBeenCalledWith(10);
    expect(confirm).toHaveBeenCalledWith('确认删除 02.0209.010.0401001 的正常记录并继续保留占号？');
  });

  it('associates a searched current PDF and refreshes detail and row while surfacing failures', async () => {
    const detail = { id: 10, fullCode: '02.0209.010.0401001', displayName: 'Drawing', sku: 'SKU', productId: 5,
      model: 'ZC220', productCategory: '冰柜', brandName: 'SAMKYO', colorName: '白色', mainCategoryName: '印刷件类',
      projectItemName: 'LOGO', status: 'reserved', origin: 'planned', hasSourceFile: false, hasOutlinedFile: false,
      dictionaryMappingStatus: 'mapped', readOnly: false, readOnlyMessage: null, sourceFiles: [], outlinedFiles: [], currentBomUsage: [] } as const;
    const candidate = { id: 81, relativePath: 'old/existing.pdf', fileName: 'existing.pdf', drawingId: null,
      historicalDrawingId: null, historicalFullCode: null, fullCode: null, displayName: null, model: null, brandName: null,
      projectItemName: null, colorName: null, matchStatus: 'unmatched', detectedCodes: [], classificationWarning: null,
      conversionType: 'source', sizeBytes: 1, modifiedAt: '', scannedAt: '', isPresent: true } as const;
    const api = { searchDrawings: vi.fn().mockResolvedValue({ items: [detail], total: 1, page: 1, pageSize: 20 }),
      listDictionaries: vi.fn().mockResolvedValue([]), getDrawing: vi.fn().mockResolvedValue(detail),
      searchPdfFiles: vi.fn().mockResolvedValue({ items: [candidate], total: 1, page: 1, pageSize: 100 }),
      associateDrawingPdf: vi.fn().mockResolvedValueOnce(detail).mockRejectedValueOnce(new Error('PDF 已在扫描后缺失')) };

    render(<DrawingLibraryPage api={api as never} />);
    fireEvent.click(await screen.findByText(detail.fullCode));
    fireEvent.click(await screen.findByRole('button', { name: '改变产品所属' }));
    fireEvent.change(await screen.findByLabelText('搜索现有 PDF'), { target: { value: 'existing' } });
    fireEvent.click(screen.getByRole('button', { name: '搜索 PDF' }));
    await waitFor(() => expect(api.searchPdfFiles).toHaveBeenLastCalledWith({ keyword: 'existing', presence: 'present', page: 1, pageSize: 100 }));
    fireEvent.change(screen.getByLabelText('现有 PDF 索引'), { target: { value: '81' } });
    fireEvent.click(screen.getByRole('button', { name: '关联为转曲后文件' }));

    expect(api.associateDrawingPdf).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '保存并返回详情' }));
    await waitFor(() => expect(api.associateDrawingPdf).toHaveBeenCalledWith(10, 81, 'outlined'));
    fireEvent.click(await screen.findByRole('button', { name: '改变产品所属' }));
    expect(api.getDrawing).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: '关联为源文件' }));
    fireEvent.click(screen.getByRole('button', { name: '保存并返回详情' }));
    expect(await screen.findByText(/1 项失败/)).toBeVisible();
  });

  it('replaces or clears the selected PDF whenever candidate search results change', async () => {
    const detail = { id: 10, fullCode: '02.0209.010.0401001', displayName: 'Drawing', sku: 'SKU', productId: 5,
      model: 'ZC220', productCategory: '冰柜', brandName: 'SAMKYO', colorName: '白色', mainCategoryName: '印刷件类',
      projectItemName: 'LOGO', status: 'reserved', origin: 'planned', hasSourceFile: false, hasOutlinedFile: false,
      dictionaryMappingStatus: 'mapped', readOnly: false, readOnlyMessage: null, sourceFiles: [], outlinedFiles: [], currentBomUsage: [] } as const;
    const candidate = { id: 81, relativePath: 'old.pdf', fileName: 'old.pdf', drawingId: null,
      historicalDrawingId: null, historicalFullCode: null, fullCode: null, displayName: null, model: null, brandName: null,
      projectItemName: null, colorName: null, matchStatus: 'unmatched', detectedCodes: [], classificationWarning: null,
      conversionType: 'source', sizeBytes: 1, modifiedAt: '', scannedAt: '', isPresent: true } as const;
    const replacement = { ...candidate, id: 82, relativePath: 'replacement.pdf', fileName: 'replacement.pdf' };
    const api = { searchDrawings: vi.fn().mockResolvedValue({ items: [detail], total: 1, page: 1, pageSize: 20 }),
      listDictionaries: vi.fn().mockResolvedValue([]), getDrawing: vi.fn().mockResolvedValue(detail),
      searchPdfFiles: vi.fn()
        .mockResolvedValueOnce({ items: [candidate], total: 1, page: 1, pageSize: 100 })
        .mockResolvedValueOnce({ items: [replacement], total: 1, page: 1, pageSize: 100 })
        .mockResolvedValueOnce({ items: [], total: 0, page: 1, pageSize: 100 }),
      associateDrawingPdf: vi.fn().mockResolvedValue(detail) };

    render(<DrawingLibraryPage api={api as never} />);
    fireEvent.click(await screen.findByText(detail.fullCode));
    fireEvent.click(await screen.findByRole('button', { name: '改变产品所属' }));
    const select = await screen.findByLabelText('现有 PDF 索引');
    await waitFor(() => expect(select).toHaveValue('81'));

    fireEvent.change(screen.getByLabelText('搜索现有 PDF'), { target: { value: 'replacement' } });
    fireEvent.click(screen.getByRole('button', { name: '搜索 PDF' }));
    await waitFor(() => expect(select).toHaveValue('82'));
    expect(screen.queryByRole('option', { name: /old\.pdf/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '关联为源文件' }));
    expect(api.associateDrawingPdf).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('搜索现有 PDF'), { target: { value: 'none' } });
    fireEvent.click(screen.getByRole('button', { name: '搜索 PDF' }));
    await waitFor(() => expect(select).toHaveValue(''));
    expect(screen.getByRole('button', { name: '关联为源文件' })).toBeDisabled();
    expect(api.associateDrawingPdf).not.toHaveBeenCalled();
  });

  it('toggles historical business status while keeping file completeness and permanent occupancy visible', async () => {
    const historical = { id: -4, fullCode: '02.0209.010.0401004', displayName: '02.0209.010.0401004', sku: 'OLD',
      productId: null, model: 'ZC220', productCategory: '冰柜', brandName: 'SAMKYO', colorName: '白色',
      mainCategoryName: '印刷件类', projectItemName: 'LOGO', status: 'active', origin: 'historical',
      hasSourceFile: false, hasOutlinedFile: true, dictionaryMappingStatus: 'mapped', readOnly: true,
      readOnlyMessage: '历史图号的编码和文件关联不可修改；停用不释放号码。', sourceFiles: [], outlinedFiles: [], currentBomUsage: [] } as const;
    const inactive = { ...historical, status: 'inactive' as const };
    const api = { searchDrawings: vi.fn().mockResolvedValue({ items: [historical], total: 1, page: 1, pageSize: 20 }),
      listDictionaries: vi.fn().mockResolvedValue([]), getDrawing: vi.fn().mockResolvedValueOnce(historical).mockResolvedValueOnce(inactive),
      deactivateHistoricalDrawing: vi.fn().mockResolvedValue(inactive), activateHistoricalDrawing: vi.fn().mockResolvedValue(historical) };
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<DrawingLibraryPage api={api as never} />);
    fireEvent.click(await screen.findByText(historical.fullCode));
    fireEvent.click(await screen.findByRole('button', { name: '改变产品所属' }));
    fireEvent.change(await screen.findByRole('combobox',{name:'图号业务状态'}),{target:{value:'inactive'}});

    await waitFor(() => expect(api.deactivateHistoricalDrawing).toHaveBeenCalledWith(-4));
    expect(confirm).toHaveBeenCalledWith('确认停用该历史图号？停用不释放号码，也不会改变文件完整性。');
    expect(screen.getByRole('combobox',{name:'图号业务状态'})).toHaveValue('inactive');
    expect(screen.queryByText((_, element) => element?.className === 'file-integrity-summary')).not.toBeInTheDocument();
    expect(screen.queryByText('停用不释放号码')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '正式使用' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('搜索现有 PDF')).not.toBeInTheDocument();
  });

  it('uses bounded chunks without pagination and resets scope on submitted filters', async () => {
    const drawing = { id: 1, fullCode: '02.0209.010.0401001', displayName: '长路径图号', sku: 'SKU-220', productId: 5,
      model: 'ZC220', productCategory: '冰柜', brandName: 'SAMKYO', colorName: '白色', mainCategoryName: '印刷件类',
      projectItemName: 'LOGO', status: 'active', origin: 'planned', hasSourceFile: true, hasOutlinedFile: true,
      dictionaryMappingStatus: 'mapped' } as const;
    const api = {
      searchDrawings: vi.fn().mockResolvedValue({ items: [drawing], total: 1, page: 1, pageSize: 50 }),
      listProducts: vi.fn().mockResolvedValue([{ id:5, model:'T40', productCategory: '冰柜' }]),
      listMaterialBatches: vi.fn().mockResolvedValue([{ id: 44, name: '01.20260827', sku: 'SKU-220', model: 'ZC220' }]),
      listDictionaries: vi.fn((type: string) => Promise.resolve(type === 'main_category'
        ? [{ id: 12, code: '04', name: '印刷件类', status: 'active' }]
        : type === 'project_item'
          ? [{ id: 21, code: '01', name: 'LOGO', parentId: 12, status: 'active' }, { id: 22, code: '02', name: '说明书', parentId: 13, status: 'active' }]
          : type === 'appearance' ? [{ id: 31, code: '01', name: '一号外观', status: 'active' }] : [])),
      getDrawing: vi.fn().mockResolvedValue(drawing),
    };

    render(<DrawingLibraryPage api={api as never} />);
    await waitFor(() => expect(api.searchDrawings).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, pageSize: 50 })));
    expect(screen.queryByLabelText('每页条数')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '更多筛选' }));
    fireEvent.change(await screen.findByRole('combobox', { name: '产品类别' }), { target: { value: '冰柜' } });
    fireEvent.change(screen.getByLabelText('主类别'), { target: { value: '12' } });
    expect(screen.getByRole('option', { name: 'LOGO' })).toBeVisible();
    expect(screen.queryByRole('option', { name: '说明书' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('项目明细'), { target: { value: '21' } });
    fireEvent.change(screen.getByLabelText('外观'), { target: { value: '31' } });
    expect(screen.queryByLabelText('资料批次')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '查询' }));
    await waitFor(() => expect(api.searchDrawings).toHaveBeenLastCalledWith(expect.objectContaining({
      productCategory: '冰柜', mainCategoryId: 12, projectItemId: 21, appearanceId: 31, materialBatchId: '',
      page: 1, pageSize: 50,
    })));
    fireEvent.click(screen.getByRole('button', { name: '全部图号' }));
    await waitFor(() => expect(api.searchDrawings).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, pageSize: 50 })));
  });
});

it('scopes navigation by product without requesting independent appearance versions and keeps scope when searching', async () => {
  const api = { searchDrawings: vi.fn().mockResolvedValue({items:[],total:0}), listDictionaries:vi.fn().mockResolvedValue([]),
    listAppearanceVersions:vi.fn().mockResolvedValue({items:[{id:71,productId:5,label:'一代',status:'current'}]}),listProducts:vi.fn().mockResolvedValue([{id:5,sku:'SKU',model:'T40',productCategory:'冰柜'}]),
    listMaterialBatches:vi.fn().mockResolvedValue([]), getDrawingNavigation:vi.fn().mockResolvedValue({batches:[{id:7,name:'01.20261017',productId:5,usageProducts:[{productId:5,state:'current',drawingCount:1}]}]}) };
  render(<DrawingLibraryPage api={api as never}/>);
  fireEvent.click(await screen.findByRole('button', {name:'展开产品 T40'}));
  fireEvent.click(await screen.findByRole('button',{name:'产品 T40'}));
  await waitFor(() => expect(api.searchDrawings).toHaveBeenLastCalledWith(expect.objectContaining({productId:5,appearanceVersionId:'',materialBatchId:''})));
  fireEvent.change(screen.getByLabelText('关键词'),{target:{value:'LOGO'}});
  fireEvent.click(screen.getByRole('button',{name:'查询'}));
  await waitFor(() => expect(api.searchDrawings).toHaveBeenLastCalledWith(expect.objectContaining({productId:5,appearanceVersionId:'',keyword:'LOGO'})));
  fireEvent.click(screen.getByRole('button',{name:'未关联图号'}));
  await waitFor(() => expect(api.searchDrawings).toHaveBeenLastCalledWith(expect.objectContaining({associationState:'unassociated',productId:'',usageBatchId:''})));
  expect(screen.queryByRole('button',{name:'按图号'})).not.toBeInTheDocument();
  expect(api.listAppearanceVersions).not.toHaveBeenCalled();
});

it('stages PDF associations, rejects two roles for one PDF, and cancels without mutation', async () => {
  const row={id:1,fullCode:'CODE',origin:'planned',status:'active',displayName:'D',sourceFiles:[],outlinedFiles:[],currentBomUsage:[],readOnly:false};
  const api={searchDrawings:vi.fn().mockResolvedValue({items:[row],total:1}),listDictionaries:vi.fn().mockResolvedValue([]),getDrawing:vi.fn().mockResolvedValue(row),searchPdfFiles:vi.fn().mockResolvedValue({items:[{id:8,fileName:'test.pdf'}]}),associateDrawingPdf:vi.fn()};
  render(<DrawingLibraryPage api={api as never}/>);
  fireEvent.click(await screen.findByRole('button',{name:'CODE'}));
  expect(screen.queryByRole('button',{name:'关联为源文件'})).not.toBeInTheDocument();
  fireEvent.click(await screen.findByRole('button',{name:'改变产品所属'}));
  await waitFor(() => expect(screen.getByLabelText('现有 PDF 索引')).toHaveValue('8'));
  fireEvent.click(screen.getByRole('button',{name:'关联为源文件'}));
  fireEvent.click(screen.getByRole('button',{name:'关联为转曲后文件'}));
  expect(screen.getByRole('alert')).toHaveTextContent('同一个 PDF');
  fireEvent.click(screen.getByRole('button',{name:'取消编辑'}));
  expect(api.associateDrawingPdf).not.toHaveBeenCalled();
});

it('closes a hidden detail modal and ignores an outstanding detail request', async () => {
  let resolve!: (v:unknown)=>void;
  const row={id:1,fullCode:'CODE',origin:'planned',status:'active'};
  const api={searchDrawings:vi.fn().mockResolvedValue({items:[row],total:1}),listDictionaries:vi.fn().mockResolvedValue([]),getDrawing:vi.fn().mockImplementation(()=>new Promise(r=>{resolve=r;}))};
  const {rerender}=render(<DrawingLibraryPage api={api as never}/>);
  fireEvent.click(await screen.findByRole('button',{name:'CODE'}));
  rerender(<DrawingLibraryPage api={api as never} active={false}/>);
  await act(async()=>resolve({...row,sourceFiles:[],outlinedFiles:[],currentBomUsage:[]}));
  expect(screen.queryByRole('complementary',{name:'图号详情'})).not.toBeInTheDocument();
  expect(document.querySelector('[inert]')).toBeNull();
});

it('shows all batch files even when the list was opened in a historical batch context', async () => {
  const old={pdfIndexId:1,fileName:'old.pdf',relativePath:'old/old.pdf',isPresent:true,conversionType:'outlined'};
  const current={...old,pdfIndexId:2,fileName:'current.pdf'};
  const row={id:1,productId:5,fullCode:'CODE',origin:'planned',status:'active',sourceFiles:[],outlinedFiles:[old,current],currentBomUsage:[],batchUsage:{effectiveCurrentFileIds:[2],occurrences:[{batchId:7,productId:5,productDirectory:'T40',batchName:'旧批次',files:[old]},{batchId:8,productId:5,productDirectory:'T40',batchName:'新批次',files:[current]}]}};
  const api={searchDrawings:vi.fn().mockResolvedValue({items:[row],total:1}),listDictionaries:vi.fn().mockResolvedValue([]),listProducts:vi.fn().mockResolvedValue([{id:5,model:'T40',productCategory:'冰柜'}]),listMaterialBatches:vi.fn().mockResolvedValue([]),getDrawingNavigation:vi.fn().mockResolvedValue({batches:[{id:7,productId:5,name:'旧批次',usageProducts:[{productId:5,state:'historical'}]}]}),getDrawing:vi.fn().mockResolvedValue(row)};
  render(<DrawingLibraryPage api={api as never}/>);
  fireEvent.click(await screen.findByRole('button',{name:'CODE'}));
  const panel=await screen.findByRole('complementary',{name:'图号详情'});
  expect(within(panel).queryByLabelText('查看资料批次')).toBeNull();
  expect(within(panel).getByText('old.pdf')).toBeVisible();
  expect(within(panel).getByText('current.pdf')).toBeVisible();
});

it('reports partial association saves and retries failed associations while guarding busy Escape', async () => {
  const row={id:1,fullCode:'CODE',origin:'planned',status:'active',sourceFiles:[],outlinedFiles:[],currentBomUsage:[],readOnly:false};
  let resolve!:()=>void;
  const api={searchDrawings:vi.fn().mockResolvedValue({items:[row],total:1}),listDictionaries:vi.fn().mockResolvedValue([]),getDrawing:vi.fn().mockResolvedValue(row),searchPdfFiles:vi.fn().mockResolvedValue({items:[{id:8,fileName:'source.pdf'},{id:9,fileName:'outlined.pdf'}]}),associateDrawingPdf:vi.fn().mockImplementationOnce(()=>new Promise<void>(r=>{resolve=r;})).mockRejectedValueOnce(new Error('failed')).mockResolvedValue(row)};
  render(<DrawingLibraryPage api={api as never}/>);
  fireEvent.click(await screen.findByRole('button',{name:'CODE'}));
  fireEvent.click(await screen.findByRole('button',{name:'改变产品所属'}));
  await waitFor(()=>expect(screen.getByLabelText('现有 PDF 索引')).toHaveValue('8'));
  fireEvent.click(screen.getByRole('button',{name:'关联为源文件'}));
  fireEvent.change(screen.getByLabelText('现有 PDF 索引'),{target:{value:'9'}});
  fireEvent.click(screen.getByRole('button',{name:'关联为转曲后文件'}));
  fireEvent.click(screen.getByRole('button',{name:'保存并返回详情'}));
  fireEvent.keyDown(screen.getByRole('complementary',{name:'图号详情'}),{key:'Escape'});
  expect(screen.getByRole('complementary',{name:'图号详情'})).toBeVisible();
  await act(async()=>resolve());
  expect(await screen.findByRole('alert')).toHaveTextContent('已保存 1 项，1 项失败');
  fireEvent.click(screen.getByRole('button',{name:'保存并返回详情'}));
  await waitFor(()=>expect(api.associateDrawingPdf).toHaveBeenCalledTimes(3));
  expect(api.associateDrawingPdf.mock.calls).toEqual([[1,8,'source'],[1,9,'outlined'],[1,9,'outlined']]);
});

it('ignores scope and record changes during a save, then allows navigation after the save completes', async () => {
  const row={id:1,fullCode:'CODE',origin:'planned',status:'active',sourceFiles:[],outlinedFiles:[],currentBomUsage:[],readOnly:false};
  const other={...row,id:2,fullCode:'OTHER'};
  let resolve!:()=>void;
  const api={searchDrawings:vi.fn().mockResolvedValue({items:[row,other],total:2}),listDictionaries:vi.fn().mockResolvedValue([]),getDrawing:vi.fn().mockImplementation((id:number)=>Promise.resolve(id===1?row:other)),searchPdfFiles:vi.fn().mockResolvedValue({items:[{id:8,fileName:'source.pdf'},{id:9,fileName:'outlined.pdf'}]}),associateDrawingPdf:vi.fn().mockImplementationOnce(()=>new Promise<void>(r=>{resolve=r;})).mockResolvedValue(row)};
  render(<DrawingLibraryPage api={api as never}/>);
  fireEvent.click(await screen.findByRole('button',{name:'CODE'}));
  fireEvent.click(await screen.findByRole('button',{name:'改变产品所属'}));
  await waitFor(()=>expect(screen.getByLabelText('现有 PDF 索引')).toHaveValue('8'));
  fireEvent.click(screen.getByRole('button',{name:'关联为源文件'}));
  fireEvent.change(screen.getByLabelText('现有 PDF 索引'),{target:{value:'9'}});
  fireEvent.click(screen.getByRole('button',{name:'关联为转曲后文件'}));
  fireEvent.click(screen.getByRole('button',{name:'保存并返回详情'}));
  fireEvent.click(screen.getByRole('button',{name:'未关联图号'}));
  fireEvent.click(screen.getByRole('button',{name:'OTHER'}));
  expect(api.searchDrawings).toHaveBeenCalledTimes(1);
  expect(api.getDrawing).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button',{name:'保存并返回详情'})).toBeDisabled();
  await act(async()=>resolve());
  await waitFor(()=>expect(screen.getByRole('button',{name:'改变产品所属'})).toBeEnabled());
  expect(api.associateDrawingPdf.mock.calls).toEqual([[1,8,'source'],[1,9,'outlined']]);
  fireEvent.click(screen.getByRole('button',{name:'未关联图号'}));
  await waitFor(()=>expect(api.searchDrawings).toHaveBeenLastCalledWith(expect.objectContaining({associationState:'unassociated'})));
  fireEvent.click(await screen.findByRole('button',{name:'OTHER'}));
  await waitFor(()=>expect(api.getDrawing).toHaveBeenLastCalledWith(2));
});

it('does not hide concrete file facts when the selected product context changes', async () => {
  const sourceA={pdfIndexId:1,fileName:'source-A.pdf',relativePath:'A/source.pdf',isPresent:true,conversionType:'source'};
  const unbatchedA={...sourceA,pdfIndexId:3,fileName:'unbatched-A.pdf'};
  const outlinedB={...sourceA,pdfIndexId:2,fileName:'outlined-B.pdf',relativePath:'B/outlined.pdf',conversionType:'outlined'};
  const row={id:1,productId:1,fullCode:'CODE',origin:'planned',status:'active',sourceFiles:[sourceA,unbatchedA],outlinedFiles:[outlinedB],currentBomUsage:[],batchUsage:{effectiveCurrentFileIds:[1,2],occurrences:[{batchId:7,productId:1,productDirectory:'A',batchName:'A批次',usageState:'current',files:[sourceA]},{batchId:8,productId:2,productDirectory:'B',batchName:'B批次',usageState:'current',files:[outlinedB]}]}};
  const api={searchDrawings:vi.fn().mockResolvedValue({items:[row],total:1}),listDictionaries:vi.fn().mockResolvedValue([]),listProducts:vi.fn().mockResolvedValue([{id:2,sku:'B',model:'ModelB',productCategory:'产品'}]),listMaterialBatches:vi.fn().mockResolvedValue([]),getDrawingNavigation:vi.fn().mockResolvedValue({batches:[]}),getDrawing:vi.fn().mockResolvedValue(row)};
  render(<DrawingLibraryPage api={api as never}/>);
  fireEvent.click(await screen.findByRole('button',{name:'展开产品 ModelB'}));
  fireEvent.click(screen.getByRole('button',{name:'产品 ModelB'}));
  fireEvent.click(await screen.findByRole('button',{name:'CODE'}));
  expect(await screen.findByText('outlined-B.pdf')).toBeVisible();
  expect(screen.getByText('source-A.pdf')).toBeVisible();
  expect(screen.getByText('unbatched-A.pdf')).toBeVisible();
  expect(screen.queryByLabelText('查看资料批次')).toBeNull();
  expect(screen.getByText('source-A.pdf').closest('li')).toHaveAttribute('data-usage-state','current');

});

it('clears manual drawing filters while retaining the selected category and refreshes navigation counts', async () => {
  const counts={total:24,categories:[{name:'冰柜',count:24}],products:[{productId:5,count:24}],batches:[],unassociated:2,recycle:1};
  const api={searchDrawings:vi.fn().mockResolvedValue({items:[],total:0}),listDictionaries:vi.fn().mockResolvedValue([]),listProducts:vi.fn().mockResolvedValue([{id:5,sku:'SKU',model:'T40',productCategory:'冰柜'}]),getDrawingNavigation:vi.fn().mockResolvedValue({batches:[]}),getDrawingNavigationCounts:vi.fn().mockResolvedValue(counts)};
  render(<DrawingLibraryPage api={api as never}/>);
  const category=await screen.findByRole('button',{name:'分类 冰柜'});
  await waitFor(()=>expect(within(category).getByLabelText('24 个图号')).toBeVisible());
  fireEvent.click(category);
  await waitFor(()=>expect(screen.getByRole('button',{name:'查询'})).toBeEnabled());
  fireEvent.change(screen.getByLabelText('关键词'),{target:{value:'BOX'}});
  fireEvent.click(screen.getByRole('button',{name:'查询'}));
  await waitFor(()=>expect(api.searchDrawings).toHaveBeenLastCalledWith(expect.objectContaining({navigationProductCategory:'冰柜',keyword:'BOX'})));
  await waitFor(()=>expect(api.getDrawingNavigationCounts).toHaveBeenLastCalledWith(expect.objectContaining({keyword:'BOX'})));
  fireEvent.click(screen.getByRole('button',{name:'清除筛选'}));
  await waitFor(()=>expect(api.searchDrawings).toHaveBeenLastCalledWith(expect.objectContaining({navigationProductCategory:'冰柜',keyword:''})));
  expect(screen.getByRole('button',{name:'分类 冰柜'})).toHaveAttribute('aria-current','page');
});

it('does not use the current page total as navigation counts when server counts are unavailable', async () => {
  render(<DrawingLibraryPage api={{searchDrawings:vi.fn().mockResolvedValue({items:[],total:200}),listDictionaries:vi.fn().mockResolvedValue([])} as never}/>);
  const all=await screen.findByRole('button',{name:'全部图号'});
  expect(within(all).getByLabelText('数量暂不可用')).toHaveTextContent('—');
  expect(within(all).queryByText('200')).not.toBeInTheDocument();
});


it.each(['planned','historical'] as const)('refreshes filtered records and navigation counts after %s status changes while preserving scope and scroll', async origin => {
  let changed=false;
  const row={id:1,fullCode:'STATUS-CODE',origin,status:'active',sourceFiles:[],outlinedFiles:[],currentBomUsage:[],readOnly:origin==='historical'};
  const api={listDictionaries:vi.fn().mockResolvedValue([]),listProducts:vi.fn().mockResolvedValue([{id:5,sku:'SKU',model:'T40',productCategory:'冰柜'}]),searchDrawings:vi.fn().mockImplementation(()=>Promise.resolve({items:changed?[{...row,id:2,fullCode:'REMAINING-CODE'}]:[row],total:changed?1:2})),getDrawingNavigationCounts:vi.fn().mockImplementation(()=>Promise.resolve({total:changed?1:2,categories:[],products:[],batches:[],unassociated:0})),getDrawing:vi.fn().mockImplementation(()=>Promise.resolve({...row,status:changed?(origin==='historical'?'inactive':'voided'):'active'})),voidDrawing:vi.fn().mockImplementation(()=>{changed=true;return Promise.resolve();}),deactivateHistoricalDrawing:vi.fn().mockImplementation(()=>{changed=true;return Promise.resolve();})};
  vi.spyOn(window,'confirm').mockReturnValue(true);
  render(<DrawingLibraryPage api={api as never}/>);
  fireEvent.click(await screen.findByRole('button',{name:'分类 冰柜'}));
  await waitFor(()=>expect(screen.getByRole('button',{name:'查询'})).toBeEnabled());
  fireEvent.change(screen.getByLabelText('状态'),{target:{value:'active'}});
  fireEvent.click(screen.getByRole('button',{name:'查询'}));
  fireEvent.change(screen.getByLabelText('关键词'),{target:{value:'UNAPPLIED-DRAFT'}});
  const scrollRegion=screen.getByRole('table').parentElement!; scrollRegion.scrollTop=120;
  fireEvent.click(await screen.findByRole('button',{name:'STATUS-CODE'}));
  fireEvent.click(await screen.findByRole('button',{name:'改变产品所属'}));
  fireEvent.change(await screen.findByRole('combobox',{name:'图号业务状态'}),{target:{value:'inactive'}});
  await waitFor(()=>expect(within(screen.getByRole('button',{name:'全部图号'})).getByLabelText('1 个图号')).toBeVisible());
  expect(api.searchDrawings).toHaveBeenLastCalledWith(expect.objectContaining({page:1,status:'active',navigationProductCategory:'冰柜',keyword:''}));
  expect(within(screen.getByRole('table')).queryByRole('button',{name:'STATUS-CODE'})).not.toBeInTheDocument();
  expect(screen.getByRole('table').parentElement).toBe(scrollRegion);
  expect(scrollRegion.scrollTop).toBe(120);
  expect(screen.getByRole('complementary',{name:'图号详情'})).toHaveTextContent('STATUS-CODE');
});

it('refreshes source-presence results and counts after saving PDF associations', async()=>{
  let saved=false;
  const row={id:1,fullCode:'SOURCE-CODE',origin:'planned',status:'active',sourceFiles:[],outlinedFiles:[],currentBomUsage:[],readOnly:false};
  const api={listDictionaries:vi.fn().mockResolvedValue([]),searchDrawings:vi.fn().mockImplementation(()=>Promise.resolve({items:saved?[]:[row],total:saved?0:1})),getDrawingNavigationCounts:vi.fn().mockImplementation(()=>Promise.resolve({total:saved?0:1,categories:[],products:[],batches:[],unassociated:0})),getDrawing:vi.fn().mockResolvedValue(row),searchPdfFiles:vi.fn().mockResolvedValue({items:[{id:8,fileName:'source.pdf'}]}),associateDrawingPdf:vi.fn().mockImplementation(()=>{saved=true;return Promise.resolve();})};
  render(<DrawingLibraryPage api={api as never}/>);
  await screen.findByRole('button',{name:'SOURCE-CODE'});
  fireEvent.click(screen.getByRole('button',{name:'更多筛选'}));
  fireEvent.change(screen.getByLabelText('源文件'),{target:{value:'missing'}});
  fireEvent.click(screen.getByRole('button',{name:'查询'}));
  await waitFor(()=>expect(screen.getByRole('button',{name:'查询'})).toBeEnabled());
  fireEvent.click(screen.getByRole('button',{name:'SOURCE-CODE'}));
  fireEvent.click(await screen.findByRole('button',{name:'改变产品所属'}));
  await waitFor(()=>expect(screen.getByLabelText('现有 PDF 索引')).toHaveValue('8'));
  fireEvent.click(screen.getByRole('button',{name:'关联为源文件'}));
  fireEvent.click(screen.getByRole('button',{name:'保存并返回详情'}));
  await waitFor(()=>expect(within(screen.getByRole('button',{name:'全部图号'})).getByLabelText('0 个图号')).toBeVisible());
  expect(api.searchDrawings).toHaveBeenLastCalledWith(expect.objectContaining({sourcePresence:'missing'}));
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  expect(screen.getByRole('button',{name:'改变产品所属'})).toBeEnabled();
});

it('refreshes counts after a successful status mutation even when the detail reload fails', async()=>{
  let changed=false;
  const row={id:1,fullCode:'DETAIL-FAILURE',origin:'planned',status:'active',sourceFiles:[],outlinedFiles:[],currentBomUsage:[],readOnly:true};
  const api={listDictionaries:vi.fn().mockResolvedValue([]),searchDrawings:vi.fn().mockImplementation(()=>Promise.resolve({items:changed?[]:[row],total:changed?0:1})),getDrawingNavigationCounts:vi.fn().mockImplementation(()=>Promise.resolve({total:changed?0:1,categories:[],products:[],batches:[],unassociated:0})),getDrawing:vi.fn().mockResolvedValueOnce(row).mockRejectedValueOnce(new Error('详情刷新失败')),voidDrawing:vi.fn().mockImplementation(()=>{changed=true;return Promise.resolve();})};
  vi.spyOn(window,'confirm').mockReturnValue(true);
  render(<DrawingLibraryPage api={api as never}/>);
  fireEvent.click(await screen.findByRole('button',{name:row.fullCode}));
  fireEvent.click(await screen.findByRole('button',{name:'改变产品所属'}));
  fireEvent.change(screen.getByRole('combobox',{name:'图号业务状态'}),{target:{value:'inactive'}});
  await waitFor(()=>expect(within(screen.getByRole('button',{name:'全部图号'})).getByLabelText('0 个图号')).toBeVisible());
  expect(screen.getByRole('alert')).toHaveTextContent('详情刷新失败');
});

it('retains the table and draft while reactivating the applied query without page controls',async()=>{
 const row={id:90,fullCode:'STABLE-CODE',origin:'planned',status:'active',model:'T40',productId:5};
 const api={listDictionaries:vi.fn().mockResolvedValue([]),searchDrawings:vi.fn().mockResolvedValue({items:[row],total:1})};
 const rendered=render(<DrawingLibraryPage api={api as never}/>);
 await screen.findByRole('button',{name:'STABLE-CODE'});const table=screen.getByRole('table');
 expect(within(table).getAllByRole('columnheader')).toHaveLength(8);
 fireEvent.change(screen.getByLabelText('关键词'),{target:{value:'未提交'}});
 rendered.rerender(<DrawingLibraryPage api={api as never} active={false}/>);rendered.rerender(<DrawingLibraryPage api={api as never} active/>);
 await waitFor(()=>expect(screen.getByRole('table')).toBe(table));
 expect(api.searchDrawings).toHaveBeenLastCalledWith(expect.objectContaining({page:1,pageSize:50,keyword:''}));
 expect(screen.getByLabelText('关键词')).toHaveValue('未提交');
 expect(screen.queryByLabelText('每页条数')).not.toBeInTheDocument();
 expect(screen.queryByLabelText('图号分页')).not.toBeInTheDocument();
});

it('keeps the last rapidly selected product result when the earlier request resolves later',async()=>{
  let resolveFirst!:(value:unknown)=>void;
  const api={listDictionaries:vi.fn().mockResolvedValue([]),listProducts:vi.fn().mockResolvedValue([{id:5,model:'T40',productCategory:'冰柜'},{id:6,model:'T50',productCategory:'冰柜'}]),searchDrawings:vi.fn().mockImplementation((query:{productId?:number})=>query.productId===5?new Promise(resolve=>{resolveFirst=resolve;}):Promise.resolve({items:query.productId===6?[{id:72,fullCode:'SECOND-PRODUCT',origin:'planned',status:'active'}]:[],total:query.productId===6?1:0}))};
  render(<DrawingLibraryPage api={api as never}/>);
  fireEvent.click(await screen.findByRole('button',{name:'产品 T40'}));
  fireEvent.click(screen.getByRole('button',{name:'产品 T50'}));
  await screen.findByRole('button',{name:'SECOND-PRODUCT'});
  await act(async()=>resolveFirst({items:[{id:71,fullCode:'STALE-FIRST',origin:'planned',status:'active'}],total:1}));
  expect(screen.getByRole('button',{name:'SECOND-PRODUCT'})).toBeVisible();expect(screen.queryByRole('button',{name:'STALE-FIRST'})).not.toBeInTheDocument();
});

it('uses four compact groups and corrects product ownership without independent appearance controls', async () => {
  const record = { id: 7, fullCode: '02.0209.010.0501007', origin: 'planned', status: 'active', productId: 3, sku: 'SKT40', model: 'T40', brandName: '品牌', productCategory: '空气炸锅', displayName: '说明书', readOnly: true, sourceFiles: [], outlinedFiles: [], currentBomUsage: [], associationHistory: [] };
  const api = { searchDrawings: vi.fn().mockResolvedValue({items: [record], total: 1}), listDictionaries: vi.fn().mockResolvedValue([]), listProducts: vi.fn().mockResolvedValue([{id:3,model:'T40',sku:'SKT40',productCategory:'空气炸锅'}]), getDrawing: vi.fn().mockResolvedValue(record), correctDrawingAssociation: vi.fn().mockResolvedValue({updated:1}) };
  render(<DrawingLibraryPage api={api as never}/>);
  fireEvent.click(await screen.findByRole('button',{name:record.fullCode}));
  const panel = await screen.findByRole('complementary',{name:'图号详情'});
  for(const name of ['01 基础信息','02 文件信息','03 BOM关联','04 状态与操作']) expect(within(panel).getByRole('heading',{name})).toBeInTheDocument();
  expect(within(panel).queryByText(/关联修正记录/)).not.toBeInTheDocument();
  expect(within(panel).queryByText('外观版本')).not.toBeInTheDocument();
  fireEvent.click(within(panel).getByRole('button',{name:'改变产品所属'}));
  expect(within(panel).queryByLabelText('关联外观版本')).not.toBeInTheDocument();
  fireEvent.change(within(panel).getByLabelText('关联修正原因'),{target:{value:'核对产品档案'}});
  fireEvent.click(within(panel).getByRole('button',{name:'确认修正关联'}));
  await waitFor(()=>expect(api.correctDrawingAssociation).toHaveBeenCalledWith({signedId:7,productId:3,appearanceVersionId:null,reason:'核对产品档案',confirmed:true}));
});

it('displays confirmed before/after counts from a real association response and refreshes the list',async()=>{
  const before={historicalTotal:8,historicalAssociated:2,plannedTotal:3,plannedAssociated:3,ready:1,automaticReady:0,ambiguous:1,conflicts:0,missingProduct:4};
  const after={...before,historicalAssociated:3,ready:0};
  const api={listDictionaries:vi.fn().mockResolvedValue([]),searchDrawings:vi.fn().mockResolvedValue({items:[],total:0}),previewDrawingAssociations:vi.fn().mockResolvedValue({fingerprint:'snapshot',summary:before,records:[{signedId:-2,fullCode:'02.0209.010.0501002',state:'ready',evidence:['人工核验产品'],targets:[{signedId:-2,productId:3,appearanceVersionId:null}]}]}),confirmDrawingAssociations:vi.fn().mockResolvedValue({updated:1,before,after})};
  render(<DrawingLibraryPage api={api as never}/>);
  fireEvent.click(screen.getByRole('button',{name:'诊断图号关联'}));
  await screen.findByText(/历史图号已关联 2 \/ 8/);
  fireEvent.click(screen.getByRole('button',{name:'人工确认候选关联'}));
  await waitFor(()=>expect(api.confirmDrawingAssociations).toHaveBeenCalledWith(expect.objectContaining({fingerprint:'snapshot',targets:[{signedId:-2,productId:3,appearanceVersionId:null}]})));
  expect(await screen.findByRole('status')).toHaveTextContent('历史已关联 2 → 3 / 8');
  expect(api.searchDrawings.mock.calls.length).toBeGreaterThan(1);
});

it('offers direct classification without a second preview confirmation and reports failures visibly',async()=>{
 const api={listDictionaries:vi.fn().mockResolvedValue([]),searchDrawings:vi.fn().mockResolvedValue({items:[],total:0}),classifyDrawingAssociations:vi.fn().mockRejectedValue(new Error('备份目录不可写，未保存归类'))};
 render(<DrawingLibraryPage api={api as never}/>);
 fireEvent.click(screen.getByRole('button',{name:'自动归类'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('备份目录不可写，未保存归类');
 expect(api.classifyDrawingAssociations).toHaveBeenCalledWith({});
});

it('updates an already-open drawing detail after direct classification',async()=>{
 const record={id:-7,fullCode:'02.0209.010.0501007',origin:'historical',status:'active',productId:null,model:null,readOnly:true,sourceFiles:[],outlinedFiles:[],currentBomUsage:[],associationHistory:[]};
 const api={listDictionaries:vi.fn().mockResolvedValue([]),searchDrawings:vi.fn().mockResolvedValue({items:[record],total:1}),getDrawing:vi.fn().mockResolvedValueOnce(record).mockResolvedValue({...record,productId:3,model:'CLASSIFIED-T40'}),classifyDrawingAssociations:vi.fn().mockResolvedValue({updated:1})};
 render(<DrawingLibraryPage api={api as never}/>);
 fireEvent.click(await screen.findByRole('button',{name:record.fullCode}));
 const panel=await screen.findByRole('complementary',{name:'图号详情'});
 fireEvent.click(screen.getByRole('button',{name:'自动归类'}));
 await waitFor(()=>expect(within(panel).getByText('CLASSIFIED-T40')).toBeInTheDocument());
});

it.each(['active','inactive'])('shows four compact groups and an actionable release check for historical %s',async status=>{
 const record={id:-7,fullCode:'02.0209.010.0501007',origin:'historical',status,readOnly:true,sourceFiles:[{pdfIndexId:9,fileName:'very-long-file.pdf',relativePath:'secret/path/very-long-file.pdf',isPresent:true,conversionType:'source'}],outlinedFiles:[],currentBomUsage:[],firstOccurrenceBatch:{id:1,name:'00.首批大货'},firstBom:null};
 const api={listDictionaries:vi.fn().mockResolvedValue([]),searchDrawings:vi.fn().mockResolvedValue({items:[record],total:1}),getDrawing:vi.fn().mockResolvedValue(record),getDrawingDeletionPreview:vi.fn().mockResolvedValue({origin:'historical',fullCode:record.fullCode,deletable:true,blockers:[],references:{},releaseEligible:false,releaseBlockers:[{kind:'historical_occupation',message:'该图号存在历史扫描占用记录，无法释放号码'}]})};
 render(<DrawingLibraryPage api={api as never}/>);fireEvent.click(await screen.findByRole('button',{name:record.fullCode}));
 const panel=await screen.findByRole('complementary',{name:'图号详情'});
 for(const name of ['01 基础信息','02 文件信息','03 BOM关联','04 状态与操作'])expect(within(panel).getByRole('heading',{name})).toBeInTheDocument();
 expect(within(panel).queryByText('关联维护')).not.toBeInTheDocument();expect(within(panel).queryByText('查看路径')).not.toBeInTheDocument();
 expect(within(panel).getByText('very-long-file.pdf')).toHaveAttribute('title','very-long-file.pdf');
 expect(within(panel).getByText('未找到对应文件索引，尚未核验磁盘')).toBeInTheDocument();
 expect(within(panel).queryByText('出现批次')).toBeNull();expect(within(panel).queryByText('首批大货')).toBeNull();expect(within(panel).getByText('未进入 BOM')).toBeInTheDocument();
 fireEvent.click(within(panel).getByRole('button',{name:'取消占号并删除'}));
 expect(await within(panel).findByText(/该图号存在历史扫描占用记录/)).toBeInTheDocument();
 expect(api.getDrawingDeletionPreview).toHaveBeenCalledWith(-7);
});

it('reactivates with the submitted query while preserving unsubmitted filter input',async()=>{
 const api={listDictionaries:vi.fn().mockResolvedValue([]),searchDrawings:vi.fn().mockImplementation(async (_query:Record<string,unknown>)=>({items:[],total:0}))};
 const view=render(<DrawingLibraryPage api={api as never}/>);
 await waitFor(()=>expect(api.searchDrawings).toHaveBeenCalled());
 fireEvent.change(screen.getByLabelText('关键词'),{target:{value:'submitted'}});
 fireEvent.click(screen.getByRole('button',{name:'查询'}));
 await waitFor(()=>expect(api.searchDrawings).toHaveBeenLastCalledWith(expect.objectContaining({keyword:'submitted'})));
 fireEvent.change(screen.getByLabelText('关键词'),{target:{value:'draft-only'}});
 view.rerender(<DrawingLibraryPage api={api as never} active={false}/>);
 view.rerender(<DrawingLibraryPage api={api as never} active/>);
 await waitFor(()=>expect(screen.getByLabelText('关键词')).toHaveValue('draft-only'));
 expect(api.searchDrawings.mock.calls.some(([query])=>query.keyword==='draft-only')).toBe(false);
});

it('keeps a reserved number distinct until the user explicitly marks it in use',async()=>{
 const record={id:5,fullCode:'RESERVED-ONLY',origin:'planned',status:'reserved',sourceFiles:[],outlinedFiles:[],currentBomUsage:[],readOnly:false};
 const api={listDictionaries:vi.fn().mockResolvedValue([]),searchDrawings:vi.fn().mockResolvedValue({items:[record],total:1}),getDrawing:vi.fn().mockResolvedValue(record),activateDrawing:vi.fn().mockResolvedValue({...record,status:'active'})};
 vi.spyOn(window,'confirm').mockReturnValue(true);
 render(<DrawingLibraryPage api={api as never}/>);fireEvent.click(await screen.findByRole('button',{name:record.fullCode}));
 const selector=await screen.findByRole('combobox',{name:'图号业务状态'});
 expect(selector).toHaveValue('inactive');
 fireEvent.change(selector,{target:{value:'active'}});
 await waitFor(()=>expect(api.activateDrawing).toHaveBeenCalledWith(5));
});

it('refreshes saved classification counts even when the open detail reload fails',async()=>{
 let changed=false;
 const row={id:-7,fullCode:'CLASSIFY-REFRESH-FAIL',origin:'historical',status:'active',productId:null,sourceFiles:[],outlinedFiles:[],currentBomUsage:[],readOnly:true};
 const api={listDictionaries:vi.fn().mockResolvedValue([]),listProducts:vi.fn().mockResolvedValue([{id:3,sku:'SKU',model:'T40',productCategory:'冰柜'}]),searchDrawings:vi.fn().mockResolvedValue({items:[row],total:1}),getDrawingNavigationCounts:vi.fn().mockImplementation(()=>Promise.resolve({total:1,products:[{productId:3,count:changed?1:0}],categories:[],batches:[],unassociated:changed?0:1})),getDrawing:vi.fn().mockResolvedValueOnce(row).mockRejectedValue(new Error('详情刷新失败')),classifyDrawingAssociations:vi.fn().mockImplementation(()=>{changed=true;return Promise.resolve({updated:1});})};
 render(<DrawingLibraryPage api={api as never}/>);fireEvent.click(await screen.findByRole('button',{name:row.fullCode}));
 await screen.findByRole('complementary',{name:'图号详情'});
 fireEvent.click(screen.getByRole('button',{name:'自动归类'}));
 await waitFor(()=>expect(within(screen.getByRole('button',{name:'产品 T40'})).getByLabelText('1 个图号')).toBeInTheDocument());
 expect(screen.getByRole('status')).toHaveTextContent('已更新 1 条关联');
 expect(await screen.findByText('详情刷新失败')).toBeInTheDocument();
});


it('shows all observed batches without scope choices and links only the exact first BOM',async()=>{
 const file=(name:string,path:string)=>({pdfIndexId:null,fileName:name,relativePath:path,isPresent:true,indexed:false});
 const section=(entries:unknown[])=>({state:'present',message:'文件存在',entries});
 const record={id:7,fullCode:'02.0209.010.0401001',origin:'planned',status:'active',productId:99,sourceFiles:[],outlinedFiles:[],currentBomUsage:[],firstBom:{id:12,productId:3,model:'原始型号',versionNumber:1,businessDate:'2026-01-02'},fileObservation:{source:section([{key:'source',batchId:null,batchName:'未转曲源文件',businessDate:null,usageState:'indeterminate',state:'present',files:[file('source.pdf','source.pdf')]}]),outlined:section([{key:'new',batchId:2,batchName:'02.20260301',businessDate:'2026-03-01',usageState:'historical',state:'present',files:[file('new.pdf','new.pdf')]},{key:'old',batchId:1,batchName:'01.20260101',businessDate:'2026-01-01',usageState:'historical',state:'present',files:[file('old.pdf','old.pdf')]}])}};
 const onNavigateBom=vi.fn();const showFileInFolder=vi.fn().mockResolvedValue({ok:true});window.plannerDesktop={showFileInFolder};
 const api={listDictionaries:vi.fn().mockResolvedValue([]),searchDrawings:vi.fn().mockResolvedValue({items:[record],total:1}),getDrawing:vi.fn().mockResolvedValue(record)};
 render(<DrawingLibraryPage api={api as never} onNavigateBom={onNavigateBom}/>);
 fireEvent.click(await screen.findByRole('button',{name:'查看 / 管理'}));
 const panel=await screen.findByRole('complementary',{name:'图号详情'});
 expect(within(panel).queryByLabelText('查看资料批次')).toBeNull();expect(within(panel).queryByLabelText('当前文件所属资料目录')).toBeNull();
 expect(within(panel).getByText('new.pdf')).toBeVisible();expect(within(panel).getByText('old.pdf')).toBeVisible();
 expect(within(panel).getAllByText('历史批次')).toHaveLength(2);expect(within(panel).queryByText('当前批次')).toBeNull();
 expect(within(panel).getByRole('heading',{name:'03 BOM关联'})).toBeVisible();expect(within(panel).queryByText('出现批次')).toBeNull();
 fireEvent.click(within(panel).getByRole('button',{name:/原始型号.*2026-01-02/}));expect(onNavigateBom).toHaveBeenCalledWith({productId:3,bomVersionId:12});
 fireEvent.click(within(panel).getByRole('button',{name:'打开转曲前文件 source.pdf 的位置'}));
 await waitFor(()=>expect(showFileInFolder).toHaveBeenCalledWith({kind:'drawing-file',origin:'planned',recordId:7,relativePath:'source.pdf'}));
 delete window.plannerDesktop;
});

it.each(['missing','unindexed','unconfigured','unavailable'] as const)('keeps confirmed source absence distinct from %s observation status',async state=>{
 const section={state,message:`source-state-${state}`,entries:[]};
 const row={id:7,fullCode:'STATE-CODE',origin:'planned',status:'active',sourceFiles:[],outlinedFiles:[],currentBomUsage:[],fileObservation:{source:section,outlined:{state:'unindexed',message:'未核验',entries:[]}}};
 const api={listDictionaries:vi.fn().mockResolvedValue([]),searchDrawings:vi.fn().mockResolvedValue({items:[row],total:1}),getDrawing:vi.fn().mockResolvedValue(row)};
 render(<DrawingLibraryPage api={api as never}/>);fireEvent.click(await screen.findByRole('button',{name:row.fullCode}));
 const panel=await screen.findByRole('complementary',{name:'图号详情'});
 expect(within(panel).getByText(`source-state-${state}`)).toBeVisible();
 expect(Boolean(within(panel).queryByText('已缺失'))).toBe(state==='missing');
 expect(within(panel).queryByRole('button',{name:/打开.*的位置/})).toBeNull();
});
it('renders a conflicting batch once and never offers an arbitrary file instance to open',async()=>{
 const files=[1,2].map(id=>({pdfIndexId:id,fileName:`conflict-${id}.pdf`,relativePath:`batch/${id}.pdf`,indexed:true,isPresent:true}));
 const row={id:7,fullCode:'CONFLICT-CODE',origin:'planned',status:'active',sourceFiles:[],outlinedFiles:[],currentBomUsage:[],fileObservation:{source:{state:'unindexed',message:'未核验',entries:[]},outlined:{state:'present',message:'文件存在',entries:[{key:'one-batch',batchId:3,batchName:'03.20260301',businessDate:'2026-03-01',usageState:'historical',state:'conflict',message:'同一批次有 2 个内容不同的文件，未选择任何实例',files}]}}};
 const api={listDictionaries:vi.fn().mockResolvedValue([]),searchDrawings:vi.fn().mockResolvedValue({items:[row],total:1}),getDrawing:vi.fn().mockResolvedValue(row)};
 render(<DrawingLibraryPage api={api as never}/>);fireEvent.click(await screen.findByRole('button',{name:row.fullCode}));
 const panel=await screen.findByRole('complementary',{name:'图号详情'});
 expect(within(panel).getAllByText('20260301')).toHaveLength(1);
 expect(within(panel).getByText('同一批次有 2 个内容不同的文件，未选择任何实例')).toBeVisible();
 expect(within(panel).queryByRole('button',{name:/打开.*的位置/})).toBeNull();
 expect(within(panel).queryByLabelText('查看资料批次')).toBeNull();
});
