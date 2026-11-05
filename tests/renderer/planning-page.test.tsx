import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {describe,expect,it,vi} from 'vitest';
import {PlanningPage} from '../../src/renderer/pages/PlanningPage';
import {planningApiFixture,planningProduct,choosePlanningProduct,fillPlanningProject,checkPlanning,confirmPlanning} from './planning-workspace-fixture';

describe('planning business interactions in the approved four-step layout',()=>{
 it('clears an incompatible single-product selection when the product category changes',async()=>{
  const api=planningApiFixture();api.listProducts.mockResolvedValue([planningProduct,{...planningProduct,id:3,model:'F20',productCategory:'空气炸锅'}]);render(<PlanningPage api={api as never}/>);
  await screen.findByRole('option',{name:/T40/});fireEvent.change(screen.getByLabelText('产品型号'),{target:{value:'1'}});expect(screen.getByLabelText('外观')).toHaveValue('3');
  fireEvent.change(screen.getByLabelText('产品类别'),{target:{value:'空气炸锅'}});expect(screen.getByLabelText('产品型号')).toHaveValue('');expect(screen.queryByLabelText('外观')).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'下一步'})).toBeDisabled();
 });
 it('uses dictionary appearances without adding version management or changing the product default',async()=>{
  const api={...planningApiFixture(),listAppearanceVersions:vi.fn(),updateProduct:vi.fn()};render(<PlanningPage api={api as never}/>);await screen.findByRole('option',{name:/T40/});fireEvent.change(screen.getByLabelText('产品型号'),{target:{value:'1'}});fireEvent.change(screen.getByLabelText('外观'),{target:{value:'12'}});fireEvent.click(screen.getByRole('button',{name:'下一步'}));fillPlanningProject();await checkPlanning();
  expect(api.previewBatchPlan).toHaveBeenCalledWith(expect.objectContaining({groups:[expect.objectContaining({productId:1,appearanceId:12})]}));expect(api.listAppearanceVersions).not.toHaveBeenCalled();expect(api.updateProduct).not.toHaveBeenCalled();expect(screen.queryByLabelText('外观版本')).not.toBeInTheDocument();
 });
 it('adds and removes projects supplied by the dictionary and exposes incomplete rows as errors',async()=>{
  const api=planningApiFixture();render(<PlanningPage api={api as never}/>);await choosePlanningProduct();fillPlanningProject();fireEvent.click(screen.getByRole('button',{name:'添加项目'}));expect(screen.getByLabelText('第 2 行项目明细')).toBeDisabled();
  await checkPlanning();expect(await screen.findByText('项目资料不完整')).toBeVisible();expect(screen.getByText('可占用')).toBeVisible();
  fireEvent.click(screen.getByRole('button',{name:'选择项目'}));fireEvent.click(screen.getByRole('button',{name:'删除项目 2'}));expect(screen.queryByLabelText('第 2 行颜色')).not.toBeInTheDocument();
 });
 it('retains a valid sibling check when only one edited project is rechecked',async()=>{
  const api=planningApiFixture();render(<PlanningPage api={api as never}/>);await choosePlanningProduct();fillPlanningProject();fireEvent.click(screen.getByRole('button',{name:'添加项目'}));fillPlanningProject(2,'8');await checkPlanning();await screen.findByText('02.0101.010.0202001');
  fireEvent.click(screen.getByRole('button',{name:'选择项目'}));fireEvent.change(screen.getByLabelText('第 1 行备注'),{target:{value:'已修正'}});fireEvent.click(screen.getByRole('button',{name:'图号检查'}));
  const table=screen.getByRole('table'),bodyRows=within(table).getAllByRole('row').slice(1);expect(within(bodyRows[0]).getByText(/本项目有修改/)).toBeVisible();expect(within(bodyRows[1]).getByText('可占用')).toBeVisible();
  fireEvent.click(within(bodyRows[0]).getByRole('button',{name:'单项重查'}));await waitFor(()=>expect(api.previewBatchPlan).toHaveBeenCalledTimes(2));expect(api.previewBatchPlan.mock.calls[1][0].groups[0].rows).toHaveLength(1);
 });
 it('requires a fresh check after a failed reservation and retains the user input',async()=>{
  const api=planningApiFixture();api.reserveBatchPlan.mockRejectedValueOnce(new Error('推荐图号已变化，请重新查重'));render(<PlanningPage api={api as never}/>);await choosePlanningProduct();fillPlanningProject();fireEvent.change(screen.getByLabelText('第 1 行备注'),{target:{value:'保留本次输入'}});await checkPlanning();fireEvent.click(screen.getByRole('button',{name:'下一步'}));fireEvent.click(screen.getByLabelText('已核对本次占号清单'));fireEvent.click(screen.getByRole('button',{name:'确认批量占号'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('推荐图号已变化');fireEvent.click(screen.getByRole('button',{name:'确认占号'}));expect(screen.getByRole('button',{name:'确认批量占号'})).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'选择项目'}));expect(screen.getByLabelText('第 1 行备注')).toHaveValue('保留本次输入');
 });
 it('passes only successfully returned identities to drawing and file navigation and preserves them on reentry',async()=>{
  const api=planningApiFixture(),library=vi.fn(),generate=vi.fn();const view=render(<PlanningPage api={api as never} onOpenDrawingLibrary={library} onGenerateFiles={generate}/>);await choosePlanningProduct();fillPlanningProject();await confirmPlanning();
  view.rerender(<PlanningPage api={api as never} active={false} onOpenDrawingLibrary={library} onGenerateFiles={generate}/>);view.rerender(<PlanningPage api={api as never} active onOpenDrawingLibrary={library} onGenerateFiles={generate}/>);
  fireEvent.click(screen.getByRole('button',{name:'查看 T40 图号库'}));fireEvent.click(screen.getByRole('button',{name:'生成文件'}));expect(library).toHaveBeenCalledWith({productId:1,drawingIds:[42],fullCodes:['02.0101.010.0201005'],initialDrawingId:42});expect(generate).toHaveBeenCalledWith(expect.objectContaining({productId:1,drawings:[{origin:'planned',id:42}]}));expect(api.reserveBatchPlan).toHaveBeenCalledTimes(1);
 });
 it('copies the full confirmed code and reports a clipboard failure without losing the result',async()=>{
  const api=planningApiFixture(),copy=vi.fn().mockRejectedValue(new Error('clipboard denied'));Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:copy}});render(<PlanningPage api={api as never}/>);await choosePlanningProduct();fillPlanningProject();await confirmPlanning();fireEvent.click(screen.getByRole('button',{name:'复制图号 02.0101.010.0201005'}));expect(await screen.findByRole('alert')).toHaveTextContent('复制失败');expect(screen.getByRole('region',{name:'本次占号结果'})).toBeVisible();
 });
 it('never reads packaging dimensions or template configuration during number planning',async()=>{
  const api={...planningApiFixture(),packaging:{getCatalog:vi.fn(()=>new Promise(()=>{}))}};render(<PlanningPage api={api as never}/>);await choosePlanningProduct();fillPlanningProject();await checkPlanning();expect(screen.getByRole('table')).toBeVisible();expect(api.packaging.getCatalog).not.toHaveBeenCalled();expect(screen.queryByLabelText(/尺寸参数/)).not.toBeInTheDocument();
 });
 it('preserves dirty project input when reference data refreshes and ignores an older request',async()=>{
  const api=planningApiFixture();const view=render(<PlanningPage api={api as never} active/>);await choosePlanningProduct();fillPlanningProject();const note=screen.getByLabelText('第 1 行备注');fireEvent.change(note,{target:{value:'未保存的编辑'}});
  view.rerender(<PlanningPage api={api as never} active={false}/>);api.listProducts.mockResolvedValue([planningProduct,{...planningProduct,id:3,model:'新型号'}]);view.rerender(<PlanningPage api={api as never} active/>);
  await waitFor(()=>expect(api.listProducts).toHaveBeenCalledTimes(2));expect(screen.getByLabelText('第 1 行备注')).toBe(note);expect(note).toHaveValue('未保存的编辑');
  fireEvent.click(screen.getByRole('button',{name:'产品资料'}));expect(await screen.findByRole('option',{name:/新型号/})).toBeInTheDocument();expect(screen.getByLabelText('产品型号')).toHaveValue('1');
 });
 it('keeps input after a draft save failure and can retry saving',async()=>{
  const api=planningApiFixture();api.savePlanningDraft.mockRejectedValueOnce(new Error('草稿磁盘不可写'));render(<PlanningPage api={api as never}/>);await screen.findByRole('option',{name:/T40/});fireEvent.change(screen.getByLabelText('产品型号'),{target:{value:'1'}});
  expect(await screen.findByRole('alert')).toHaveTextContent('草稿磁盘不可写');expect(screen.getByLabelText('产品型号')).toHaveValue('1');fireEvent.click(screen.getByRole('button',{name:'重试保存草稿'}));expect(await screen.findByText('草稿已保存')).toBeVisible();
 });
 it('deletes only the selected mode draft without issuing reservation or release operations',async()=>{
  const api=planningApiFixture();render(<PlanningPage api={api as never}/>);await choosePlanningProduct();fillPlanningProject();await waitFor(()=>expect(api.savePlanningDraft).toHaveBeenCalled());fireEvent.click(screen.getByRole('button',{name:'删除当前草稿'}));await screen.findByText('草稿已删除，正式图号保持不变');expect(api.deletePlanningDraft).toHaveBeenCalledWith('new',expect.any(Number));expect(api.reserveBatchPlan).not.toHaveBeenCalled();
 });
 it('uses a real white identity for sharing and permits independent color numbering per project',async()=>{
  const api=planningApiFixture();render(<PlanningPage api={api as never}/>);await choosePlanningProduct();fillPlanningProject(1,'6','7');expect(screen.getByLabelText('第 1 行其他颜色共用白色图号')).toBeChecked();fireEvent.click(screen.getByRole('button',{name:'查看真实白色基准'}));expect(await screen.findByRole('option',{name:/T40白色铭牌/})).toBeInTheDocument();fireEvent.change(screen.getByLabelText('第 1 行白色基准'),{target:{value:'planned:90'}});await checkPlanning();expect(screen.getByText('共用已有图号')).toBeVisible();
  fireEvent.click(screen.getByRole('button',{name:'选择项目'}));fireEvent.click(screen.getByLabelText('第 1 行其他颜色共用白色图号'));await checkPlanning();expect(screen.getByText('可占用')).toBeVisible();expect(api.previewBatchPlan.mock.calls.at(-1)?.[0].groups[0].rows[0].shareWhite).toBe(false);
 });
});
