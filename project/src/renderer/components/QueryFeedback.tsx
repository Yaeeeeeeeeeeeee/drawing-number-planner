export type QueryState = 'idle' | 'loading' | 'failed' | 'ready';

export function QueryFeedback({ state, error, onRetry }: {
  state: QueryState; error: string; onRetry: () => void;
}) {
  if (state === 'ready') return null;
  if (state === 'failed') return <div role="alert" className="error-banner">
    <p>加载失败，尚不能确认查询结果。</p><p>{error}</p>
    <button type="button" className="secondary-button" onClick={onRetry}>重试加载</button>
  </div>;
  return <p role="status">{state === 'loading' ? '正在加载，请稍候…' : '尚未加载'}</p>;
}
