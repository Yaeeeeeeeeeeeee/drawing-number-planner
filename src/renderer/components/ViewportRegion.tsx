import { useRef, type CSSProperties, type ReactNode } from 'react';
import { useWorkspaceExtent } from './useWorkspaceExtent';

/** A bounded data region, with natural height when records are few. */
export function ViewportRegion({ children, className = '', fraction = 1 }: { children: ReactNode; className?: string; fraction?: number }) {
  const root = useRef<HTMLDivElement>(null);
  const { height } = useWorkspaceExtent(root);
  return <div ref={root} className={`viewport-region ${className}`} style={{ '--data-region-height': `${Math.max(160, Math.floor(height * fraction))}px` } as CSSProperties}>{children}</div>;
}
