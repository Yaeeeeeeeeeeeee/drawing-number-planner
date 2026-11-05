import type { ButtonHTMLAttributes, ReactNode } from 'react';

type CopyButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  label: string;
  kind?: 'clipboard' | 'files';
  children?: ReactNode;
};

/** Presentation only: callers retain their clipboard/file action and feedback. */
export function CopyButton({ label, kind = 'clipboard', className = '', children, ...props }: CopyButtonProps) {
  return <button {...props} type={props.type ?? 'button'} className={`copy-icon-button ${className}`} aria-label={props['aria-label'] ?? label} title={props.title ?? label}>
    <svg aria-hidden="true" focusable="false" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      {kind === 'files' ? <><path d="M3 9V6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v3"/><rect x="9" y="11" width="11" height="10" rx="1"/><path d="M6 11v7h1"/></> : <><rect x="9" y="9" width="11" height="12" rx="2"/><path d="M15 6V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h1"/></>}
    </svg>{children}
  </button>;
}
