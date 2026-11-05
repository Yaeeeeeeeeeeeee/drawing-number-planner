import {beforeEach,it,vi,expect} from 'vitest';
import {fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {DrawingLibraryPage} from '../../src/renderer/pages/DrawingLibraryPage';
beforeEach(()=>{localStorage.clear();vi.stubGlobal('innerWidth',1920);});
const record={id:-1,origin:'historical',fullCode:'02.0402.020.0103001',status:'active',mainCategoryCode:'04',mainCategoryName:'印刷件类',projectItemName:'说明书',colorName:'白色',readOnly:true,sourceFiles:[],outlinedFiles:[],currentBomUsage:[]};
it('replaces the placeholder version with dictionary color and keeps category/project together with stable tones',async()=>{
 localStorage.setItem('table-layout:v1:drawing-library',JSON.stringify({version:1,order:['select','code','category','origin','product','version','status','actions'],widths:{version:135}}));
 const rows=[record,{...record,id:-2,fullCode:'02.0402.020.0501002',mainCategoryCode:'05',mainCategoryName:'包装类',projectItemName:'大外箱',colorName:'未识别'}];
 const api={listDictionaries:vi.fn().mockResolvedValue([]),searchDrawings:vi.fn().mockResolvedValue({items:rows,total:2})};
 render(<DrawingLibraryPage api={api as never}/>);await screen.findByRole('button',{name:record.fullCode});
 expect(screen.queryByRole('columnheader',{name:'版本'})).not.toBeInTheDocument();expect(screen.getByRole('columnheader',{name:'颜色'})).toBeVisible();
 const category=screen.getByTitle('印刷件类 / 说明书');expect(category).toHaveTextContent('印刷件类/说明书');
 const tone=category.querySelector('.drawing-category-badge')!.getAttribute('style');expect(tone).not.toBe(screen.getByTitle('包装类 / 大外箱').querySelector('.drawing-category-badge')!.getAttribute('style'));
 fireEvent.click(screen.getByRole('button',{name:'查询'}));await waitFor(()=>expect(api.searchDrawings).toHaveBeenCalledTimes(1));
 expect(screen.getByTitle('印刷件类 / 说明书').querySelector('.drawing-category-badge')).toHaveAttribute('style',tone);
 expect(screen.getByRole('separator',{name:'调整颜色列宽'})).toHaveAttribute('aria-valuenow','135');
});
it.each(['planned','historical'] as const)('switches %s business state both ways without a history-version option',async origin=>{
 let current={...record,id:origin==='planned'?1:-1,origin,status:'active'};
 const update=(status:string)=>async()=>{current={...current,status};return current;};
 const api={listDictionaries:vi.fn().mockResolvedValue([]),searchDrawings:vi.fn().mockImplementation(async()=>({items:[current],total:1})),getDrawing:vi.fn().mockImplementation(async()=>current),activateDrawing:vi.fn(update('active')),voidDrawing:vi.fn(update('voided')),activateHistoricalDrawing:vi.fn(update('active')),deactivateHistoricalDrawing:vi.fn(update('inactive'))};
 vi.spyOn(window,'confirm').mockReturnValue(true);render(<DrawingLibraryPage api={api as never}/>);fireEvent.click(await screen.findByRole('button',{name:record.fullCode}));
 const selector=await screen.findByRole('combobox',{name:'图号业务状态'});expect(within(selector).getAllByRole('option').map(o=>o.textContent)).toEqual(['使用中','已停用']);
 fireEvent.change(selector,{target:{value:'inactive'}});await waitFor(()=>expect(selector).toHaveValue('inactive'));expect(current.status).toBe(origin==='planned'?'voided':'inactive');
 fireEvent.change(selector,{target:{value:'active'}});await waitFor(()=>expect(selector).toHaveValue('active'));expect(current.status).toBe('active');expect(current.fullCode).toBe(record.fullCode);
 fireEvent.click(screen.getByRole('button',{name:'关闭图号详情'}));fireEvent.click(screen.getByRole('button',{name:record.fullCode}));await waitFor(()=>expect(screen.getByRole('combobox',{name:'图号业务状态'})).toHaveValue('active'));
});
it('shows existing unbatched before/after PDFs without a duplicate historical-file section',async()=>{
 const source={pdfIndexId:7,fileName:'source.pdf',relativePath:'source.pdf',isPresent:true,conversionType:'source'};
 const outlined={...source,pdfIndexId:8,fileName:'outlined.pdf',conversionType:'outlined'};
 const detail={...record,sourceFiles:[source],outlinedFiles:[outlined],batchUsage:{effectiveCurrentFileIds:[],occurrences:[]}};
 const api={listDictionaries:vi.fn().mockResolvedValue([]),searchDrawings:vi.fn().mockResolvedValue({items:[record],total:1}),getDrawing:vi.fn().mockResolvedValue(detail)};
 render(<DrawingLibraryPage api={api as never}/>);fireEvent.click(await screen.findByRole('button',{name:record.fullCode}));
 const panel=await screen.findByRole('complementary',{name:'图号详情'});expect(within(panel).getByText('source.pdf')).toBeVisible();expect(within(panel).getByText('outlined.pdf')).toBeVisible();expect(within(panel).getAllByText('存在')).toHaveLength(2);expect(within(panel).queryByText('查看历史文件')).not.toBeInTheDocument();
});
