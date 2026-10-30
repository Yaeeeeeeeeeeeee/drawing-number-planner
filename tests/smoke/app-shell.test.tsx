import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from '../../src/renderer/App';

describe('application shell', () => {
  it('shows the product name and primary navigation', () => {
    render(<App />);

    expect(screen.getByText('图号规划器')).toBeVisible();
    expect(screen.getByRole('navigation')).toBeVisible();
    expect(screen.getByText('日常工作')).toBeVisible();
    expect(screen.getByText('产品明细')).toBeVisible();
    expect(screen.getByText('数据来源')).toBeVisible();
    const navGroups = Array.from(screen.getByRole('navigation').querySelectorAll<HTMLElement>('.nav-group'));
    expect(navGroups.map((group) => group.getAttribute('aria-label'))).toEqual(['日常工作', '产品明细', '数据来源']);
    expect(Array.from(navGroups[0].querySelectorAll('button')).map((button) => button.textContent)).toEqual([
      '图号规划 / 更新包材', 'BOM 管理', '外发资料',
    ]);
    expect(Array.from(navGroups[1].querySelectorAll('button')).map((button) => button.textContent)).toEqual([
      '产品档案', '图号库', '二维码管理',
    ]);
    expect(Array.from(navGroups[2].querySelectorAll('button')).map((button) => button.textContent)).toEqual(['PDF 文件中心','包材模板','编码字典','迁移检查']);
    expect(screen.getByRole('button', { name: /图号规划 \/ 更新包材/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /BOM 管理/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /二维码管理/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /PDF 文件中心/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /外发资料/ })).toBeEnabled();
    expect(screen.getByRole('heading', { name: '图号规划' })).toBeVisible();
    expect(screen.getByText('系统正常')).toBeVisible();
    expect(screen.getByRole('button', { name: '安全恢复' })).toBeVisible();
  });
});
