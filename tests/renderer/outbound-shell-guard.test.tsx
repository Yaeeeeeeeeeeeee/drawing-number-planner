import {useEffect,useState} from 'react';
import {fireEvent,render,screen} from '@testing-library/react';
import {describe,it,expect,vi} from 'vitest';
import {AppShell} from '../../src/renderer/layout/AppShell';
import {useConfigurationEditor} from '../../src/renderer/pages/outbound/useConfigurationEditor';
vi.mock('../../src/renderer/pages/PlanningPage',()=>({PlanningPage:()=> <p>规划主页</p>}));
vi.mock('../../src/renderer/components/SafeRecovery',()=>({SafeRecovery:()=>null}));
vi.mock('../../src/renderer/pages/OutboundPage',()=>({OutboundPage:({registerLeaveGuard}:{registerLeaveGuard:(guard:(()=>boolean)|null)=>void})=>{
 const [value,setValue]=useState<string|null>(null);
 const editor=useConfigurationEditor(value,registerLeaveGuard);
 useEffect(()=>{editor.begin('',()=>setValue(''));},[]);
 return <input aria-label="配置测试字段" value={value??''} onChange={e=>setValue(e.target.value)}/>;
}}));
describe('outbound shell leave guard',()=>{
 it('keeps the configuration and its dirty value on module navigation without asking to discard',()=>{
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
 render(<AppShell api={{} as never}/>);
 fireEvent.click(screen.getByRole('button',{name:'外发资料'}));
 const input=screen.getByLabelText('配置测试字段');
 fireEvent.change(input,{target:{value:'未保存'}});
 fireEvent.click(screen.getByRole('button',{name:'图号规划 / 更新包材'}));
 expect(confirm).not.toHaveBeenCalled();expect(input).not.toBeVisible();expect(screen.getByText('规划主页')).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'外发资料'}));
 expect(screen.getByLabelText('配置测试字段')).toBe(input);expect(input).toHaveValue('未保存');
 });
});
