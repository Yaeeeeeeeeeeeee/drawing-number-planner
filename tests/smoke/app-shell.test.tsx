import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from '../../src/renderer/App';

describe('application shell', () => {
  it('shows the product name and primary navigation', () => {
    render(<App />);

    expect(screen.getByText('图号规划器')).toBeVisible();
    expect(screen.getByRole('navigation')).toBeVisible();
    expect(screen.getByRole('button', { name: /图号规划/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /BOM 管理/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /PDF 文件中心/ })).toBeEnabled();
    expect(screen.getByText('Phase 4 · PDF 文件中心')).toBeVisible();
  });
});
