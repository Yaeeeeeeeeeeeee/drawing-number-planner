import { useRef } from 'react';

export function PanelResizeHandle({ label, value, min, max, reversed = false, onChange, overlay = false }: {
  label: string; value: number; min: number; max: number; reversed?: boolean; onChange(value: number): void; overlay?: boolean;
}) {
  const drag = useRef<{ x: number; width: number } | null>(null);
  const set = (next: number) => onChange(Math.max(min, Math.min(next, max)));
  return <div className={`panel-resize-handle ${overlay ? 'overlay-resize-handle' : ''}`} role="separator" aria-label={label}
    aria-orientation="vertical" aria-valuemin={min} aria-valuemax={max} aria-valuenow={Math.round(value)} tabIndex={0}
    style={overlay ? { right: value } : undefined}
    onKeyDown={event => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); set(value + (event.key === 'ArrowRight' ? 16 : -16) * (reversed ? -1 : 1)); }
      else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); set(event.key === 'Home' ? min : max); }
    }}
    onPointerDown={event => { if (event.button !== 0) return; drag.current = { x: event.clientX, width: value }; event.currentTarget.setPointerCapture(event.pointerId); }}
    onPointerMove={event => { if (drag.current) set(drag.current.width + (event.clientX - drag.current.x) * (reversed ? -1 : 1)); }}
    onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} />;
}
