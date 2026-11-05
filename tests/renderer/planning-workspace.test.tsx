import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {describe,expect,it,vi} from 'vitest';
import {PlanningPage} from '../../src/renderer/pages/PlanningPage';

import {planningApiFixture,choosePlanningProduct as chooseProduct,fillPlanningProject as fillProject,checkPlanning} from './planning-workspace-fixture';

describe('four-step planning workspace',()=>{
 it('restores an older nonwhite draft with default sharing checked and submits the same sharing decision',async()=>{
  const api=planningApiFixture();api.getPlanningDraft.mockResolvedValue({revision:7,draft:{revision:7,updatedAt:'2026-11-05T00:00:00Z',requiresCheck:true,input:{step:2,activeProductId:1,groups:[{productId:1,appearanceId:3,rows:[{clientId:'legacy',colorId:7,mainCategoryId:5,projectItemId:6}]}]}}} as never);
  render(<PlanningPage api={api as never}/>);expect(await screen.findByLabelText('第 1 行其他颜色共用白色图号')).toBeChecked();await checkPlanning();
  expect(api.previewBatchPlan).toHaveBeenCalledWith({groups:[expect.objectContaining({rows:[expect.objectContaining({shareWhite:true})]})]});
 });
 it('locks inputs and mode changes while deleting the current draft',async()=>{
  const api=planningApiFixture();let finish!:(value:never)=>void;api.deletePlanningDraft.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}) as never);
  render(<PlanningPage api={api as never}/>);await chooseProduct();await fillProject();fireEvent.click(screen.getByRole('button',{name:'删除当前草稿'}));
  await waitFor(()=>expect(api.deletePlanningDraft).toHaveBeenCalled());
  expect(screen.getByLabelText('第 1 行备注')).toBeDisabled();expect(screen.getByRole('button',{name:'批量规划'})).toBeDisabled();expect(screen.getByRole('button',{name:'删除当前草稿'})).toBeDisabled();
  await act(async()=>{finish({deleted:true,revision:10} as never);});await screen.findByText('草稿已删除，正式图号保持不变');
 });
 it('keeps a pending reservation locked when the page is hidden and reactivated',async()=>{
  const api=planningApiFixture();let finish!:(value:never)=>void;api.reserveBatchPlan.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}) as never);
  const view=render(<PlanningPage api={api as never} active/>);await chooseProduct();await fillProject();await checkPlanning();fireEvent.click(screen.getByRole('button',{name:'下一步'}));fireEvent.click(screen.getByLabelText('已核对本次占号清单'));fireEvent.click(screen.getByRole('button',{name:'确认批量占号'}));
  view.rerender(<PlanningPage api={api as never} active={false}/>);view.rerender(<PlanningPage api={api as never} active/>);
  expect(screen.getByRole('button',{name:'选择项目'})).toBeDisabled();expect(screen.getByRole('button',{name:'批量规划'})).toBeDisabled();
  await act(async()=>{finish({results:[]} as never);});expect(await screen.findByRole('heading',{name:'本次占号结果'})).toBeVisible();expect(api.reserveBatchPlan).toHaveBeenCalledTimes(1);
 });
 it('uses the returned tombstone revision after reading and deleting an absent draft',async()=>{
  const api=planningApiFixture();api.getPlanningDraft.mockResolvedValue({draft:null,revision:15} as never);
  api.deletePlanningDraft.mockResolvedValue({deleted:true,revision:17} as never);
  render(<PlanningPage api={api as never}/>);await chooseProduct();
  await waitFor(()=>expect(api.savePlanningDraft).toHaveBeenCalledWith('new',expect.anything(),15));
  await waitFor(()=>expect(screen.getByText('草稿已保存')).toBeVisible());
  fireEvent.click(screen.getByRole('button',{name:'删除当前草稿'}));await screen.findByText('草稿已删除，正式图号保持不变');
  fireEvent.change(screen.getByRole('combobox',{name:/^产品型号$/}),{target:{value:'1'}});
  await waitFor(()=>expect(api.savePlanningDraft).toHaveBeenLastCalledWith('new',expect.anything(),17));
 });
 it('checks only and writes no reservation until the full confirmation list is acknowledged',async()=>{
  const api=planningApiFixture(),open=vi.fn();render(<PlanningPage api={api as never} onOpenDrawingLibrary={open}/>);
  const steps=screen.getByRole('navigation',{name:'规划步骤'});expect(within(steps).getAllByRole('button')).toHaveLength(4);
  expect(screen.queryByText('参考旧型号')).not.toBeInTheDocument();await chooseProduct();await fillProject();
  expect(screen.queryByRole('option',{name:'01 · 其他项目'})).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'下一步'}));
  await screen.findByRole('table');expect(api.reserveBatchPlan).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'下一步'}));const confirmation=screen.getByRole('button',{name:'确认批量占号'});expect(confirmation).toBeDisabled();
  fireEvent.click(screen.getByLabelText('已核对本次占号清单'));fireEvent.click(confirmation);
  expect(await screen.findByRole('heading',{name:'本次占号结果'})).toBeVisible();fireEvent.click(screen.getByRole('button',{name:'查看 T40 图号库'}));
  expect(open).toHaveBeenCalledWith(expect.objectContaining({productId:1,drawingIds:[42],fullCodes:['02.0101.010.0201005'],initialDrawingId:42}));
 });
 it('keeps model-specific project inputs when switching models in batch mode',async()=>{
  const api=planningApiFixture();render(<PlanningPage api={api as never}/>);fireEvent.click(screen.getByRole('button',{name:'批量规划'}));
  fireEvent.click(await screen.findByRole('checkbox',{name:/SAMKYO · T40/}));fireEvent.click(screen.getByRole('checkbox',{name:/SAMKYO · T60/}));fireEvent.click(screen.getByRole('button',{name:'下一步'}));
  await fillProject();fireEvent.change(screen.getByLabelText('第 1 行备注'),{target:{value:'T40独立输入'}});
  fireEvent.click(screen.getByRole('tab',{name:'T60'}));expect(screen.getByLabelText('第 1 行备注')).toHaveValue('');
  fireEvent.change(screen.getByLabelText('第 1 行备注'),{target:{value:'T60独立输入'}});fireEvent.click(screen.getByRole('tab',{name:'T40'}));expect(screen.getByLabelText('第 1 行备注')).toHaveValue('T40独立输入');
  fireEvent.click(screen.getByRole('button',{name:'新建图号'}));await chooseProduct();expect(screen.getByLabelText('第 1 行备注')).toHaveValue('');
 });
 it('restores a persisted draft at its saved step without restoring occupation approval',async()=>{
  const api=planningApiFixture();api.getPlanningDraft.mockResolvedValue({draft:{revision:7,updatedAt:'2026-11-05T00:00:00Z',requiresCheck:true,input:{step:4,activeProductId:1,groups:[{productId:1,appearanceId:3,rows:[{clientId:'saved',mainCategoryId:5,projectItemId:6,colorId:4,notes:'已保存输入'}]}]}}} as never);
  render(<PlanningPage api={api as never}/>);expect(await screen.findByText(/草稿已恢复/)).toBeVisible();expect(screen.getByRole('button',{name:'确认批量占号'})).toBeDisabled();
  fireEvent.click(screen.getByRole('button',{name:'选择项目'}));expect(screen.getByLabelText('第 1 行备注')).toHaveValue('已保存输入');expect(api.reserveBatchPlan).not.toHaveBeenCalled();
 });
 it('retains input and shows a retry action when initial metadata fails',async()=>{
  const api=planningApiFixture();api.listProducts.mockRejectedValueOnce(new Error('产品读取失败'));render(<PlanningPage api={api as never}/>);
  expect(await screen.findByRole('alert')).toHaveTextContent('产品读取失败');fireEvent.click(screen.getByRole('button',{name:'重新加载资料'}));expect(await screen.findByRole('option',{name:/T40/})).toBeVisible();
 });
 it('does not let a late check for an older mode replace the active draft',async()=>{
  const api=planningApiFixture();let resolve!:(value:unknown)=>void;api.previewBatchPlan.mockImplementationOnce(()=>new Promise(yes=>{resolve=yes;}) as never);
  const view=render(<PlanningPage api={api as never}/>);await chooseProduct();await fillProject();fireEvent.click(screen.getByRole('button',{name:'下一步'}));
  view.rerender(<PlanningPage api={api as never} active={false}/>);view.rerender(<PlanningPage api={api as never} active/>);
  await act(async()=>{resolve({groups:[{productId:1,model:'T40',rows:[{clientId:'stale',available:true,fullCode:'99.9999.999.9999999'}]}]});});
  await waitFor(()=>expect(screen.queryByText('99.9999.999.9999999')).not.toBeInTheDocument());
 });
});
