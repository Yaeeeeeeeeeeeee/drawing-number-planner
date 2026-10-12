import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from '../../src/renderer/layout/AppShell';
import { RecoveryMockPage } from '../../src/renderer/pages/recovery-mock';
describe('isolated recovery panel',()=>{
 it('never mounts real recovery or queries API',()=>{
  window.history.replaceState({},'','/?mock=recovery');const calls=vi.fn(()=>{throw Error('forbidden');});const fetch=vi.spyOn(globalThis,'fetch');render(<AppShell api={new Proxy({} as never,{get:()=>calls})}/>);
  expect(screen.getByRole('region',{name:'安全恢复面板'})).toBeVisible();expect(calls).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();fetch.mockRestore();
 });
 it('protects finalizing tasks',()=>{
  render(<RecoveryMockPage/>);fireEvent.change(screen.getByLabelText('Mock 场景'),{target:{value:'finalizing'}});expect(screen.getByRole('button',{name:'请求取消'})).toBeDisabled();
 });
 it('distinguishes cancel request from confirmed cancellation and locks repeats',async()=>{
  render(<RecoveryMockPage/>);fireEvent.change(screen.getByLabelText('Mock 场景'),{target:{value:'task'}});fireEvent.click(screen.getByRole('button',{name:'请求取消'}));
  expect(screen.getByRole('button',{name:'处理中…'})).toBeDisabled();await screen.findAllByText('已请求取消，等待任务状态确认…');await screen.findByText('样例任务状态已确认：已取消。');
 });
 it('reload confirmation does not pretend recovery success',async()=>{
  render(<RecoveryMockPage/>);const panel=screen.getByRole('region',{name:'安全恢复面板'});fireEvent.click(within(panel).getAllByRole('button',{name:'执行'})[0]);fireEvent.click(screen.getByRole('button',{name:'确认模拟执行'}));
  await screen.findByText('已模拟触发界面重载。不能据此确认界面或业务已恢复。');
 });
});
