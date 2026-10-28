import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from '../../src/renderer/layout/AppShell';
import type { PlannerApi } from '../../src/renderer/data/client';

vi.mock('../../src/renderer/pages/PlanningPage', () => ({ PlanningPage: () => <label>规划输入<input aria-label="规划输入" /></label> }));
vi.mock('../../src/renderer/pages/QrCodesPage', () => ({ QrCodesPage: ({active}:{active:boolean}) => <input aria-label="保留二维码状态" data-active={String(active)}/> }));
vi.mock('../../src/renderer/pages/DictionariesPage', () => ({ DictionariesPage: () => <h1>字典内容</h1> }));
vi.mock('../../src/renderer/components/SafeRecovery', () => ({ SafeRecovery: () => <button>安全恢复</button> }));

function viewport(narrow: boolean) {
  let change: (() => void) | undefined;
  const query = { matches: narrow, addEventListener: vi.fn((_event, callback) => { change = callback; }), removeEventListener: vi.fn() };
  vi.stubGlobal('matchMedia', vi.fn(() => query));
  return (value: boolean) => { query.matches = value; change?.(); };
}

describe('floating workspace navigation', () => {
  it('starts open on wide screens without a topbar, backdrop or inert workspace', () => {
    viewport(false);
    try {
      const { container } = render(<AppShell api={{} as PlannerApi} />);
      expect(container.querySelector('.workspace-topbar')).toBeNull();
      expect(screen.getByRole('complementary', { name: '工作导航' })).not.toHaveAttribute('inert');
      expect(screen.getByRole('button', { name: '关闭导航' })).toBeVisible();
      expect(container.querySelector('main')).not.toHaveAttribute('inert');
      expect(screen.queryByRole('button', { name: '关闭导航遮罩' })).toBeNull();
      expect(screen.getByRole('button', { name: '安全恢复' })).toBeVisible();
    } finally { vi.unstubAllGlobals(); }
  });
  it('keeps the page, input and focus when manually hiding and reopening wide navigation', () => {
    viewport(false);
    try {
      render(<AppShell api={{} as PlannerApi} />);
      const input = screen.getByLabelText('规划输入');
      fireEvent.change(input, { target: { value: '尚未提交' } });
      fireEvent.click(screen.getByRole('button', { name: '关闭导航' }));
      const toggle = screen.getByRole('button', { name: '展开导航' });
      expect(toggle).toHaveFocus();
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      fireEvent.click(toggle);
      expect(screen.getByLabelText('规划输入')).toBe(input);
      expect(input).toHaveValue('尚未提交');
    } finally { vi.unstubAllGlobals(); }
  });
  it('starts open as a modal only when narrow and cycles focus without reaching the workspace', () => {
    viewport(true);
    try {
      const { container } = render(<AppShell api={{} as PlannerApi} />);
      expect(screen.getByRole('dialog', { name: '工作导航' })).toHaveAttribute('aria-modal', 'true');
      expect(container.querySelector('main')).toHaveAttribute('inert');
      const close = screen.getByRole('button', { name: '关闭导航' });
      expect(close).toHaveFocus();
      fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
      expect(screen.getByRole('button', { name: '安全恢复' })).toHaveFocus();
      fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
      expect(close).toHaveFocus();
      fireEvent.keyDown(close, { key: 'Escape' });
      expect(screen.getByRole('button', { name: '展开导航' })).toHaveFocus();
      expect(container.querySelector('main')).not.toHaveAttribute('inert');
    } finally { vi.unstubAllGlobals(); }
  });
  it('closes the narrow backdrop without remounting the current page', () => {
    viewport(true);
    try {
      render(<AppShell api={{} as PlannerApi} />);
      const input = screen.getByLabelText('规划输入');
      fireEvent.click(screen.getByRole('button', { name: '关闭导航遮罩' }));
      expect(screen.queryByRole('dialog', { name: '工作导航' })).toBeNull();
      expect(screen.getByLabelText('规划输入')).toBe(input);
      expect(screen.getByRole('button', { name: '展开导航' })).toHaveFocus();
    } finally { vi.unstubAllGlobals(); }
  });
  it('keeps default-open navigation and current input across docked/overlay resizing', () => {
    const resize = viewport(false);
    try {
      const { container } = render(<AppShell api={{} as PlannerApi} />);
      const input = screen.getByLabelText('规划输入');
      fireEvent.change(input, { target: { value: '窗口切换保留' } });
      act(() => resize(true));
      expect(screen.getByRole('dialog', { name: '工作导航' })).toHaveAttribute('aria-modal', 'true');
      expect(container.querySelector('main')).toHaveAttribute('inert');
      act(() => resize(false));
      expect(screen.getByRole('complementary', { name: '工作导航' })).toBeVisible();
      expect(container.querySelector('main')).not.toHaveAttribute('inert');
      expect(screen.getByLabelText('规划输入')).toBe(input);
      expect(input).toHaveValue('窗口切换保留');
    } finally { vi.unstubAllGlobals(); }
  });
  it('preserves a manually closed directory while resizing', () => {
    const resize = viewport(false);
    try {
      render(<AppShell api={{} as PlannerApi} />);
      fireEvent.click(screen.getByRole('button', { name: '关闭导航' }));
      act(() => resize(true));
      act(() => resize(false));
      expect(screen.getByRole('button', { name: '展开导航' })).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByRole('complementary', { name: '工作导航' })).toBeNull();
    } finally { vi.unstubAllGlobals(); }
  });
  it.each([false, true])('selects a module and only dismisses navigation in overlay mode (%s)', narrow => {
    viewport(narrow);
    try {
      render(<AppShell api={{} as PlannerApi} />);
      fireEvent.click(screen.getByRole('button', { name: '编码字典' }));
      expect(screen.getByRole('heading', { name: '字典内容' })).toBeVisible();
      expect(screen.queryByRole('button', { name: '关闭导航' }) !== null).toBe(!narrow);
    } finally { vi.unstubAllGlobals(); }
  });

});

