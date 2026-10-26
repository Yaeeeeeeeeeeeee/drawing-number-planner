import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Minus, Plus, RotateCcw, X } from 'lucide-react';
import './image-preview-dialog.css';
export interface PreviewImage { id: string | number; src: string; name?: string }
export function ImagePreviewDialog({ images, initialIndex = 0, onClose }: { images: PreviewImage[]; initialIndex?: number; onClose(): void }) {
  const [index, setIndex] = useState(Math.max(0, Math.min(initialIndex, images.length - 1)));
  const [scale, setScale] = useState(1), [pan, setPan] = useState({ x: 0, y: 0 }), [failed, setFailed] = useState(false);
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const close = useRef<HTMLButtonElement>(null);
  const image = images[Math.min(index, images.length - 1)];
  const change = (delta: number) => setIndex(current => (current + delta + images.length) % images.length);
  const fit = () => { setScale(1); setPan({ x: 0, y: 0 }); };
  const zoom = (factor: number) => setScale(current => Math.min(8, Math.max(.25, Math.round(current * factor * 100) / 100)));
  useEffect(() => { fit(); setFailed(false); }, [image?.id, image?.src]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    close.current?.focus();
    const handle = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
      if (images.length > 1 && ['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); change(event.key === 'ArrowLeft' ? -1 : 1); }
      if (event.key === 'Tab') {
        const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.image-preview-dialog button:not(:disabled)'));
        const first = buttons[0], last = buttons.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', handle,true);
    return () => { window.removeEventListener('keydown', handle,true); previous?.focus(); };
  }, [onClose, images.length]);
  if (!image) return null;
  const icon = { size: 18, strokeWidth: 1.8 };
  return createPortal(<div className="image-preview-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-label="图片预览" className="image-preview-dialog">
      <header><span>{images.length > 1 ? `${index + 1} / ${images.length}` : '图片预览'}</span><div>
        <button type="button" aria-label="缩小" onClick={() => zoom(.8)}><Minus {...icon}/></button>
        <button type="button" aria-label="放大" onClick={() => zoom(1.25)}><Plus {...icon}/></button>
        <button type="button" aria-label="适应窗口" onClick={fit}><RotateCcw {...icon}/></button>
        {images.length > 1 && <><button type="button" aria-label="上一张" onClick={() => change(-1)}><ChevronLeft {...icon}/></button><button type="button" aria-label="下一张" onClick={() => change(1)}><ChevronRight {...icon}/></button></>}
        <button ref={close} type="button" aria-label="关闭图片预览" onClick={onClose}><X {...icon}/></button>
      </div></header>
      <div className="image-preview-surface" aria-label="图片拖动区域" onWheel={event => zoom(event.deltaY < 0 ? 1.1 : 1 / 1.1)}
        onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture?.(event.pointerId); drag.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y }; }}
        onPointerMove={event => { if (!drag.current) return; setPan({ x: drag.current.panX + event.clientX - drag.current.x, y: drag.current.panY + event.clientY - drag.current.y }); }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
        {failed ? <p role="alert">图片无法读取，请检查文件或重新加载。</p> : <img src={image.src} alt={image.name ?? '图片'} title={image.name} draggable={false} onError={() => setFailed(true)} style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}/>}
      </div>
    </section>
  </div>, document.body);
}
