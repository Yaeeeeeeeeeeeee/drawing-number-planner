import { useEffect, useRef, useState } from 'react';

import type { PlannerApi } from '../data/client';
import { DictionariesPage } from '../pages/DictionariesPage';
import { DrawingLibraryPage } from '../pages/DrawingLibraryPage';
import { ImportPage } from '../pages/ImportPage';
import { ProductsPage } from '../pages/ProductsPage';
import { PlanningPage } from '../pages/PlanningPage';
import { BomPage } from '../pages/BomPage';
import { FilesPage } from '../pages/FilesPage';
import { QrCodesPage } from '../pages/QrCodesPage';
import { OutboundPage } from '../pages/OutboundPage';
import { SafeRecovery } from '../components/SafeRecovery';
import { isBomMockEnabled } from '../pages/bom/bom-mock';
import { isFilesMockEnabled } from '../pages/files-mock';
import { isQrMockEnabled } from '../pages/qr-mock';
import { isOutboundMockEnabled } from '../pages/outbound/outbound-mock';
import { isProductsMockEnabled } from '../pages/products/products-mock';
import { isDictionariesMock } from '../pages/dictionaries-mock';
import { isPlanningMock } from '../pages/planning-mock';
import { isMigrationMock } from '../pages/migration-mock';
import { isRecoveryMock, RecoveryMockPage } from '../pages/recovery-mock';
import { isPublicUiMock, PublicUiMock } from '../pages/PublicUiMock';

type Page = 'drawings' | 'dictionaries' | 'products' | 'import' | 'planning' | 'bom' | 'files' | 'qr' | 'exports';
const navigation = [
  { label: '日常工作', items: [
    { key: 'planning', label: '图号规划 / 更新包材', icon: '规', enabled: true },
    { key: 'bom', label: 'BOM 管理', icon: 'B', enabled: true },
    { key: 'exports', label: '外发资料', icon: '外', enabled: true },
    { key: 'qr', label: '二维码管理', icon: '二', enabled: true },
  ] },
  { label: '基础资料', items: [
    { key: 'drawings', label: '图号库', icon: '图', enabled: true },
    { key: 'products', label: '产品档案', icon: '品', enabled: true },
    { key: 'files', label: 'PDF 文件中心', icon: 'P', enabled: true },
    { key: 'dictionaries', label: '编码字典', icon: '码', enabled: true },
    { key: 'import', label: '迁移检查', icon: '迁', enabled: true },
  ] },
] as const;