it('groups the nine workflows into daily work, product details and data sources with distinct icons',()=>{
 viewport(false);
 try{
  const {container}=render(<AppShell api={{} as PlannerApi}/>);
  const expected=[['日常工作','图号规划 / 更新包材','BOM 管理','外发资料'],['产品明细','产品档案','图号库','二维码管理'],['数据来源','PDF 文件中心','编码字典','迁移检查']];
  const groups=container.querySelectorAll('nav[aria-label="主导航"] .nav-group');
  expect(Array.from(groups).map(group=>group.querySelector('p')?.textContent)).toEqual(expected.map(group=>group[0]));
  expected.forEach((group,index)=>expect(Array.from(groups[index].querySelectorAll('button')).map(button=>button.textContent)).toEqual(group.slice(1)));
  const icons=Array.from(container.querySelectorAll('nav[aria-label="主导航"] button svg'));
  expect(icons).toHaveLength(9);expect(new Set(icons.map(icon=>icon.innerHTML)).size).toBe(9);
 }finally{vi.unstubAllGlobals();}
});

it('retains the QR page DOM and marks it inactive between module visits',()=>{
 viewport(false);
 try{
  render(<AppShell api={{} as PlannerApi}/>);fireEvent.click(screen.getByRole('button',{name:'二维码管理'}));
  const input=screen.getByLabelText('保留二维码状态');fireEvent.change(input,{target:{value:'保留展开和筛选'}});
  fireEvent.click(screen.getByRole('button',{name:'图号规划 / 更新包材'}));expect(input).not.toBeVisible();expect(input).toHaveAttribute('data-active','false');
  fireEvent.click(screen.getByRole('button',{name:'二维码管理'}));expect(screen.getByLabelText('保留二维码状态')).toBe(input);expect(input).toHaveValue('保留展开和筛选');expect(input).toHaveAttribute('data-active','true');
 }finally{vi.unstubAllGlobals();}
});
