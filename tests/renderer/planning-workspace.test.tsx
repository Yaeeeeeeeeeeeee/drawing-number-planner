import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {describe,expect,it,vi} from 'vitest';
import {PlanningPage} from '../../src/renderer/pages/PlanningPage';

import {planningApiFixture,choosePlanningProduct as chooseProduct,fillPlanningProject as fillProject,checkPlanning} from './planning-workspace-fixture';

describe('four-step planning workspace',()=>{
 it('restores an older nonwhite draft with default sharing checked and submits the same sharing decision',async()=>{
  const api=planningApiFixture();api.getPlanningDraft.mockResolvedValue({revision:7,draft:{revision:7,updatedAt:'2026-11-05T00:00:00Z',requiresCheck:true,input:{step:2,activeProductId:1,groups:[{productId:1,appearanceId:3,rows:[{clientId:'legacy',colorId:7,mainCategoryId:5,projectItemId:6}]}]}}} as never);
  render(<PlanningPage api={api as never}/>);expect(await screen.findByLabelText('第 1 行独立占号')).not.toBeChecked();await checkPlanning();
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
  fireEvent.click(screen.getByRole('radio',{name:/T40/}));
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
  fireEvent.click(await screen.findByRole('checkbox',{name:/T40/}));fireEvent.click(screen.getByRole('checkbox',{name:/T60/}));fireEvent.click(screen.getByRole('button',{name:'下一步'}));
  await fillProject();fireEvent.change(screen.getByLabelText('第 1 行备注'),{target:{value:'T40独立输入'}});
  fireEvent.click(screen.getByRole('tab',{name:/T60.*未配置/}));expect(screen.getByLabelText('第 1 行备注')).toHaveValue('');
  fireEvent.change(screen.getByLabelText('第 1 行备注'),{target:{value:'T60独立输入'}});fireEvent.click(screen.getByRole('tab',{name:/T40.*已配置 1/}));expect(screen.getByLabelText('第 1 行备注')).toHaveValue('T40独立输入');
  fireEvent.click(screen.getByRole('button',{name:'新建图号'}));await chooseProduct();expect(screen.getByLabelText('第 1 行备注')).toHaveValue('');
 });
 it('restores a persisted draft at its saved step without restoring occupation approval',async()=>{
  const api=planningApiFixture();api.getPlanningDraft.mockResolvedValue({draft:{revision:7,updatedAt:'2026-11-05T00:00:00Z',requiresCheck:true,input:{step:4,activeProductId:1,groups:[{productId:1,appearanceId:3,rows:[{clientId:'saved',mainCategoryId:5,projectItemId:6,colorId:4,notes:'已保存输入'}]}]}}} as never);
  render(<PlanningPage api={api as never}/>);expect(await screen.findByText(/草稿已恢复/)).toBeVisible();expect(screen.getByRole('button',{name:'确认批量占号'})).toBeDisabled();
  fireEvent.click(screen.getByRole('button',{name:'选择项目'}));expect(screen.getByLabelText('第 1 行备注')).toHaveValue('已保存输入');expect(api.reserveBatchPlan).not.toHaveBeenCalled();
 });
 it('retains input and shows a retry action when initial metadata fails',async()=>{
  const api=planningApiFixture();api.listProducts.mockRejectedValueOnce(new Error('产品读取失败'));render(<PlanningPage api={api as never}/>);
  expect(await screen.findByRole('alert')).toHaveTextContent('产品读取失败');fireEvent.click(screen.getByRole('button',{name:'重新加载资料'}));expect(await screen.findByRole('radio',{name:/T40/})).toBeVisible();
 });
 it('does not let a late check for an older mode replace the active draft',async()=>{
  const api=planningApiFixture();let resolve!:(value:unknown)=>void;api.previewBatchPlan.mockImplementationOnce(()=>new Promise(yes=>{resolve=yes;}) as never);
  const view=render(<PlanningPage api={api as never}/>);await chooseProduct();await fillProject();fireEvent.click(screen.getByRole('button',{name:'下一步'}));
  view.rerender(<PlanningPage api={api as never} active={false}/>);view.rerender(<PlanningPage api={api as never} active/>);
  await act(async()=>{resolve({groups:[{productId:1,model:'T40',rows:[{clientId:'stale',available:true,fullCode:'99.9999.999.9999999'}]}]});});
  await waitFor(()=>expect(screen.queryByText('99.9999.999.9999999')).not.toBeInTheDocument());
 });
});

