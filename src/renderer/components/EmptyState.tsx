import type { ReactNode } from 'react';
import { FileText, Package, Plus, Search } from 'lucide-react';

interface EmptyStateProps { title: string; description: string; symbol?: string; children?: ReactNode }

export function EmptyState({ title, description, symbol = '⌕', children }: EmptyStateProps) {
  const Icon = symbol === 'P' ? FileText : symbol === '品' ? Package : symbol === '＋' ? Plus : Search;
  return <div className="empty-state"><div className="empty-symbol" aria-hidden="true"><Icon size={22} strokeWidth={1.8}/></div><h2>{title}</h2><p>{description}</p>{children}</div>;
}
