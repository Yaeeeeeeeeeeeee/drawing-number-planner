import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PanelResizeHandle } from './PanelResizeHandle';
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

/** Layout only; panel movement never changes record selection or business state. */
export function ModuleWorkspace({ children, navigation, detail, detailLabel, detailIdentity, onCloseDetail, fileOverlay = false, resizable = false }: {
  children: ReactNode; navigation?: ReactNode; detail?: ReactNode; detailLabel: string;
  detailIdentity?: number | string; onCloseDetail(): void; fileOverlay?: boolean; resizable?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null), panel = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const [width, setWidth] = useState(0), [navigationOpen, setNavigationOpen] = useState(false);
  const [preferredNavigation, setPreferredNavigation] = useState(220), [preferredDetail, setPreferredDetail] = useState(380);
  const closeRef = useRef(onCloseDetail); closeRef.current = onCloseDetail;
  useEffect(() => {
    const measure = () => setWidth(root.current?.getBoundingClientRect().width || window.innerWidth);
    measure(); const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (root.current) observer?.observe(root.current);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  const maxNavigation = Math.max(180, Math.min(280, width - 820));
  const navigationWidth = clamp(preferredNavigation, 180, maxNavigation);
  const navigationDocked = width >= navigationWidth + 820;
  const centerWidth = width - (navigation && navigationDocked ? navigationWidth + 10 : 0);
  const maxDetail = Math.max(300, Math.min(480, centerWidth - (fileOverlay ? 420 : 810)));
  const detailWidth = clamp(preferredDetail, 300, maxDetail);
  const detailDocked = fileOverlay ? centerWidth >= 960 : centerWidth >= 800 + detailWidth + 10;
  const detailModal = Boolean(detail) && !detailDocked;
  const navigationModal = Boolean(navigation) && navigationOpen && !navigationDocked && !detailModal;
  const modal = detailModal ? 'detail' : navigationModal ? 'navigation' : null;
  const closeModal = () => modal === 'detail' ? closeRef.current() : setNavigationOpen(false);
  useEffect(() => {
    if (!modal || !panel.current) return;
    const current = panel.current, previousFocus = document.activeElement as HTMLElement | null;
    // Make every background sibling inert, including the shell header/navigation.
    const background: Array<[HTMLElement, boolean]> = [];
    for (let node: HTMLElement | null = current; node?.parentElement && node.parentElement !== document.body; node = node.parentElement) {
      for (const sibling of node.parentElement.children) if (sibling !== node && sibling instanceof HTMLElement && !sibling.classList.contains('module-backdrop')) {
        background.push([sibling, sibling.hasAttribute('inert')]); sibling.setAttribute('inert', '');
      }
    }
    const controls = () => [...current.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')]
      .filter(el => !el.closest('[hidden],[inert]') && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden');
    (controls()[0] ?? current).focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === 'Escape') { event.preventDefault(); modal === 'detail' ? closeRef.current() : setNavigationOpen(false); }
      if (event.key === 'Tab') {
        const all = controls(), first = all[0], last = all.at(-1);
        if (!first || !last) { event.preventDefault(); current.focus(); return; }
        if (!current.contains(document.activeElement) || event.shiftKey && document.activeElement === first) {
          event.preventDefault(); (event.shiftKey ? last : first).focus();
        } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      for (const [element, wasInert] of background) if (!wasInert) element.removeAttribute('inert');
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [modal, detailIdentity]);

  const navVisible = navigationDocked || navigationModal;
  return <div ref={root} className={`module-workspace-viewport p4-workspace ${fileOverlay ? 'file-workspace' : ''}`}>
    {(navigation && !navigationDocked || resizable && (preferredNavigation !== 220 || preferredDetail !== 380)) && <div className="module-workspace-tools">
      {navigation && !navigationDocked && <button ref={toggle} className="secondary-button module-navigation-toggle" type="button" aria-expanded={navigationModal} onClick={() => setNavigationOpen(true)}>产品／批次导航</button>}
      {resizable && (preferredNavigation !== 220 || preferredDetail !== 380) && <button className="text-button" type="button" onClick={() => { setPreferredNavigation(220); setPreferredDetail(380); }}>恢复默认宽度</button>}
    </div>}
    <div className={`p4-workspace-grid ${navigation && navigationDocked ? 'has-navigation' : ''}`} style={{ gridTemplateColumns: navigation && navigationDocked ? `${navigationWidth}px 10px minmax(0,1fr)` : 'minmax(0,1fr)' }}>
      {navigation && <div ref={navigationModal ? panel : undefined} className={`module-navigation ${navigationModal ? 'module-drawer' : ''}`} hidden={!navVisible}
        role={navigationModal ? 'dialog' : undefined} aria-modal={navigationModal || undefined} aria-label="产品／批次导航" tabIndex={-1}>
        {!navigationDocked && <button type="button" className="secondary-button" onClick={() => setNavigationOpen(false)}>关闭产品导航</button>}
        <div onClick={event => { if (!navigationDocked && (event.target as HTMLElement).closest('button')) setNavigationOpen(false); }}>{navigation}</div>
      </div>}
      {navigation && navigationDocked && resizable && <PanelResizeHandle label="调整产品导航宽度" value={navigationWidth} min={180} max={maxNavigation} onChange={setPreferredNavigation} />}
      <div className={`module-center ${detail && detailDocked && !fileOverlay ? 'docked-detail' : ''}`} style={{ gridTemplateColumns: detail && detailDocked && !fileOverlay ? `minmax(0,1fr) 10px ${detailWidth}px` : 'minmax(0,1fr)' }}>
        <div className="module-list">{children}</div>
        {detail && detailDocked && resizable && <PanelResizeHandle label="调整详情宽度" value={detailWidth} min={300} max={maxDetail} reversed onChange={setPreferredDetail} overlay={fileOverlay} />}
        {detail && <div ref={detailModal ? panel : undefined} className={`module-detail ${detailModal ? 'module-drawer' : fileOverlay ? 'file-detail-overlay' : ''}`}
          style={fileOverlay && detailDocked ? { width: detailWidth } : undefined}
          role={detailModal ? 'dialog' : undefined} aria-modal={detailModal || undefined} aria-label={`${detailLabel}窗口`} tabIndex={-1}>{detail}</div>}
      </div>
    </div>
    {modal && <button className="module-backdrop" type="button" tabIndex={-1} aria-label="关闭辅助面板遮罩" onClick={closeModal} />}
  </div>;
}
