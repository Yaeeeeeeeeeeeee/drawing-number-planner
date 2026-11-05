import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SafeRecovery } from '../../src/renderer/components/SafeRecovery';

afterEach(() => { delete window.plannerDesktop; });
describe('recovery result feedback', () => {
  it.each([
    [true, '终止请求已受理，任务是否终止尚未验证'],
    [false, '当前没有可终止的任务，未执行终止操作'],
    [undefined, '终止操作已返回，任务终止结果无法确认'],
  ])('does not equate cancellation %s with a terminal task', async (cancelled, text) => {
    window.plannerDesktop = { showFileInFolder: vi.fn(), terminateTask: vi.fn(async () => ({ ok: true, cancelled })) };
    render(<SafeRecovery api={{ checkServiceHealth: vi.fn(async () => ({ status: 'ok' })), listLocalTasks: vi.fn(async () => []) } as any}/>);
    fireEvent.click(screen.getByRole('button', { name: '安全恢复' }));
    fireEvent.click(screen.getByRole('button', { name: '终止当前任务' }));
    expect(await screen.findByText(text)).toBeVisible();
    expect(screen.queryByText('操作已完成')).toBeNull();
  });
  it.each([true, false])('verifies service health separately: %s', async healthy => {
    window.plannerDesktop = { showFileInFolder: vi.fn(), getRecoveryStatus: vi.fn(async () => ({ service: 'running' as const, activeTask: null })), restartService: vi.fn(async () => ({ ok: true })) };
    const check = vi.fn(async () => { if (!healthy) throw new Error('unavailable'); return { status: 'ok' }; });
    render(<SafeRecovery api={{ checkServiceHealth: check } as any}/>);
    fireEvent.click(screen.getByRole('button', { name: '安全恢复' }));
    fireEvent.click(screen.getByRole('button', { name: '重启本地服务' }));
    expect(await screen.findByText(healthy ? '本地服务已恢复，健康检查通过' : '服务重启已执行，恢复结果无法确认：健康检查失败')).toBeVisible();
    expect(check).toHaveBeenCalledOnce();
  });
});
