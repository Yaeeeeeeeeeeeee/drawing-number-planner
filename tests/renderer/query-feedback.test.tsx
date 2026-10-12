import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QueryFeedback } from '../../src/renderer/components/QueryFeedback';

describe('query feedback', () => {
  it('distinguishes idle and loading without asserting an empty result', () => {
    const view = render(<QueryFeedback state="idle" error="" onRetry={() => undefined}/>);
    expect(screen.getByRole('status')).toHaveTextContent('尚未加载');
    view.rerender(<QueryFeedback state="loading" error="" onRetry={() => undefined}/>);
    expect(screen.getByRole('status')).toHaveTextContent('正在加载');
  });
  it('offers an explicit retry only after failure', () => {
    const retry = vi.fn();
    render(<QueryFeedback state="failed" error="服务不可用" onRetry={retry}/>);
    expect(screen.getByRole('alert')).toHaveTextContent('尚不能确认查询结果');
    fireEvent.click(screen.getByRole('button', { name: '重试加载' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
  it('leaves successful result rendering to the page', () => {
    const { container } = render(<QueryFeedback state="ready" error="" onRetry={() => undefined}/>);
    expect(container).toBeEmptyDOMElement();
  });
});
