import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { PanelResizeHandle } from './PanelResizeHandle';
import { useWorkspaceExtent } from './useWorkspaceExtent';
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

/** Layout only; panel movement never changes record selection or business state. */
export function ModuleWorkspace({ children, navigation, detail, detailLabel, detailIdentity, onCloseDetail, fileWorkspace = false, resizable = false, drawingWorkspace = false }: {
  children: ReactNode; navigation?: ReactNode; detail?: ReactNode; detailLabel: string;
  detailIdentity?: number | string; onCloseDetail(): void; fileWorkspace?: boolean; resizable?: boolean; drawingWorkspace?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null), panel = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const navigationFocus = useRef<'toggle' | 'panel' | null>(null);
  const detailOrigin = useRef<HTMLElement | null>(null), hadDetail = useRef(false);
  const { width, height } = useWorkspaceExtent(root);
  const [navigationOpen, setNavigationOpen] = useState(false), [navigationCollapsed, setNavigationCollapsed] = useState(false);
  const [preferredNavigation, setPreferredNavigation] = useState(drawingWorkspace ? 260 : 220), [preferredDetail, setPreferredDetail] = useState(drawingWorkspace ? 560 : 380);
  const closeRef = useRef(onCloseDetail); closeRef.current = onCloseDetail;
  const maxNavigation = Math.max(180, Math.min(280, width - 820));
  const navigationWidth = clamp(preferredNavigation, 180, maxNavigation);
  const navigationDocked = width >= navigationWidth + 820 && !navigationCollapsed;
  const centerWidth = width - (navigation && navigationDocked ? navigationWidth + 10 : 0);
  const maxDetail = Math.max(300, Math.min(drawingWorkspace ? 600 : 480, centerWidth - 810));
  const detailWidth = clamp(drawingWorkspace && width < 1800 ? Math.min(520, preferredDetail) : preferredDetail, 300, maxDetail);
  const detailDocked = centerWidth >= 800 + detailWidth + 10;
  const detailModal = Boolean(detail) && !detailDocked;
  const navigationModal = Boolean(navigation) && navigationOpen && !navigationDocked && !detailModal;
  const modal = detailModal ? 'detail' : navigationModal ? 'navigation' : null;
  const closeModal = () => modal === 'detail' ? closeRef.current() : setNavigationOpen(false);
  useEffect(() => {
    if (detail) {
      const active = document.activeElement as HTMLElement | null;
      if (!hadDetail.current || !root.current?.querySelector('.module-detail')?.contains(active)) detailOrigin.current = active;
    } else if (hadDetail.current) {
      if (detailOrigin.current?.isConnected) detailOrigin.current.focus();
      detailOrigin.current = null;
    }
    hadDetail.current = Boolean(detail);
  }, [Boolean(detail), detailIdentity]);
  useEffect(() => {
    if (navigationDocked) setNavigationOpen(false);
    if (navigationFocus.current === 'toggle' && !navigationDocked) toggle.current?.focus();
    if (navigationFocus.current === 'panel' && navigationDocked) root.current?.querySelector<HTMLButtonElement>('.navigation-fold')?.focus();
    navigationFocus.current = null;
  }, [navigationDocked]);
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
    if (!current.contains(document.activeElement)) (controls()[0] ?? current).focus();
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
      const stillEditing = current.isConnected && !current.hidden && current.contains(document.activeElement);
      const origin = modal === 'detail' ? detailOrigin.current ?? previousFocus : previousFocus;
      if (!stillEditing && origin?.isConnected) origin.focus();
    };
  }, [modal, detailIdentity]);

  const navVisible = navigationDocked || navigationModal;
  return <div ref={root} className={`module-workspace-viewport p4-workspace adaptive-data-workspace ${fileWorkspace ? 'file-workspace' : ''} ${drawingWorkspace ? 'drawing-workspace' : ''}`} style={{ '--workspace-available-height': `${height}px` } as CSSProperties}>
    {(navigation && !navigationDocked || resizable && (preferredNavigation !== (drawingWorkspace ? 260 : 220) || preferredDetail !== (drawingWorkspace ? 560 : 380))) && <div className="module-workspace-tools">
      {navigation && !navigationDocked && <button ref={toggle} className="secondary-button module-navigation-toggle" type="button" aria-expanded={navigationModal} onClick={() => { const canDock = width >= navigationWidth + 820; if (canDock) navigationFocus.current = 'panel'; setNavigationCollapsed(false); setNavigationOpen(!canDock); }}>产品／批次导航</button>}
      {resizable && (preferredNavigation !== (drawingWorkspace ? 260 : 220) || preferredDetail !== (drawingWorkspace ? 560 : 380)) && <button className="text-button" type="button" onClick={() => { setPreferredNavigation(drawingWorkspace ? 260 : 220); setPreferredDetail(drawingWorkspace ? 560 : 380); }}>恢复默认宽度</button>}
    </div>}
    <div className={`p4-workspace-grid ${navigation && navigationDocked ? 'has-navigation' : ''}`} style={{ gridTemplateColumns: navigation && navigationDocked ? `${navigationWidth}px 10px minmax(0,1fr)` : 'minmax(0,1fr)' }}>
      {navigation && <div ref={navigationModal ? panel : undefined} className={`module-navigation ${navigationModal ? 'module-drawer' : ''}`} hidden={!navVisible}
        role={navigationModal ? 'dialog' : undefined} aria-modal={navigationModal || undefined} aria-label="产品／批次导航" tabIndex={-1}>
        {navigationDocked ? <button type="button" className="text-button navigation-fold" onClick={() => { navigationFocus.current = 'toggle'; setNavigationCollapsed(true); setNavigationOpen(false); }}>收起产品导航</button> : <button type="button" className="secondary-button" onClick={() => setNavigationOpen(false)}>关闭产品导航</button>}
        <div onClick={event => { if (!navigationDocked && (event.target as HTMLElement).closest('button')) setNavigationOpen(false); }}>{navigation}</div>
      </div>}
      {navigation && navigationDocked && resizable && <PanelResizeHandle label="调整产品导航宽度" value={navigationWidth} min={180} max={maxNavigation} onChange={setPreferredNavigation} />}
      <div className={`module-center ${detail && detailDocked ? 'docked-detail' : ''}`} style={{ gridTemplateColumns: detail && detailDocked ? `minmax(0,1fr) 10px ${detailWidth}px` : 'minmax(0,1fr)' }}>
        <div className="module-list">{children}</div>
        {detail && detailDocked && resizable && <PanelResizeHandle label="调整详情宽度" value={detailWidth} min={300} max={maxDetail} reversed onChange={setPreferredDetail} />}
        {detail && <div ref={detailModal ? panel : undefined} className={`module-detail ${detailModal ? 'module-drawer' : ''}`}
          role={detailModal ? 'dialog' : undefined} aria-modal={detailModal || undefined} aria-label={`${detailLabel}窗口`} tabIndex={-1}>{detail}</div>}
      </div>
    </div>
    {modal && <button className="module-backdrop" type="button" tabIndex={-1} aria-label="关闭辅助面板遮罩" onClick={closeModal} />}
  </div>;
}
