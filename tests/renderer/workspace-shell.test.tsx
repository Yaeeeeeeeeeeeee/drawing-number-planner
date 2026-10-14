import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from '../../src/renderer/layout/AppShell';
import type { PlannerApi } from '../../src/renderer/data/client';

vi.mock('../../src/renderer/pages/PlanningPage', () => ({ PlanningPage: () => <label>规划输入<input aria-label="规划输入" /></label> }));
vi.mock('../../src/renderer/components/SafeRecovery', () => ({ SafeRecovery: () => <button>安全恢复</button> }));

function narrowScreen() {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
}

describe('responsive workspace navigation', () => {
  it('keeps the current page and input mounted when opening and closing navigation', () => {
    narrowScreen();
    try {
      render(<AppShell api={{} as PlannerApi} />);
      const input = screen.getByLabelText('规划输入');
      fireEvent.change(input, { target: { value: '尚未提交' } });
      const toggle = screen.getByRole('button', { name: '展开导航' });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      fireEvent.click(toggle);
      expect(screen.getByRole('dialog', { name: '工作导航' })).toHaveAttribute('aria-modal', 'true');
      expect(screen.getByRole('button', { name: '安全恢复' })).toBeVisible();
      fireEvent.click(screen.getByRole('button', { name: '关闭导航' }));
      expect(screen.getByLabelText('规划输入')).toBe(input);
      expect(input).toHaveValue('尚未提交');
    } finally { vi.unstubAllGlobals(); }
  });
  it('moves focus into narrow navigation and cycles Tab without reaching the workspace', () => {
    narrowScreen();
    try {
      render(<AppShell api={{} as PlannerApi} />);
      fireEvent.click(screen.getByRole('button', { name: '展开导航' }));
      const close = screen.getByRole('button', { name: '关闭导航' });
      expect(close).toHaveFocus();
      fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
      expect(screen.getByRole('button', { name: '安全恢复' })).toHaveFocus();
      fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
      expect(close).toHaveFocus();
      fireEvent.keyDown(close, { key: 'Escape' });
      expect(screen.getByRole('button', { name: '展开导航' })).toHaveFocus();
      expect(screen.getByLabelText('规划输入')).toBeVisible();
    } finally { vi.unstubAllGlobals(); }
  });
  it('closes narrow navigation with Escape and restores focus without navigating', () => {
    narrowScreen();
    try {
      render(<AppShell api={{} as PlannerApi} />);
      fireEvent.click(screen.getByRole('button', { name: '展开导航' }));
      fireEvent.keyDown(screen.getByRole('navigation', { name: '主导航' }), { key: 'Escape' });
      expect(screen.getByRole('button', { name: '展开导航' })).toHaveFocus();
      expect(screen.getByLabelText('规划输入')).toBeVisible();
    } finally { vi.unstubAllGlobals(); }
  });
});
