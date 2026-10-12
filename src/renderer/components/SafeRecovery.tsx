import { useCallback, useEffect, useRef, useState } from 'react';

import type { LocalTaskView, PlannerApi } from '../data/client';
import { resetApiSession } from '../data/client';

type SurfaceStatus = { service: 'stopped' | 'starting' | 'running' | 'failed'; activeTask: LocalTaskView | null };
type RecoveryAction = 'terminateTask' | 'reloadRenderer' | 'restartService' | 'relaunchApp';

const active = (tasks: LocalTaskView[]) => tasks.find((task) => ['queued', 'running', 'finalizing'].includes(task.status)) ?? null;
const taskProgressSnapshot = (task: LocalTaskView) => [task.id, task.status, task.progress.processed,
  task.progress.total ?? '', task.progress.phase, task.progress.message].join('|');

export function SafeRecovery({ api }: { api: PlannerApi }) {
  const desktop = typeof window !== 'undefined' ? window.plannerDesktop : undefined;
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<SurfaceStatus>({ service: 'running', activeTask: null });
  const [busy, setBusy] = useState<RecoveryAction | null>(null);
  const [slowTask, setSlowTask] = useState(false);
  const [message, setMessage] = useState('');
  const mounted = useRef(true);
  const slowTaskTimer = useRef<number | null>(null);
  const lastTaskSnapshot = useRef<string | null>(null);

  const clearSlowTaskTimer = useCallback(() => {
    if (slowTaskTimer.current !== null) window.clearTimeout(slowTaskTimer.current);
    slowTaskTimer.current = null;
  }, []);

  const observeTaskProgress = useCallback((task: LocalTaskView | null) => {
    if (!desktop || !task) {
      clearSlowTaskTimer(); lastTaskSnapshot.current = null;
      if (mounted.current) setSlowTask(false);
      return;
    }
    const snapshot = taskProgressSnapshot(task);
    if (snapshot === lastTaskSnapshot.current) return;
    lastTaskSnapshot.current = snapshot; clearSlowTaskTimer();
    if (mounted.current) setSlowTask(false);
    slowTaskTimer.current = window.setTimeout(() => {
      slowTaskTimer.current = null;
      if (mounted.current && lastTaskSnapshot.current === snapshot) setSlowTask(true);
    }, 10_000);
  }, [clearSlowTaskTimer, desktop]);

  const refresh = useCallback(async () => {
    try {
      if (desktop?.getRecoveryStatus) {
        const next = await desktop.getRecoveryStatus();
        if (mounted.current) { setStatus(next); observeTaskProgress(next.activeTask); }
      } else {
        const [health, tasks] = await Promise.all([api.checkServiceHealth(), api.listLocalTasks()]);
        const activeTask = active(tasks);
        if (mounted.current) { setStatus({ service: health.status === 'ok' ? 'running' : 'failed', activeTask }); observeTaskProgress(activeTask); }
      }
    } catch {
      if (mounted.current) setStatus((current) => ({ ...current, service: 'failed' }));
    }
  }, [api, desktop, observeTaskProgress]);

  useEffect(() => {
    mounted.current = true; void refresh();
    const interval = window.setInterval(() => void refresh(), 3_000);
    const unsubscribe = desktop?.onServiceRestarted?.(() => { resetApiSession(); void refresh(); });
    return () => { mounted.current = false; window.clearInterval(interval); clearSlowTaskTimer(); unsubscribe?.(); };
  }, [clearSlowTaskTimer, desktop, refresh]);

  const run = async (action: RecoveryAction) => {
    const invoke = desktop?.[action];
    if (!invoke || busy) return;
    if (action === 'relaunchApp' && !window.confirm('完整恢复将安全终止当前任务并重启应用，是否继续？')) return;
    setBusy(action); setSlowTask(false); setMessage('');
    try {
      const result = await invoke.call(desktop);
      if (!result.ok) throw new Error(result.error?.message ?? '恢复操作失败');
      if (action === 'restartService') resetApiSession();
      let feedback = '操作已执行，最终结果尚未验证';
      if (action === 'terminateTask') feedback = result.cancelled === true
        ? '终止请求已受理，任务是否终止尚未验证'
        : result.cancelled === false ? '当前没有可终止的任务，未执行终止操作' : '终止操作已返回，任务终止结果无法确认';
      if (action === 'reloadRenderer') feedback = '已执行界面重新加载，重新加载结果尚未验证';
      if (action === 'relaunchApp') feedback = '已执行应用重启，重启后的状态尚未验证';
      if (action === 'restartService') {
        try {
          const health = await api.checkServiceHealth();
          feedback = health.status === 'ok' ? '本地服务已恢复，健康检查通过' : '服务重启已执行，健康检查未通过';
        } catch { feedback = '服务重启已执行，恢复结果无法确认：健康检查失败'; }
      }
      if (mounted.current) setMessage(feedback);
      await refresh();
    } catch (error) {
      if (mounted.current) setMessage(`操作失败：${error instanceof Error ? error.message : '恢复操作失败'}`);
    } finally {
      if (mounted.current) setBusy(null);
    }
  };

  const continueWaiting = () => {
    lastTaskSnapshot.current = null;
    observeTaskProgress(status.activeTask);
  };

  const serviceUnavailable = status.service === 'failed' || status.service === 'stopped';
  const statusText = serviceUnavailable
    ? '本地服务异常'
    : status.service === 'starting' ? '正在启动本地服务…'
      : status.activeTask ? `正在${status.activeTask.progress?.message || '处理任务'}…` : '系统正常';
  const statusBusy = status.service === 'starting' || Boolean(status.activeTask);

  return <div className="safe-recovery integrated-recovery">
    <div className={`system-status ${serviceUnavailable ? 'failed' : statusBusy ? 'busy' : ''}`}>
      <span className="connection-dot" />{statusText}
    </div>
    <button className="safe-recovery-trigger" type="button" onClick={() => setOpen((value) => !value)}>安全恢复</button>
    {open && <section className="safe-recovery-panel" aria-label="安全恢复面板">
      <div className="integrated-recovery-heading"><strong>安全恢复</strong><button type="button" disabled={Boolean(busy)} onClick={() => setOpen(false)}>关闭</button></div>
      {!desktop && <p className="desktop-only-note">安全恢复仅在 Windows 桌面版可用</p>}
      <button type="button" disabled={!desktop || Boolean(busy)} onClick={() => void run('terminateTask')}>终止当前任务</button>
      <button type="button" disabled={!desktop || Boolean(busy)} onClick={() => void run('reloadRenderer')}>重新加载界面</button>
      <button type="button" disabled={!desktop || Boolean(busy)} onClick={() => void run('restartService')}>重启本地服务</button>
      <button type="button" disabled={!desktop || Boolean(busy)} onClick={() => void run('relaunchApp')}>完整恢复应用</button>
      {message && <p className="recovery-message">{message}</p>}
      {slowTask && !busy && <div className="slow-recovery-warning" role="alert">
        <strong>当前操作响应较慢</strong><p>后台任务长时间没有进展。不会自动终止任务，请选择下一步。</p>
        <div><button type="button" onClick={continueWaiting}>继续等待</button>
          <button type="button" onClick={() => void run('terminateTask')}>终止任务</button>
          <button type="button" onClick={() => void run('relaunchApp')}>安全恢复应用</button></div>
      </div>}
    </section>}
  </div>;
}