export function AppShell({ api }: { api: PlannerApi }) {
  const bomPreview = isBomMockEnabled();
  const filesPreview = isFilesMockEnabled();
  const publicUiPreview = isPublicUiMock();
  const recoveryPreview = isRecoveryMock();
  const previewPage = publicUiPreview ? 'recovery' : recoveryPreview ? 'recovery' : isMigrationMock() ? 'import' : isPlanningMock() ? 'planning' : isDictionariesMock() ? 'dictionaries' : isProductsMockEnabled() ? 'products' : isOutboundMockEnabled() ? 'exports' : isQrMockEnabled() ? 'qr' : filesPreview ? 'files' : bomPreview ? 'bom' : null;
  const [page, setPage] = useState<Page | 'recovery'>(publicUiPreview ? 'recovery' : previewPage ?? 'planning');
  const [selectedQrCodeId, setSelectedQrCodeId] = useState<number | null>(null);
  const [narrow, setNarrow] = useState(() => window.matchMedia?.('(max-width: 1279px)').matches ?? false);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const navigationToggle = useRef<HTMLButtonElement>(null);
  const navigationPanel = useRef<HTMLElement>(null);
  const modalWasOpen = useRef(false);
  useEffect(() => {
    const query = window.matchMedia?.('(max-width: 1279px)');
    if (!query) return;
    const change = () => {
      if (query.matches && document.activeElement?.closest('#workspace-navigation')) navigationToggle.current?.focus();
      setNarrow(query.matches); setNavigationOpen(false);
    };
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    if (!narrow || !navigationOpen) {
      // Restore after React removes inert; focusing an inert header during the event is ignored by browsers.
      if (modalWasOpen.current) navigationToggle.current?.focus();
      modalWasOpen.current = false;
      return;
    }
    modalWasOpen.current = true;
    const panel = navigationPanel.current;
    if (!panel) return;
    const focusable = () => [...panel.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')]
      .filter(element => !element.closest('[hidden], [inert], [aria-hidden="true"]') && getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility !== 'hidden');
    focusable()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === 'Escape') {
        event.preventDefault(); setNavigationOpen(false); navigationToggle.current?.focus();
      } else if (event.key === 'Tab') {
        const controls = focusable(), first = controls[0], last = controls.at(-1);
        if (!first || !last) return;
        if (!panel.contains(document.activeElement) || event.shiftKey && document.activeElement === first) {
          event.preventDefault(); (event.shiftKey ? last : first).focus();
        } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, [narrow, navigationOpen]);
  const closeNavigation = () => { setNavigationOpen(false); navigationToggle.current?.focus(); };
  const navigationVisible = narrow ? navigationOpen : !navigationOpen;
  const currentLabel = navigation.flatMap(group => [...group.items]).find(item => item.key === page)?.label ?? '开发预览';
  return <div className={`app-shell engineering-workspace ${navigationOpen ? 'navigation-open' : ''}`}>
    <header className="workspace-topbar" inert={narrow && navigationOpen} aria-hidden={narrow && navigationOpen ? true : undefined}>
      <button ref={navigationToggle} type="button" className="navigation-toggle" aria-controls="workspace-navigation"
        aria-expanded={navigationVisible} aria-label={navigationVisible ? '收起导航' : '展开导航'}
        onClick={() => setNavigationOpen(value => !value)}><span aria-hidden="true">☰</span></button>
      <strong className="workspace-brand">图号规划器</strong><span className="workspace-module">{currentLabel}</span>
    </header>
    {narrow && navigationOpen && <button type="button" tabIndex={-1} className="navigation-backdrop" aria-label="关闭导航遮罩" onClick={closeNavigation} />}
    <aside ref={navigationPanel} id="workspace-navigation" className="sidebar" inert={!navigationVisible}
      role={narrow ? 'dialog' : undefined} aria-label={narrow ? '工作导航' : undefined} aria-modal={narrow && navigationOpen ? true : undefined}>
      {narrow && <button className="secondary-button navigation-close" type="button" onClick={closeNavigation}>关闭导航</button>}
      <div className="brand-mark"><span className="brand-icon" aria-hidden="true">D</span><div><strong>工作导航</strong><small>DRAWING CONTROL</small></div></div>
    <nav aria-label="主导航">{navigation.map((group) => <section className="nav-group" key={group.label} aria-label={group.label}>
      <p className="nav-group-label">{group.label}</p>{group.items.map((item) => <button className={`nav-item ${page === item.key ? 'active' : ''}`} disabled={!item.enabled || (previewPage !== null && item.key !== previewPage)} onClick={() => item.enabled && (!previewPage || item.key === previewPage) && (setPage(item.key as Page), narrow && closeNavigation())} key={item.key} type="button">
        <span className="nav-label"><i aria-hidden="true">{item.icon}</i>{item.label}</span></button>)}</section>)}</nav>
    <div className="sidebar-footer">{recoveryPreview ? <RecoveryMockPage docked/> : previewPage ? <small>开发 Mock · 未连接业务服务</small> : <SafeRecovery api={api} />}</div></aside>
    <main className="workspace" inert={narrow && navigationOpen}>{publicUiPreview && <PublicUiMock/>}{page === 'drawings' && <DrawingLibraryPage api={api} />}{page === 'dictionaries' && <DictionariesPage api={api} />}
      {page === 'products' && <ProductsPage api={api} onOpenQr={(id) => { setSelectedQrCodeId(id); setPage('qr'); }} />}{page === 'import' && <ImportPage api={api} />}{page === 'planning' && <PlanningPage api={api} />}
      {page === 'bom' && <BomPage api={api} />}{page === 'exports' && <OutboundPage api={api} />}{page === 'files' && <FilesPage api={api} />}{page === 'qr' && <QrCodesPage api={api} initialQrCodeId={selectedQrCodeId} onOpened={() => setSelectedQrCodeId(null)} />}</main></div>;
}
