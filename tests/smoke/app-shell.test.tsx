import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from '../../src/renderer/App';

describe('application shell', () => {
  it('shows the product name and primary navigation', () => {
    render(<App />);

    expect(screen.getByText('图号规划器')).toBeVisible();
    expect(screen.getByRole('navigation')).toBeVisible();
    expect(screen.getByText('日常工作')).toBeVisible();
    expect(screen.getByText('基础资料')).toBeVisible();
    const navGroups = Array.from(screen.getByRole('navigation').querySelectorAll<HTMLElement>('.nav-group'));
    expect(navGroups.map((group) => group.getAttribute('aria-label'))).toEqual(['日常工作', '基础资料']);
    expect(Array.from(navGroups[0].querySelectorAll('button')).map((button) => button.textContent)).toEqual([
      '规图号规划 / 更新包材', 'BBOM 管理', '二二维码管理', '外外发资料未开放',
    ]);
    expect(Array.from(navGroups[1].querySelectorAll('button')).map((button) => button.textContent)).toEqual([
      '图图号库', '品产品档案', 'PPDF 文件中心', '码编码字典', '迁迁移检查',
    ]);
    expect(screen.getByRole('button', { name: /图号规划 \/ 更新包材/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /BOM 管理/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /二维码管理/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /PDF 文件中心/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /外发资料/ })).toBeDisabled();
    expect(screen.getByRole('heading', { name: '图号规划' })).toBeVisible();
    expect(screen.getByText('Phase 4 · PDF 文件中心')).toBeVisible();
  });
});
