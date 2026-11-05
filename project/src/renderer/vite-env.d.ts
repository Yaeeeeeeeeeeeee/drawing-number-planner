/// <reference types="vite/client" />

interface DesktopRecoveryResult { ok: boolean; cancelled?: boolean; error?: { code: string; message: string } }
interface DesktopRecoveryStatus {
  service: 'stopped' | 'starting' | 'running' | 'failed';
  activeTask: import('./data/client').LocalTaskView | null;
}
interface PlannerDesktop {
  getRecoveryStatus?(): Promise<DesktopRecoveryStatus>;
  terminateTask?(): Promise<DesktopRecoveryResult>;
  reloadRenderer?(): Promise<DesktopRecoveryResult>;
  restartService?(): Promise<DesktopRecoveryResult>;
  relaunchApp?(): Promise<DesktopRecoveryResult>;
  onServiceRestarted?(callback: () => void): () => void;
}
