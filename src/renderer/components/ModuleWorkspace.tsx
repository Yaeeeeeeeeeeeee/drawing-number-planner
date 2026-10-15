import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Presentation only: folding never changes the selected record or business state. */
export function ModuleWorkspace({ children, navigation, detail, detailLabel, detailIdentity, onCloseDetail, preserveListWidth = false }: {
  children: ReactNode; navigation?: ReactNode; detail?: ReactNode; detailLabel: string;
  detailIdentity?: number | string; onCloseDetail(): void; preserveListWidth?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null), panel = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const [width, setWidth] = useState(0), [navigationOpen, setNavigationOpen] = useState(false);
  const closeRef = useRef(onCloseDetail); closeRef.current = onCloseDetail;
  useEffect(() => {
    const measure = () => setWidth(root.current?.getBoundingClientRect().width || window.innerWidth);
    measure(); const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (root.current) observer?.observe(root.current);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  // Reserve 800px for the list before adding a 340px detail or a 200px navigation.
  const detailDocked = width >= 1156;
  const navigationDocked = width >= (!preserveListWidth && detail && detailDocked ? 1372 : 1016);
  const scrollDetails = preserveListWidth && detail && detailDocked;
  const listWidth = Math.max(800, width - (navigation && navigationDocked ? 216 : 0));
  useEffect(() => {
    if (!preserveListWidth || !root.current) return;
    root.current.scrollLeft = detail && detailDocked ? root.current.scrollWidth - root.current.clientWidth : 0;
  }, [preserveListWidth, detailIdentity, detailDocked, width, Boolean(detail)]);
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
  return <div ref={root} className={`module-workspace-viewport ${preserveListWidth ? 'preserve-file-list' : ''}`}
    role={preserveListWidth ? 'region' : undefined} aria-label={preserveListWidth ? '文件工作区，可横向和纵向滚动' : undefined} tabIndex={preserveListWidth ? 0 : undefined}>
    <div className={`module-workspace ${detail && detailDocked ? 'detail-docked' : ''} ${navigation && navigationDocked ? 'navigation-docked' : ''}`}
      style={scrollDetails ? { width: width + 356, gridTemplateColumns: `${navigation && navigationDocked ? '200px ' : ''}${listWidth}px 340px` } : undefined}>
    {navigation && !navigationDocked && <button ref={toggle} className="secondary-button module-navigation-toggle" type="button"
      aria-expanded={navigationModal} onClick={() => setNavigationOpen(true)}>产品／批次导航</button>}
    <div className="module-list">{children}</div>
    {modal && <button className="module-backdrop" type="button" tabIndex={-1} aria-label="关闭辅助面板遮罩" onClick={closeModal} />}
    {navigation && <div ref={navigationModal ? panel : undefined} className={`module-navigation ${navigationModal ? 'module-drawer' : ''}`}
      hidden={!navVisible} role={navigationModal ? 'dialog' : undefined} aria-modal={navigationModal || undefined} aria-label="产品／批次导航" tabIndex={-1}>
      {!navigationDocked && <button type="button" className="secondary-button" onClick={() => setNavigationOpen(false)}>关闭产品导航</button>}
      <div onClick={event => { if (!navigationDocked && (event.target as HTMLElement).closest('button')) setNavigationOpen(false); }}>{navigation}</div>
    </div>}
    {detail && <div ref={detailModal ? panel : undefined} className={`module-detail ${detailModal ? 'module-drawer' : ''}`}
      role={detailModal ? 'dialog' : undefined} aria-modal={detailModal || undefined} aria-label={`${detailLabel}窗口`} tabIndex={-1}>{detail}</div>}
  </div></div>;
}
