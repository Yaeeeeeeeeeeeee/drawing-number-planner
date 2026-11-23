import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ActionToast } from '../../src/renderer/components/ActionToast';

afterEach(() => vi.useRealTimers());

describe('action feedback', () => {
  it('announces the action, dismisses it automatically, and shows the next result', () => {
    vi.useFakeTimers();
    const view = render(<ActionToast message="已保存" />);
    expect(screen.getByRole('status')).toHaveTextContent('已保存');
    act(() => vi.advanceTimersByTime(4000));
    expect(screen.queryByText('已保存')).toBeNull();

    view.rerender(<ActionToast message="已重新检查临时文件" />);
    expect(screen.getByRole('status')).toHaveTextContent('已重新检查临时文件');
    fireEvent.click(screen.getByRole('button', { name: '关闭提示' }));
    expect(screen.queryByText('已重新检查临时文件')).toBeNull();
  });
});
