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
    expect(screen.getByRole('button', { name: /图号规划 \/ 更新包材/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /BOM 管理/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /PDF 文件中心/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /外发资料/ })).toBeDisabled();
    expect(screen.getByRole('heading', { name: '图号规划' })).toBeVisible();
    expect(screen.getByText('Phase 4 · PDF 文件中心')).toBeVisible();
  });
});