describe('three-step batch planning',()=>{
 it('reruns checks for an old step four draft, requires fresh confirmation and preserves skipped rows',async()=>{
  const api=planningApiFixture();
  api.getPlanningDraft.mockImplementation(async mode=>mode==='batch'?{revision:7,draft:{revision:7,requiresCheck:true,input:{step:4,activeProductId:1,groups:[{productId:1,appearanceId:3,appearanceVersionId:30,rows:[{clientId:'valid',mainCategoryId:5,projectItemId:6,colorId:4},{clientId:'incomplete',mainCategoryId:5,projectItemId:8,notes:'保留未通过备注'}]}]}}}:{revision:0,draft:null});
  render(<PlanningPage api={api as never}/>);fireEvent.click(screen.getByRole('button',{name:'批量规划'}));
  const steps=screen.getByRole('navigation',{name:'规划步骤'});
  expect(within(steps).getAllByRole('button')).toHaveLength(3);
  expect(screen.queryByRole('button',{name:'上一步'})).not.toBeInTheDocument();
  await screen.findByText('可占用',{exact:true});
  expect(within(steps).getByRole('button',{name:'检查与确认占号'})).toHaveAttribute('aria-current','step');
  expect(api.previewBatchPlan).toHaveBeenCalledWith({groups:[expect.objectContaining({appearanceVersionId:30,rows:[expect.objectContaining({clientId:'valid'}),expect.objectContaining({clientId:'incomplete'})]})]});
  fireEvent.click(screen.getByRole('checkbox',{name:'仅看未通过'}));
  expect(screen.queryByText('可占用',{exact:true})).not.toBeInTheDocument();
  const confirmation=screen.getByRole('button',{name:'确认批量占号'});
  expect(confirmation).toBeDisabled();
  fireEvent.click(screen.getByLabelText('已核对本次占号清单'));fireEvent.click(confirmation);
  await screen.findByRole('heading',{name:'本次占号结果'});
  expect(api.reserveBatchPlan).toHaveBeenCalledWith({confirmed:true,groups:[expect.objectContaining({rows:[expect.objectContaining({clientId:'valid'})]})]});
  await waitFor(()=>expect(api.savePlanningDraft).toHaveBeenLastCalledWith('batch',expect.objectContaining({step:3,groups:[expect.objectContaining({appearanceVersionId:30,rows:[expect.objectContaining({clientId:'incomplete',notes:'保留未通过备注'})]})]}),7));
 });

 it('imports only the selected real template category and project and copies to chosen model IDs',async()=>{
  const api=planningApiFixture();render(<PlanningPage api={api as never}/>);fireEvent.click(screen.getByRole('button',{name:'批量规划'}));
  expect(screen.queryByRole('button',{name:'删除当前草稿'})).not.toBeInTheDocument();
  fireEvent.click(await screen.findByRole('checkbox',{name:/T40/}));fireEvent.click(screen.getByRole('checkbox',{name:/T60/}));
  fireEvent.change(screen.getByLabelText('统一外观'),{target:{value:'12'}});fireEvent.click(screen.getByRole('button',{name:'应用至已选型号'}));
  expect(screen.getByLabelText('T40 外观')).toHaveValue('12');expect(screen.getByLabelText('T60 外观')).toHaveValue('12');
  fireEvent.click(screen.getByRole('button',{name:'下一步'}));
  fireEvent.click(screen.getByRole('button',{name:'从包材模板导入'}));
  const template=await screen.findByRole('combobox',{name:'包材模板'});fireEvent.change(template,{target:{value:'51'}});fireEvent.click(screen.getByRole('button',{name:'导入项目'}));
  expect(api.packaging.getCatalog).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('第 1 行主类别')).toHaveValue('5');expect(screen.getByLabelText('第 1 行项目明细')).toHaveValue('8');expect(screen.getByLabelText('第 1 行颜色')).toHaveValue('');expect(screen.getByLabelText('第 1 行备注')).toHaveValue('');
  fireEvent.change(screen.getByLabelText('第 1 行颜色'),{target:{value:'4'}});
  fireEvent.click(screen.getByRole('button',{name:'复制到其他型号'}));fireEvent.click(screen.getByRole('checkbox',{name:'T60'}));fireEvent.click(screen.getByRole('button',{name:'复制项目'}));
  fireEvent.click(screen.getByRole('tab',{name:/T60.*已配置 1/}));expect(screen.getByLabelText('第 1 行项目明细')).toHaveValue('8');expect(screen.getByLabelText('第 1 行颜色')).toHaveValue('4');
  expect(api.reserveBatchPlan).not.toHaveBeenCalled();
 });
});

