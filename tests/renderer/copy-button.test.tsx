import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CopyButton } from '../../src/renderer/components/CopyButton';
describe('CopyButton', () => {
  it('keeps a named keyboard button and hint without visible action text', () => {
    render(<CopyButton label="复制路径" />);
    const button=screen.getByRole('button',{name:'复制路径'});
    expect(button).toHaveAttribute('title','复制路径');
    expect(button).toHaveAttribute('type','button');
    expect(button).not.toHaveTextContent('复制路径');
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden','true');
  });
  it('keeps the original click and disabled behaviour', () => {
    const click=vi.fn();const {rerender}=render(<CopyButton label="复制正文" onClick={click} />);
    fireEvent.click(screen.getByRole('button',{name:'复制正文'}));expect(click).toHaveBeenCalledTimes(1);
    rerender(<CopyButton label="复制正文" onClick={click} disabled />);
    fireEvent.click(screen.getByRole('button',{name:'复制正文'}));expect(click).toHaveBeenCalledTimes(1);
  });
  it('preserves a record-specific accessible name and status feedback', () => {
    render(<CopyButton label="复制路径" aria-label="复制说明书的完整路径"><span role="status">已复制</span></CopyButton>);
    expect(screen.getByRole('button',{name:'复制说明书的完整路径'})).toHaveAttribute('title','复制路径');
    expect(screen.getByRole('status')).toHaveTextContent('已复制');
  });
});
