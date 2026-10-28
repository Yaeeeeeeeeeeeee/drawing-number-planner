import {fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {AppShell} from '../../src/renderer/layout/AppShell';
vi.mock('../../src/renderer/pages/PlanningPage',()=>({PlanningPage:()=> <p>规划主页</p>}));
vi.mock('../../src/renderer/components/SafeRecovery',()=>({SafeRecovery:()=>null}));

function fixture(){
 const drawing={id:7,productId:99,fullCode:'02.0209.010.0401001',origin:'planned',status:'active',sourceFiles:[],outlinedFiles:[],currentBomUsage:[],firstBom:{id:12,productId:3,model:'原始型号',versionNumber:1,businessDate:'2026-01-02'}};
 const version={id:12,productId:3,model:'原始型号',versionNumber:1,previousVersionId:null,businessChangeDate:'2026-01-02',businessChangeDateLabel:'2026-01-02',createdAt:'2026-01-02T00:00:00Z',items:[],notes:null};
 const api={listDictionaries:vi.fn().mockResolvedValue([]),listProducts:vi.fn().mockResolvedValue([]),listMaterialBatches:vi.fn().mockResolvedValue([]),searchDrawings:vi.fn().mockResolvedValue({items:[drawing],total:1}),getDrawing:vi.fn().mockResolvedValue(drawing),getBomVersion:vi.fn().mockResolvedValue(version),getCurrentBom:vi.fn(),saveBomVersion:vi.fn(),listBomHistory:vi.fn(),searchPdfFiles:vi.fn().mockResolvedValue({items:[{id:21,fileName:'source.pdf',relativePath:'source.pdf'}]})};
 return{api,drawing,version};
}
async function firstBomLink(){
 fireEvent.click(screen.getByRole('button',{name:'图号库'}));
 fireEvent.click(await screen.findByRole('button',{name:'02.0209.010.0401001'}));
 return within(await screen.findByRole('complementary',{name:'图号详情'})).getByRole('button',{name:'原始型号 · 2026-01-02'});
}
it('opens the first BOM exact record and original owner through the shell without requesting current BOM',async()=>{
 const {api}=fixture();render(<AppShell api={api as never}/>);
 fireEvent.click(await firstBomLink());
 expect(await screen.findByRole('region',{name:'所选 BOM 记录'})).toHaveTextContent('BOM 记录详情');
 expect(screen.getByRole('button',{name:'查看 BOM 12'})).toBeVisible();
 expect(screen.getByRole('button',{name:'查询 BOM'})).toHaveAttribute('aria-selected','true');
 expect(api.getBomVersion).toHaveBeenCalledWith(12);
 expect(api.getCurrentBom).not.toHaveBeenCalled();expect(api.listBomHistory).not.toHaveBeenCalled();expect(api.saveBomVersion).not.toHaveBeenCalled();
});
it.each(['deleted','mismatch'] as const)('reports an invalid first BOM target (%s) without selecting another record or entering add mode',async failure=>{
 const {api,version}=fixture();
 if(failure==='deleted')api.getBomVersion.mockRejectedValue(new Error('BOM记录不存在'));
 else api.getBomVersion.mockResolvedValue({...version,id:13});
 render(<AppShell api={api as never}/>);fireEvent.click(await firstBomLink());
 expect(await screen.findByRole('alert')).toHaveTextContent(failure==='deleted'?'BOM记录不存在':'不匹配');
 expect(screen.queryByRole('region',{name:'所选 BOM 记录'})).toBeNull();
 expect(screen.getByRole('button',{name:'查询 BOM'})).toHaveAttribute('aria-selected','true');
 expect(api.getBomVersion).toHaveBeenCalledExactlyOnceWith(12);
 expect(api.getCurrentBom).not.toHaveBeenCalled();expect(api.listBomHistory).not.toHaveBeenCalled();expect(api.saveBomVersion).not.toHaveBeenCalled();
});
it('applies the drawing leave guard before first BOM navigation with staged file changes',async()=>{
 const {api}=fixture();const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
 try{
  render(<AppShell api={api as never}/>);await firstBomLink();
  fireEvent.click(screen.getByRole('button',{name:'改变产品所属'}));
  await waitFor(()=>expect(screen.getByLabelText('现有 PDF 索引')).toHaveValue('21'));
  fireEvent.click(screen.getByRole('button',{name:'关联为源文件'}));
  fireEvent.click(screen.getByRole('button',{name:'原始型号 · 2026-01-02'}));
  expect(confirm).toHaveBeenCalledWith('有未保存的图号文件关联，确认放弃？');
  expect(screen.getByRole('complementary',{name:'图号详情'})).toBeVisible();
  expect(api.getBomVersion).not.toHaveBeenCalled();
 }finally{confirm.mockRestore();}
});