it('hides redundant white sharing controls for white projects and exposes independent numbering only for nonwhite',async()=>{
 const api=planningApiFixture();render(<PlanningPage api={api as never}/>);await chooseProduct();fillProject();
 expect(screen.queryByLabelText('第 1 行其他颜色共用白色图号')).not.toBeInTheDocument();expect(screen.queryByLabelText('第 1 行独立占号')).not.toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('第 1 行颜色'),{target:{value:'7'}});expect(screen.getByLabelText('第 1 行独立占号')).not.toBeChecked();
 fireEvent.click(screen.getByLabelText('第 1 行独立占号'));expect(screen.queryByRole('button',{name:'查看真实白色基准'})).not.toBeInTheDocument();
 await checkPlanning();expect(api.previewBatchPlan.mock.calls.at(-1)?.[0].groups[0].rows[0].shareWhite).toBe(false);
});
it('shows dictionary names and both used and recommended sequences in the right preview',async()=>{
 const api=planningApiFixture();const preview=api.previewBatchPlan.getMockImplementation()!;api.previewBatchPlan.mockImplementation(async input=>{const result=await preview(input);result.groups[0].rows[0].lastUsedSequence=4;return result;});
 render(<PlanningPage api={api as never}/>);await chooseProduct();fillProject();await checkPlanning();
 const panel=screen.getByRole('complementary',{name:'完整图号与编码拆解'});
 expect(within(panel).getByText('SAMKYO（02）')).toBeVisible();expect(within(panel).getByText('白色（0）')).toBeVisible();
 expect(within(panel).getByText('最后使用流水号').nextElementSibling).toHaveTextContent('004');
 expect(within(panel).getByText('推荐流水号').nextElementSibling).toHaveTextContent('005');
});

it('releases the preview column without candidates and restores the adjusted width',async()=>{
 const api=planningApiFixture();render(<PlanningPage api={api as never}/>);
 expect(screen.getByText('图号预览：暂无候选图号')).toBeVisible();
 expect(screen.queryByRole('separator',{name:'调整图号预览宽度'})).not.toBeInTheDocument();
 await chooseProduct();fillProject();await checkPlanning();
 const handle=screen.getByRole('separator',{name:'调整图号预览宽度'});
 fireEvent.keyDown(handle,{key:'ArrowLeft'});
 const width=handle.getAttribute('aria-valuenow');
 expect(width).toBe('376');
 fireEvent.click(screen.getByRole('button',{name:'选择项目'}));
 fireEvent.change(screen.getByLabelText('第 1 行颜色'),{target:{value:'7'}});
 expect(screen.getByText('图号预览：暂无候选图号')).toBeVisible();
 await checkPlanning();
 expect(screen.getByRole('separator',{name:'调整图号预览宽度'})).toHaveAttribute('aria-valuenow',width);
});
