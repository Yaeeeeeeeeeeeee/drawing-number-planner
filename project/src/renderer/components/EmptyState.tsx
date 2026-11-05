import { FileText, Package, Plus, Search } from 'lucide-react';

interface EmptyStateProps { title: string; description: string; symbol?: string }

export function EmptyState({ title, description, symbol = '⌕' }: EmptyStateProps) {
  const Icon = symbol === 'P' ? FileText : symbol === '品' ? Package : symbol === '＋' ? Plus : Search;
  return <div className="empty-state"><div className="empty-symbol" aria-hidden="true"><Icon size={22} strokeWidth={1.8}/></div><h2>{title}</h2><p>{description}</p></div>;
}
