export type LocalTaskStatus = 'queued' | 'running' | 'finalizing' | 'completed' | 'failed' | 'cancelled';

export interface LocalTaskProgress {
  processed: number;
  total: number | null;
  phase: string;
  message: string;
}

export interface LocalTaskError {
  code: string;
  message: string;
}

export interface LocalTaskView {
  id: string;
  kind: string;
  status: LocalTaskStatus;
  progress: LocalTaskProgress;
  cancelRequested: boolean;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  result?: unknown;
  error?: LocalTaskError;
}

export interface TaskContext {
  readonly id: string;
  readonly signal: AbortSignal;
  report(progress: LocalTaskProgress): void;
  throwIfCancelled(): void;
  beginFinalizing(): void;
}

export type LocalTaskHandler = (payload: unknown, context: TaskContext) => Promise<unknown> | unknown;
