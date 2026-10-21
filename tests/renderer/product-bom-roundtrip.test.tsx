import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProductBomRoundtripMock } from '../../src/renderer/pages/products/ProductBomRoundtripMock';
const start=async()=>{window.history.replaceState({},'','/?mock=products&flow=bom');render(<ProductBomRoundtripMock/>);await screen.findByText('模拟阻塞 2 条');};
describe('isolated BOM roundtrip',()=>{
 it('restores source filter and forces fresh check',async()=>{
  const fetchSpy=vi.spyOn(globalThis,'fetch');await start();
  fireEvent.change(screen.getByLabelText('产品筛选'),{target:{value:'MOCK'}});
  fireEvent.click(screen.getByRole('button',{name:'前往处理 →'}));expect(screen.getByText('产品退出 · 关联处理')).toBeVisible();
  fireEvent.click(screen.getByText('返回退出预检'));
  expect(screen.getByText('正在重新读取产品并执行完整预检…')).toBeVisible();
  expect(screen.getByRole('button',{name:'确认退出（模拟）'})).toBeDisabled();
  await screen.findByText('模拟阻塞 2 条');expect(screen.getByLabelText('产品筛选')).toHaveValue('MOCK');
  expect(fetchSpy).not.toHaveBeenCalled();fetchSpy.mockRestore();
 });
 it('protects unsaved changes on tab switch and return',async()=>{
  await start();fireEvent.click(screen.getByRole('button',{name:'前往处理 →'}));fireEvent.click(screen.getByText('BOM 编辑'));
  fireEvent.change(screen.getByLabelText('模拟编辑备注'),{target:{value:'未保存'}});
  fireEvent.click(screen.getByText('历史 BOM'));expect(screen.getByRole('dialog')).toBeVisible();
  fireEvent.click(screen.getByText('取消'));expect(screen.getByLabelText('模拟编辑备注')).toHaveValue('未保存');
  fireEvent.click(screen.getByText('返回退出预检'));fireEvent.click(screen.getByText('放弃修改并离开'));
  await screen.findByText('模拟阻塞 2 条');
 });
 it('does not assume cancelled processing succeeded',async()=>{
  await start();fireEvent.click(screen.getByRole('button',{name:'前往处理 →'}));
  fireEvent.click(screen.getAllByText('模拟处理')[0]);fireEvent.click(screen.getByText('取消'));
  fireEvent.click(screen.getByText('返回退出预检'));await screen.findByText('模拟阻塞 2 条');
 });
 it('uses completed memory result but still checks other blockers',async()=>{
  await start();fireEvent.change(screen.getByLabelText('往返场景'),{target:{value:'otherBlock'}});
  fireEvent.click(screen.getByRole('button',{name:/^重新检查$/}));await screen.findByText('模拟阻塞 2 条');
  fireEvent.click(screen.getByRole('button',{name:'前往处理 →'}));
  for(let i=0;i<2;i++){const buttons=screen.getAllByText('模拟处理');fireEvent.click(buttons[i]);fireEvent.click(screen.getByText('确认模拟处理'));await waitFor(()=>expect(buttons[i]).toBeDisabled());await screen.findByText('模拟操作已完成；返回后必须重新检查，不代表允许退出。');}
  fireEvent.click(screen.getByText('返回退出预检'));await screen.findByText('模拟阻塞 0 条');
  expect(screen.getByText('仍有图号引用阻塞')).toBeVisible();expect(screen.getByRole('button',{name:'确认退出（模拟）'})).toBeDisabled();
 });
 it('fails closed after product disappears',async()=>{
  await start();fireEvent.click(screen.getByRole('button',{name:'前往处理 →'}));fireEvent.change(screen.getByLabelText('往返场景'),{target:{value:'missing'}});
  fireEvent.click(screen.getByText('返回退出预检'));await screen.findByText('原产品不存在，禁止退出');
  expect(screen.getByRole('button',{name:'确认退出（模拟）'})).toBeDisabled();
 });
 it('normal entry has no source toolbar',()=>{
  window.history.replaceState({},'','/?mock=products&flow=bom&entry=bom');render(<ProductBomRoundtripMock/>);
  expect(screen.queryByText('产品退出 · 关联处理')).not.toBeInTheDocument();
 });
});
