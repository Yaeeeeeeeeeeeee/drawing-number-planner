import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from '../../src/renderer/layout/AppShell';
import { PlanningMockPage } from '../../src/renderer/pages/planning-mock';
const fill=()=>{fireEvent.change(screen.getByLabelText('产品'),{target:{value:'p1'}});fireEvent.change(screen.getByLabelText('第 1 行主类别'),{target:{value:'04'}});fireEvent.change(screen.getByLabelText('第 1 行项目明细'),{target:{value:'01'}});fireEvent.change(screen.getByLabelText('第 1 行颜色'),{target:{value:'0'}});};
describe('planning mock',()=>{
 it('isolates the app from real API and fetch',()=>{
  window.history.replaceState({},'','/?mock=planning');const calls=vi.fn(()=>{throw Error('forbidden');});const fetch=vi.spyOn(globalThis,'fetch');
  render(<AppShell api={new Proxy({} as never,{get:()=>calls})}/>);expect(screen.getByLabelText('产品')).toBeVisible();expect(calls).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();fetch.mockRestore();
 });
 it('keeps full appearance code and invalidates upstream changes',async()=>{
  render(<PlanningMockPage/>);fill();fireEvent.change(screen.getByLabelText('外观'),{target:{value:'10'}});fireEvent.click(screen.getByRole('button',{name:'查重并预览'}));
  await screen.findByText('02.0404.100.0401001');expect(screen.getByRole('button',{name:'确认整批占号（模拟）'})).toBeEnabled();
  fireEvent.change(screen.getByLabelText('第 1 行主类别'),{target:{value:'05'}});expect(screen.getByLabelText('第 1 行项目明细')).toHaveValue('');expect(screen.queryByText('02.0404.100.0401001')).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'确认整批占号（模拟）'})).toBeDisabled();
 });
 it('accounts for explicitly simulated historical occupancy',async()=>{
  render(<PlanningMockPage/>);fireEvent.change(screen.getByLabelText('Mock 场景'),{target:{value:'historical'}});fill();fireEvent.click(screen.getByRole('button',{name:'查重并预览'}));await screen.findByText('02.0404.010.0401008');
 });
 it('fails saving without granting occupation or reusing preview',async()=>{
  render(<PlanningMockPage/>);fireEvent.change(screen.getByLabelText('Mock 场景'),{target:{value:'saveFailure'}});fill();fireEvent.click(screen.getByRole('button',{name:'查重并预览'}));await screen.findByText('02.0404.010.0401001');fireEvent.click(screen.getByRole('button',{name:'确认整批占号（模拟）'}));await screen.findByRole('alert');expect(screen.getByRole('button',{name:'确认整批占号（模拟）'})).toBeDisabled();
 });
});
