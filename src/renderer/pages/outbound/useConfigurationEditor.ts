import { useEffect, useRef, useState } from 'react';
export type LeaveGuard = () => boolean;
export type RegisterLeaveGuard = (guard: LeaveGuard | null) => void;
export function useConfigurationEditor(value: unknown, registerLeaveGuard?: RegisterLeaveGuard) {
  const baseline = useRef('null');
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const serialized = JSON.stringify(value);
  const canLeave = () => !lock.current && (serialized === baseline.current || window.confirm('有未保存的修改，确认放弃？'));
  useEffect(() => { registerLeaveGuard?.(canLeave); return () => registerLeaveGuard?.(null); }, [serialized, busy, registerLeaveGuard]);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => { if (lock.current || serialized !== baseline.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [serialized]);
  return { busy, canLeave,
    begin(next: unknown, apply: () => void) { if (!canLeave()) return; baseline.current = JSON.stringify(next); apply(); },
    reset() { baseline.current = 'null'; },
    async run(operation: () => Promise<unknown>) {
      if (lock.current) return false;
      lock.current = true; setBusy(true);
      try { await operation(); return true; } finally { lock.current = false; setBusy(false); }
    },
  };
}
