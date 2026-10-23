import { useModalFocus } from './useModalFocus';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronsLeft } from 'lucide-react';
import { PanelResizeHandle } from './PanelResizeHandle';
import { useWorkspaceExtent } from './useWorkspaceExtent';
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

/** Layout only; panel movement never changes record selection or business state. */
export function ModuleWorkspace({ children, navigation, detail, detailLabel, detailIdentity, onCloseDetail, fileWorkspace = false, resizable = false, drawingWorkspace = false, hideLayoutReset = false }: {
  children: ReactNode; navigation?: ReactNode | ((controls: {collapseControl: ReactNode}) => ReactNode); detail?: ReactNode; detailLabel: string;
  detailIdentity?: number | string; onCloseDetail(): void; fileWorkspace?: boolean; resizable?: boolean; drawingWorkspace?: boolean; hideLayoutReset?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null), panel = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const navigationFocus = useRef<'toggle' | 'panel' | null>(null);
  const detailOrigin = useRef<HTMLElement | null>(null), hadDetail = useRef(false);
  const { width, height } = useWorkspaceExtent(root);
  const [navigationOpen, setNavigationOpen] = useState(false), [navigationCollapsed, setNavigationCollapsed] = useState(false);
  const catalogWorkspace = fileWorkspace || drawingWorkspace;
  const defaultNavigation = catalogWorkspace ? 300 : 220;
  const minimumNavigation = catalogWorkspace ? 260 : 180;
  const [preferredNavigation, setPreferredNavigation] = useState(defaultNavigation), [preferredDetail, setPreferredDetail] = useState(drawingWorkspace ? 640 : 380);
  const closeRef = useRef(onCloseDetail); closeRef.current = onCloseDetail;
  useEffect(()=>{const reset=()=>{setPreferredNavigation(defaultNavigation);setPreferredDetail(drawingWorkspace?640:380);};window.addEventListener('module-workspace:reset-layout',reset);return()=>window.removeEventListener('module-workspace:reset-layout',reset);},[defaultNavigation,drawingWorkspace]);
  const maxNavigation = Math.max(minimumNavigation, Math.min(catalogWorkspace ? 420 : 280, width - 820));
  const navigationWidth = clamp(preferredNavigation, minimumNavigation, maxNavigation);
  const navigationDocked = width >= navigationWidth + 820 && !navigationCollapsed;
  const centerWidth = width - (navigation && navigationDocked ? navigationWidth + 10 : 0);
  const maxDetail = drawingWorkspace ? 680 : Math.max(300, Math.min(480, centerWidth - 810));
  const detailWidth = clamp(preferredDetail, drawingWorkspace ? 600 : 300, maxDetail);
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
  useModalFocus({ panel, open: Boolean(modal), identity: `${modal}-${detailIdentity ?? ''}`,
    onClose: () => modal === 'detail' ? closeRef.current() : setNavigationOpen(false),
    returnFocus: () => modal === 'detail' ? detailOrigin.current : null,
  });

  const navVisible = navigationDocked || navigationModal;
  const closeNavigation = () => { if(navigationDocked) { navigationFocus.current = 'toggle'; setNavigationCollapsed(true); } setNavigationOpen(false); };
  const collapseControl = <button type="button" className="text-button navigation-fold" aria-label={navigationDocked ? '收起产品导航' : '关闭产品导航'} title={navigationDocked ? '收起产品导航' : '关闭产品导航'} onClick={closeNavigation}><ChevronsLeft size={18} strokeWidth={1.8} aria-hidden="true"/></button>;
  const integratedNavigation = typeof navigation === 'function';
  return <div ref={root} className={`module-workspace-viewport p4-workspace adaptive-data-workspace ${fileWorkspace ? 'file-workspace' : ''} ${drawingWorkspace ? 'drawing-workspace' : ''}`} style={{ '--workspace-available-height': `${height}px` } as CSSProperties}>
    {(navigation && !navigationDocked || !hideLayoutReset && resizable && (preferredNavigation !== defaultNavigation || preferredDetail !== (drawingWorkspace ? 640 : 380))) && <div className="module-workspace-tools">
      {navigation && !navigationDocked && <button ref={toggle} className="secondary-button module-navigation-toggle" type="button" aria-expanded={navigationModal} onClick={() => { const canDock = width >= navigationWidth + 820; if (canDock) navigationFocus.current = 'panel'; setNavigationCollapsed(false); setNavigationOpen(!canDock); }}>产品／批次导航</button>}
      {!hideLayoutReset && resizable && (preferredNavigation !== defaultNavigation || preferredDetail !== (drawingWorkspace ? 640 : 380)) && <button className="text-button" type="button" onClick={() => { setPreferredNavigation(defaultNavigation); setPreferredDetail(drawingWorkspace ? 640 : 380); }}>恢复默认宽度</button>}
    </div>}
    <div className={`p4-workspace-grid ${navigation && navigationDocked ? 'has-navigation' : ''}`} style={{ gridTemplateColumns: navigation && navigationDocked ? `${navigationWidth}px 10px minmax(0,1fr)` : 'minmax(0,1fr)' }}>
      {navigation && <div ref={navigationModal ? panel : undefined} className={`module-navigation ${navigationModal ? 'module-drawer' : ''}`} hidden={!navVisible}
        role={navigationModal ? 'dialog' : undefined} aria-modal={navigationModal || undefined} aria-label="产品／批次导航" tabIndex={-1}>
        {!integratedNavigation && (navigationDocked ? <button type="button" className="text-button navigation-fold" onClick={closeNavigation}>收起产品导航</button> : <button type="button" className="secondary-button" onClick={closeNavigation}>关闭产品导航</button>)}
        <div className="module-navigation-content" onClick={event => { if (!navigationDocked && (event.target as HTMLElement).closest(fileWorkspace || integratedNavigation ? '[data-navigation-select]' : 'button')) setNavigationOpen(false); }}>{typeof navigation === 'function' ? navigation({collapseControl}) : navigation}</div>
      </div>}
      {navigation && navigationDocked && resizable && <PanelResizeHandle label="调整产品导航宽度" value={navigationWidth} min={minimumNavigation} max={maxNavigation} onChange={setPreferredNavigation} />}
      <div className={`module-center ${detail && detailDocked ? 'docked-detail' : ''}`} style={{ gridTemplateColumns: detail && detailDocked ? `minmax(0,1fr) 10px ${detailWidth}px` : 'minmax(0,1fr)' }}>
        <div className="module-list">{children}</div>
        {detail && detailDocked && resizable && <PanelResizeHandle label="调整详情宽度" value={detailWidth} min={drawingWorkspace ? 600 : 300} max={maxDetail} reversed onChange={setPreferredDetail} />}
        {detail && <div ref={detailModal ? panel : undefined} className={`module-detail ${detailModal ? 'module-drawer' : ''}`}
          role={detailModal ? 'dialog' : undefined} aria-modal={detailModal || undefined} aria-label={`${detailLabel}窗口`} tabIndex={-1}>{detail}</div>}
      </div>
    </div>
    {modal && <button className="module-backdrop" type="button" tabIndex={-1} aria-label="关闭辅助面板遮罩" onClick={closeModal} />}
  </div>;
}
