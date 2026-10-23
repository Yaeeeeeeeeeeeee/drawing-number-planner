import {fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {DrawingLibraryPage} from '../../src/renderer/pages/DrawingLibraryPage';

it('loads drawing chunks without paging and keeps selected IDs during append',async()=>{
 const rows=Array.from({length:75},(_,i)=>({id:i+1,fullCode:`SCROLL-${i+1}`,origin:'planned',status:'reserved'}));
 const api={listDictionaries:vi.fn().mockResolvedValue([]),searchDrawings:vi.fn().mockImplementation(async(q:{page:number;pageSize:number})=>({items:rows.slice((q.page-1)*q.pageSize,q.page*q.pageSize),total:75,page:q.page,pageSize:q.pageSize}))};
 render(<DrawingLibraryPage api={api as never}/>);
 const table=await screen.findByRole('table');const root=table.parentElement!;
 expect(screen.queryByLabelText('图号分页')).not.toBeInTheDocument();
 expect(screen.queryByLabelText('每页条数')).not.toBeInTheDocument();
 fireEvent.click(screen.getByLabelText('选择图号 SCROLL-1'));
 root.scrollTop=2200;fireEvent.scroll(root);
 await waitFor(()=>expect(api.searchDrawings).toHaveBeenCalledWith(expect.objectContaining({page:2,pageSize:50})));
 await waitFor(()=>expect(within(table).getByText('SCROLL-75')).toBeInTheDocument());
 root.scrollTop=0;fireEvent.scroll(root);
 await waitFor(()=>expect(screen.getByLabelText('选择图号 SCROLL-1')).toBeChecked());
 expect(table.querySelectorAll('tbody tr').length).toBeLessThan(60);
});
