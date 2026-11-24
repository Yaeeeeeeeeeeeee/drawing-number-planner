import './dictionary-actions.css';
import { useId, useRef, useState, type ReactNode } from 'react';

export function DictionaryMoreActions({ name, children }: { name: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  return <div className="dictionary-more-actions"
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
    onKeyDown={event => {
      if (open && event.key === 'Escape') {
        event.stopPropagation();
        close();
      }
    }}>
    <button className="text-button" type="button" ref={trigger} aria-expanded={open}
      aria-controls={open ? id : undefined} aria-label={`更多 ${name}`} onClick={() => setOpen(!open)}>更多</button>
    {open && <div role="group" aria-label={`${name} 的更多操作`} id={id} onClick={close}>{children}</div>}
  </div>;
}
