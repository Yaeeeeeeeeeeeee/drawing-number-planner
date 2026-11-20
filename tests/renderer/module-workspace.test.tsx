import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ModuleWorkspace } from '../../src/renderer/components/ModuleWorkspace';

afterEach(() => vi.unstubAllGlobals());
it('gives PDF navigation a 300px default and keyboard bounds of 260–420px',()=>{
  vi.stubGlobal('innerWidth',1920);
  render(<ModuleWorkspace resizable fileWorkspace navigation={<p>PDF导航</p>} detailLabel="文件详情" onCloseDetail={()=>{}}><p>文件列表</p></ModuleWorkspace>);
  const handle=screen.getByRole('separator',{name:'调整产品导航宽度'});
  expect(handle).toHaveAttribute('aria-valuenow','300');expect(handle).toHaveAttribute('aria-valuemin','260');expect(handle).toHaveAttribute('aria-valuemax','420');
});
it('keeps narrow PDF navigation open for tree expansion and filters, closing only on explicit selection',()=>{
  vi.stubGlobal('innerWidth',720);
  render(<ModuleWorkspace fileWorkspace navigation={<><button>展开类别</button><button data-navigation-select>选择产品</button></>} detailLabel="文件详情" onCloseDetail={()=>{}}><p>文件列表</p></ModuleWorkspace>);
  fireEvent.click(screen.getByRole('button',{name:'产品／批次导航'}));
  fireEvent.click(screen.getByRole('button',{name:'展开类别'}));
  expect(screen.getByRole('dialog',{name:'产品／批次导航'})).toBeVisible();
  fireEvent.click(screen.getByRole('button',{name:'选择产品'}));
  expect(screen.queryByRole('dialog',{name:'产品／批次导航'})).toBeNull();
});
it('supports keyboard panel sizing and reset without changing the detail input', () => {
  vi.stubGlobal('innerWidth', 1920);
  render(<ModuleWorkspace resizable fileWorkspace navigation={<button>产品A</button>} detail={<input aria-label="详情输入" defaultValue="保留输入" />} detailLabel="文件详情" detailIdentity={1} onCloseDetail={() => {}}><p>列表</p></ModuleWorkspace>);
  const handle = screen.getByRole('separator', { name: '调整产品导航宽度' });
  const before = Number(handle.getAttribute('aria-valuenow'));
  fireEvent.keyDown(handle, { key: 'ArrowRight' });
  expect(Number(handle.getAttribute('aria-valuenow'))).toBeGreaterThan(before);
  expect(screen.getByLabelText('详情输入')).toHaveValue('保留输入');
  fireEvent.click(screen.getByRole('button', { name: '恢复默认宽度' }));
  expect(Number(handle.getAttribute('aria-valuenow'))).toBe(before);
  act(() => { vi.stubGlobal('innerWidth', 720); window.dispatchEvent(new Event('resize')); });
  expect(screen.getByRole('dialog', { name: '文件详情窗口' })).toBeVisible();
  expect(screen.queryByRole('separator')).not.toBeInTheDocument();
  expect(screen.getByLabelText('详情输入')).toHaveValue('保留输入');
});

it('allocates wide PDF detail to its own track and allows folding the product navigation', () => {
  vi.stubGlobal('innerWidth', 1920);
  const { container } = render(<ModuleWorkspace resizable fileWorkspace navigation={<p>产品树</p>} detail={<input aria-label="文件详情草稿" defaultValue="保留" />} detailLabel="文件详情" onCloseDetail={() => {}}><p>文件列表</p></ModuleWorkspace>);
  expect(container.querySelector('.file-workspace .module-center')).toHaveClass('docked-detail');
  expect(container.querySelector('.file-detail-overlay')).toBeNull();
  screen.getByRole('button', { name: '收起产品导航' }).focus();
  fireEvent.click(screen.getByRole('button', { name: '收起产品导航' }));
  expect(screen.getByRole('button', { name: '产品／批次导航' })).toHaveFocus();
  expect(container.querySelector('.module-navigation')).not.toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '产品／批次导航' }));
  expect(screen.getByRole('button', { name: '收起产品导航' })).toHaveFocus();
  expect(container.querySelector('.module-navigation')).toBeVisible();
  expect(screen.getByLabelText('文件详情草稿')).toHaveValue('保留');
});
it('recomputes available height without replacing the list or detail inputs', () => {
  vi.stubGlobal('innerWidth', 1920); vi.stubGlobal('innerHeight', 2160);
  const { container } = render(<ModuleWorkspace resizable detail={<input aria-label="详情内容" defaultValue="不清空" />} detailLabel="图号详情" onCloseDetail={() => {}}><input aria-label="列表输入" defaultValue="筛选" /></ModuleWorkspace>);
  const root = container.querySelector<HTMLElement>('.module-workspace-viewport')!;
  const before = Number(root.style.getPropertyValue('--workspace-available-height').replace('px', ''));
  expect(before).toBeGreaterThan(1500);
  act(() => { vi.stubGlobal('innerHeight', 600); window.dispatchEvent(new Event('resize')); });
  const after = Number(root.style.getPropertyValue('--workspace-available-height').replace('px', ''));
  expect(after).toBeLessThan(before);
  expect(screen.getByLabelText('列表输入')).toHaveValue('筛选');
  expect(screen.getByLabelText('详情内容')).toHaveValue('不清空');
});

