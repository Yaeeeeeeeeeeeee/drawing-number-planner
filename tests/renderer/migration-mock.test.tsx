import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from '../../src/renderer/layout/AppShell';
import { MigrationMockPage } from '../../src/renderer/pages/migration-mock';
const start=async()=>{fireEvent.click(screen.getByRole('button',{name:'选择样例文件'}));fireEvent.click(screen.getByRole('button',{name:'开始检查'}));await screen.findByText('检查完成');};
describe('migration isolated workbench',()=>{
 it('does not invoke real services and shows scope before checking',()=>{
  window.history.replaceState({},'','/?mock=migration');const calls=vi.fn(()=>{throw Error('forbidden');});const fetch=vi.spyOn(globalThis,'fetch');
  render(<AppShell api={new Proxy({} as never,{get:()=>calls})}/>);
  expect(screen.getByText('尚未检查')).toBeVisible();expect(screen.queryByRole('table')).not.toBeInTheDocument();expect(calls).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();fetch.mockRestore();
 });
 it('includes incomplete rows without candidates and disables conflicts',async()=>{
  render(<MigrationMockPage/>);await start();expect(screen.getByText('字段不完整',{selector:'span'})).toBeVisible();fireEvent.click(screen.getByRole('button',{name:'全部候选'}));
  expect(screen.getByLabelText('选择 样例品牌')).toBeDisabled();expect(screen.getByLabelText('选择 说明书')).toBeEnabled();
  fireEvent.click(screen.getByLabelText('选择 说明书'));fireEvent.click(screen.getByRole('button',{name:'确认导入（模拟）'}));
  expect(screen.getByRole('alert')).toHaveTextContent('需要同时选择本批主类别');
 });
 it('consumes only the simulated selected import and invalidates on new source',async()=>{
  render(<MigrationMockPage/>);await start();fireEvent.click(screen.getByRole('button',{name:'全部候选'}));fireEvent.click(screen.getByRole('button',{name:'全选无冲突候选（含筛选外）'}));fireEvent.click(screen.getByRole('button',{name:'确认导入（模拟）'}));await screen.findByText(/已模拟导入/);
  expect(screen.getByRole('button',{name:'确认导入（模拟）'})).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'选择样例文件'}));expect(screen.queryByRole('table')).not.toBeInTheDocument();expect(screen.getByText('尚未检查')).toBeVisible();
 });
});
