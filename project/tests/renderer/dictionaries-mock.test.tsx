import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from '../../src/renderer/layout/AppShell';
import { DictionariesMockPage } from '../../src/renderer/pages/dictionaries-mock';
describe('dictionary mock isolation',()=>{
 it('isolates shell and preserves five types without layers',()=>{
  window.history.replaceState({},'','/?mock=dictionaries');
  const real=vi.fn(()=>{throw Error('real forbidden');});const fetchSpy=vi.spyOn(globalThis,'fetch');
  render(<AppShell api={new Proxy({} as never,{get:()=>real})}/>);
  expect(screen.getByRole('navigation',{name:'字典分类'}).querySelectorAll('button')).toHaveLength(5);
  expect(screen.queryByText('层数')).not.toBeInTheDocument();expect(real).not.toHaveBeenCalled();expect(fetchSpy).not.toHaveBeenCalled();fetchSpy.mockRestore();
 });
 it('supports master selection, empty children and inactive parent',()=>{
  render(<DictionariesMockPage/>);fireEvent.click(screen.getByRole('button',{name:'主类别'}));
  fireEvent.click(screen.getByRole('button',{name:/02.*主类别乙/}));expect(screen.getByText('该主类别暂无项目明细')).toBeVisible();
  fireEvent.click(screen.getByRole('button',{name:/03.*主类别丙/}));expect(screen.getByRole('button',{name:'新增项目明细'})).toBeDisabled();
 });
 it('checks impact and uses second confirmation for referenced deletion',async()=>{
  render(<DictionariesMockPage/>);fireEvent.click(screen.getAllByRole('button',{name:'删除'})[0]);
  await screen.findByRole('button',{name:'继续确认'});expect(screen.getByText(/已引用：标记删除/)).toBeVisible();
  expect(screen.queryByRole('button',{name:'确认删除'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'继续确认'}));fireEvent.click(screen.getByRole('button',{name:'确认删除'}));
  await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  fireEvent.click(screen.getByLabelText('显示已删除'));expect(screen.getAllByText('已删除 · 历史保留').length).toBeGreaterThan(0);
 });
 it('fails closed on uncertain references and distinguishes empty from failed load',async()=>{
  render(<DictionariesMockPage/>);fireEvent.change(screen.getByLabelText('Mock 场景'),{target:{value:'checkFailure'}});
  fireEvent.click(screen.getAllByRole('button',{name:'删除'})[0]);await screen.findByText(/引用检查失败/);
  expect(screen.queryByRole('button',{name:'继续确认'})).not.toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'取消'}));
  fireEvent.change(screen.getByLabelText('Mock 场景'),{target:{value:'loadFailure'}});expect(screen.getByRole('alert')).toHaveTextContent('字典加载失败');
  expect(screen.queryByText('当前分类还没有字典记录')).not.toBeInTheDocument();
 });
});