it('keeps focus in the edited detail control through breakpoints and restores its origin on close', () => {
  vi.stubGlobal('innerWidth', 1920);
  function Harness() {
    const [open, setOpen] = useState(false);
    return <ModuleWorkspace navigation={<p>产品导航</p>} detail={open ? <><button onClick={() => setOpen(false)}>关闭详情</button><input aria-label="正在编辑的字段" defaultValue="保留" /></> : null} detailLabel="图号详情" detailIdentity={open ? 1 : undefined} onCloseDetail={() => setOpen(false)}><button onClick={() => setOpen(true)}>选中原记录</button></ModuleWorkspace>;
  }
  render(<Harness />);
  const origin = screen.getByRole('button', { name: '选中原记录' }); origin.focus(); fireEvent.click(origin);
  fireEvent.click(screen.getByRole('button', { name: '收起产品导航' }));
  fireEvent.click(screen.getByRole('button', { name: '产品／批次导航' }));
  const field = screen.getByLabelText('正在编辑的字段'); field.focus();
  act(() => { vi.stubGlobal('innerWidth', 720); window.dispatchEvent(new Event('resize')); });
  expect(field).toHaveFocus();
  act(() => { vi.stubGlobal('innerWidth', 1920); window.dispatchEvent(new Event('resize')); });
  expect(field).toHaveFocus();
  act(() => { vi.stubGlobal('innerWidth', 720); window.dispatchEvent(new Event('resize')); });
  expect(field).toHaveFocus();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(origin).toHaveFocus();
});

it('places the collapse control in the catalog heading without a separate collapse row',()=>{
  vi.stubGlobal('innerWidth',1920);
  const {container}=render(<ModuleWorkspace fileWorkspace navigation={({collapseControl})=><header className="test-catalog-header"><h2>产品与批次</h2>{collapseControl}</header>} detailLabel="文件详情" onCloseDetail={()=>{}}><p>列表</p></ModuleWorkspace>);
  const collapse=screen.getByRole('button',{name:'收起产品导航'});
  expect(container.querySelector('.test-catalog-header')).toContainElement(collapse);
  expect(collapse).not.toHaveTextContent('收起产品导航');
  expect(collapse.querySelector('svg')).toHaveClass('lucide-chevrons-left');
  fireEvent.click(collapse);
  expect(screen.getByRole('button',{name:'产品／批次导航'})).toHaveFocus();
});

it('keeps an integrated drawing drawer open for expansion and closes after selecting a scope',()=>{
  vi.stubGlobal('innerWidth',720);
  render(<ModuleWorkspace drawingWorkspace navigation={({collapseControl})=><><header>{collapseControl}</header><button>展开图纸分类</button><button data-navigation-select>选择图纸产品</button></>} detailLabel="图纸详情" onCloseDetail={()=>{}}><p>图纸列表</p></ModuleWorkspace>);
  fireEvent.click(screen.getByRole('button',{name:'产品／批次导航'}));
  fireEvent.click(screen.getByRole('button',{name:'展开图纸分类'}));
  expect(screen.getByRole('dialog',{name:'产品／批次导航'})).toBeVisible();
  fireEvent.click(screen.getByRole('button',{name:'选择图纸产品'}));
  expect(screen.queryByRole('dialog',{name:'产品／批次导航'})).toBeNull();
});

it('traps keyboard focus around collapsed filter disclosures without focusing their hidden fields',()=>{
  vi.stubGlobal('innerWidth',720);
  render(<ModuleWorkspace fileWorkspace navigation={({collapseControl})=><>{collapseControl}<details><summary>折叠文件筛选</summary><input aria-label="折叠内字段"/><button>提交折叠筛选</button></details></>} detailLabel="文件详情" onCloseDetail={()=>{}}><p>列表</p></ModuleWorkspace>);
  fireEvent.click(screen.getByRole('button',{name:'产品／批次导航'}));
  const summary=screen.getByText('折叠文件筛选'); summary.focus();
  fireEvent.keyDown(document,{key:'Tab'});
  expect(screen.getByRole('button',{name:'关闭产品导航'})).toHaveFocus();
});

it('gives drawing navigation the shared 300px default and 260–420px resizing range',()=>{
  vi.stubGlobal('innerWidth',1920);
  render(<ModuleWorkspace resizable drawingWorkspace navigation={<p>图号导航</p>} detailLabel="图号详情" onCloseDetail={()=>{}}><input aria-label="保留图号筛选" defaultValue="SKU"/></ModuleWorkspace>);
  const handle=screen.getByRole('separator',{name:'调整产品导航宽度'});
  expect(handle).toHaveAttribute('aria-valuenow','300');
  expect(handle).toHaveAttribute('aria-valuemin','260');
  expect(handle).toHaveAttribute('aria-valuemax','420');
  fireEvent.keyDown(handle,{key:'End'});
  expect(handle).toHaveAttribute('aria-valuenow','420');
  fireEvent.click(screen.getByRole('button',{name:'恢复默认宽度'}));
  expect(handle).toHaveAttribute('aria-valuenow','300');
  expect(screen.getByLabelText('保留图号筛选')).toHaveValue('SKU');
});
