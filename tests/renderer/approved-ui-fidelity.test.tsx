import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { DictionariesPage } from '../../src/renderer/pages/DictionariesPage';
import { PlanningPage } from '../../src/renderer/pages/PlanningPage';
import { ImportPage } from '../../src/renderer/pages/ImportPage';

it('keeps dictionary editing on the approved branch with a locked code and equal action roles', async () => {
  const api = { listDictionaries: vi.fn().mockResolvedValue([{id:1,type:'brand',code:'01',name:'品牌甲',status:'active'}]) };
  const {container}=render(<DictionariesPage api={api as never}/>);
  fireEvent.click(await screen.findByRole('button',{name:'修改 品牌甲'}));
  expect(container.querySelector('.dm-edit-branch .dm-editor')).not.toBeNull();
  expect(screen.getByLabelText('编码')).toBeDisabled();
  expect(screen.getByRole('button',{name:/^保存$/})).toBeVisible();
});

it('places the real planning preview beside its source row without granting occupancy', async () => {
  const api = {
    listProducts: vi.fn().mockResolvedValue([]), listDictionaries: vi.fn().mockResolvedValue([]),
    reservePlan: vi.fn(),
  };
  const {container}=render(<PlanningPage api={api as never}/>);
  expect(container.querySelector('.pp-fields')).not.toBeNull();
  expect(screen.getByRole('button',{name:'确认批量占号'})).toBeDisabled();
  expect(api.reservePlan).not.toHaveBeenCalled();
});

it('shows real migration issues in the approved worksheet and expands actual reasons only', async () => {
  const api={auditWorkbook:vi.fn().mockResolvedValue({auditId:'a',report:{candidates:[],issues:[{code:'DUPLICATE_CODE',dictionaryType:'brand',sourceCell:'E22',value:'01',message:'真实检查原因'}]}}),confirmImport:vi.fn()};
  render(<ImportPage api={api as never}/>);
  fireEvent.change(screen.getByLabelText('选择 Excel 文件'),{target:{files:[new File(['sample'],'sample.xlsx')]}});
  fireEvent.click(screen.getByRole('button',{name:'开始检查'}));
  expect(await screen.findByRole('table',{name:'迁移问题工作表'})).toBeVisible();
  fireEvent.click(screen.getByRole('button',{name:'查看原因'}));
  expect(screen.getByText('真实检查原因')).toBeVisible();
  expect(api.confirmImport).not.toHaveBeenCalled();
});

it('discloses the original all-report selection scope when migration rows are filtered', async () => {
 const api={auditWorkbook:vi.fn().mockResolvedValue({auditId:'a',report:{issues:[],candidates:[{id:'b',type:'brand',code:'01',name:'品牌甲',sourceCell:'E22'},{id:'c',type:'color',code:'0',name:'白色',sourceCell:'C22'}]}}),confirmImport:vi.fn().mockResolvedValue({imported:2,skipped:0})};
 render(<ImportPage api={api as never}/>);
 fireEvent.change(screen.getByLabelText('选择 Excel 文件'),{target:{files:[new File(['sample'],'sample.xlsx')]}});
 fireEvent.click(screen.getByRole('button',{name:'开始检查'}));
 fireEvent.click(await screen.findByRole('button',{name:/导入候选/}));
 fireEvent.change(screen.getByLabelText('筛选异常'),{target:{value:'品牌甲'}});
 fireEvent.click(screen.getByRole('button',{name:'全选可导入项（含筛选外）'}));
 expect(screen.getByText('其中 1 条在当前筛选外，确认将一并导入。')).toBeVisible();
 expect(api.confirmImport).not.toHaveBeenCalled();
});
