import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {it,expect,vi} from 'vitest';
import {DictionariesPage} from '../../src/renderer/pages/DictionariesPage';
it('restores an archived identity, edits its name and keeps draft input if saving fails',async()=>{
 const archived={id:8,type:'brand',code:'02',name:'验收样例',parentId:null,status:'inactive' as const,deletedAt:'2026-10-19'};
 const restored={...archived,status:'active' as const,deletedAt:null};
 const api={listDictionaries:vi.fn().mockResolvedValue([archived]),activateDictionary:vi.fn().mockResolvedValue(restored),updateDictionaryName:vi.fn().mockRejectedValueOnce(Error('暂时无法保存')).mockResolvedValueOnce({...restored,name:'恢复后修改名称'})};
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(true);
 try{
 render(<DictionariesPage api={api as never}/>);
 fireEvent.click(await screen.findByRole('button',{name:'恢复 验收样例'}));
 expect(confirm).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'确认恢复'}));
 await waitFor(()=>expect(screen.queryByRole('button',{name:'恢复 验收样例'})).toBeNull());
 fireEvent.click(screen.getByRole('button',{name:'修改 验收样例'}));
 const input=screen.getByLabelText('修改名称');expect(input).toBeEnabled();expect(input).not.toHaveAttribute('readonly');
 expect(screen.getByLabelText('编码')).toBeDisabled();
 input.focus();fireEvent.change(input,{target:{value:'恢复后修改名称'}});expect(input).toHaveFocus();
 fireEvent.click(screen.getByRole('button',{name:'保存'}));await screen.findByText('暂时无法保存');
 expect(screen.getByLabelText('修改名称')).toBe(input);expect(input).toHaveValue('恢复后修改名称');
 await waitFor(()=>expect(screen.getByRole('button',{name:'保存'})).toBeEnabled());
 fireEvent.click(screen.getByRole('button',{name:'保存'}));
 expect(await screen.findByText('恢复后修改名称')).toBeVisible();expect(api.updateDictionaryName).toHaveBeenLastCalledWith(8,'恢复后修改名称');
 }finally{confirm.mockRestore();}
});
