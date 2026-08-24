interface EmptyStateProps { title: string; description: string; symbol?: string }

export function EmptyState({ title, description, symbol = '⌕' }: EmptyStateProps) {
  return <div className="empty-state"><div className="empty-symbol">{symbol}</div><h2>{title}</h2><p>{description}</p></div>;
}
