import { useCallback, useEffect, useRef, useState } from 'react';

import type { LocalTaskView, PlannerApi } from '../data/client';
import { resetApiSession } from '../data/client';

type SurfaceStatus = { service: 'stopped' | 'starting' | 'running' | 'failed'; activeTask: LocalTaskView | null };
type RecoveryAction = 'terminateTask' | 'reloadRenderer' | 'restartService' | 'relaunchApp';

const active = (tasks: LocalTaskView[]) => tasks.find((task) => ['queued', 'running', 'finalizing'].includes(task.status)) ?? null;

export function SafeRecovery({ api }: { api: PlannerApi }) {
  const desktop = typeof window !== 'undefined' ? window.plannerDesktop : undefined;
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<SurfaceStatus>({ service: 'running', activeTask: null });
  const [busy, setBusy] = useState<RecoveryAction | null>(null);
  const [slow, setSlow] = useState(false);
  const [message, setMessage] = useState('');
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    try {
      if (desktop?.getRecoveryStatus) {
        const next = await desktop.getRecoveryStatus();
        if (mounted.current) setStatus(next);
      } else {
        const [health, tasks] = await Promise.all([api.checkServiceHealth(), api.listLocalTasks()]);
        if (mounted.current) setStatus({ service: health.status === 'ok' ? 'running' : 'failed', activeTask: active(tasks) });
      }
    } catch {
      if (mounted.current) setStatus((current) => ({ ...current, service: 'failed' }));
    }
  }, [api, desktop]);

  useEffect(() => {
    mounted.current = true; void refresh();
    const interval = window.setInterval(() => void refresh(), 3_000);
    const unsubscribe = desktop?.onServiceRestarted?.(() => { resetApiSession(); void refresh(); });
    return () => { mounted.current = false; window.clearInterval(interval); unsubscribe?.(); };
  }, [desktop, refresh]);

  const run = async (action: RecoveryAction) => {
    const invoke = desktop?.[action];
    if (!invoke || busy) return;
    if (action === 'relaunchApp' && !window.confirm('完整恢复将安全终止当前任务并重启应用，是否继续？')) return;
    setBusy(action); setSlow(false); setMessage('');
    const timer = window.setTimeout(() => { if (mounted.current) setSlow(true); }, 10_000);
    try {
      const result = await invoke.call(desktop);
      if (!result.ok) throw new Error(result.error?.message ?? '恢复操作失败');
      if (action === 'restartService') resetApiSession();
      if (mounted.current) setMessage(action === 'terminateTask' && !result.cancelled ? '当前没有可终止的任务' : '操作已完成');
      await refresh();
    } catch (error) {
      if (mounted.current) setMessage(error instanceof Error ? error.message : '恢复操作失败');
    } finally {
      window.clearTimeout(timer);
      if (mounted.current) { setBusy(null); setSlow(false); }
    }
  };

  const terminateWhileSlow = async () => {
    if (!desktop?.terminateTask) return;
    try {
      const result = await desktop.terminateTask();
      if (!result.ok) throw new Error(result.error?.message ?? '终止任务失败');
      if (mounted.current) setMessage(result.cancelled ? '已请求安全终止当前任务' : '当前没有可终止的任务');
    } catch (error) {
      if (mounted.current) setMessage(error instanceof Error ? error.message : '终止任务失败');
    }
  };

  const serviceUnavailable = status.service === 'failed' || status.service === 'stopped';
  const statusText = serviceUnavailable
    ? '本地服务异常'
    : status.service === 'starting' ? '正在启动本地服务…'
      : status.activeTask ? `正在${status.activeTask.progress?.message || '处理任务'}…` : '系统正常';
  const statusBusy = status.service === 'starting' || Boolean(status.activeTask);

  return <div className="safe-recovery">
    <div className={`system-status ${serviceUnavailable ? 'failed' : statusBusy ? 'busy' : ''}`}>
      <span className="connection-dot" />{statusText}
    </div>
    <button className="safe-recovery-trigger" type="button" onClick={() => setOpen((value) => !value)}>安全恢复</button>
    {open && <section className="safe-recovery-panel" aria-label="安全恢复面板">
      <strong>安全恢复</strong>
      {!desktop && <p className="desktop-only-note">安全恢复仅在 Windows 桌面版可用</p>}
      <button type="button" disabled={!desktop || Boolean(busy)} onClick={() => void run('terminateTask')}>终止当前任务</button>
      <button type="button" disabled={!desktop || Boolean(busy)} onClick={() => void run('reloadRenderer')}>重新加载界面</button>
      <button type="button" disabled={!desktop || Boolean(busy)} onClick={() => void run('restartService')}>重启本地服务</button>
      <button type="button" disabled={!desktop || Boolean(busy)} onClick={() => void run('relaunchApp')}>完整恢复应用</button>
      {message && <p className="recovery-message">{message}</p>}
      {slow && <div className="slow-recovery-warning" role="alert">
        <strong>当前操作响应较慢</strong><p>不会自动终止任务，请选择下一步。</p>
        <div><button type="button" onClick={() => setSlow(false)}>继续等待</button>
          <button type="button" onClick={() => void terminateWhileSlow()}>终止任务</button></div>
      </div>}
    </section>}
  </div>;
}
