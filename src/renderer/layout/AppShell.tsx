import { DraftingCompass, ClipboardList, PackageCheck, Boxes, LibraryBig, QrCode, Files, BookOpen, ShieldCheck, Menu, ChevronsLeft, PenTool } from 'lucide-react';
import type { ProductVersionTarget } from '../pages/products/ProductAppearancePanel';
import { useCallback, useEffect, useRef, useState } from 'react';

import { PackagingTemplatesPage } from '../pages/PackagingTemplatesPage';
import type { PackagingNavigationTarget } from '../pages/packaging/PackagingTaskPanel';
import type { PlannerApi } from '../data/client';
import { DictionariesPage } from '../pages/DictionariesPage';
import { DrawingLibraryPage } from '../pages/DrawingLibraryPage';
import { ImportPage } from '../pages/ImportPage';
import type { ProductQrTarget } from '../pages/products/product-qr-navigation';
import { ProductsPage } from '../pages/ProductsPage';
import { PlanningPage } from '../pages/PlanningPage';
import { BomPage } from '../pages/BomPage';
import { FilesPage, type DrawingPdfNavigationTarget } from '../pages/FilesPage';
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

type Page = 'drawings' | 'dictionaries' | 'products' | 'import' | 'planning' | 'bom' | 'files' | 'qr' | 'exports' | 'packaging';
const navigation = [
  { label: '日常工作', items: [
    { key: 'planning', label: '图号规划 / 更新包材', icon: DraftingCompass, enabled: true },
    { key: 'bom', label: 'BOM 管理', icon: ClipboardList, enabled: true },
    { key: 'exports', label: '外发资料', icon: PackageCheck, enabled: true },
  ] },
  { label: '产品明细', items: [
    { key: 'products', label: '产品档案', icon: Boxes, enabled: true },
    { key: 'drawings', label: '图号库', icon: LibraryBig, enabled: true },
    { key: 'qr', label: '二维码管理', icon: QrCode, enabled: true },
  ] },
  { label: '数据来源', items: [
    { key: 'files', label: 'PDF 文件中心', icon: Files, enabled: true },
    { key: 'packaging', label: '包材模板', icon: PenTool, enabled: true },
    { key: 'dictionaries', label: '编码字典', icon: BookOpen, enabled: true },
    { key: 'import', label: '迁移检查', icon: ShieldCheck, enabled: true },
  ] },
] as const;

export function AppShell({ api }: { api: PlannerApi }) {
  const bomPreview = isBomMockEnabled();
  const filesPreview = isFilesMockEnabled();
  const publicUiPreview = isPublicUiMock();
  const recoveryPreview = isRecoveryMock();
  const previewPage = publicUiPreview ? 'recovery' : recoveryPreview ? 'recovery' : isMigrationMock() ? 'import' : isPlanningMock() ? 'planning' : isDictionariesMock() ? 'dictionaries' : isProductsMockEnabled() ? 'products' : isOutboundMockEnabled() ? 'exports' : isQrMockEnabled() ? 'qr' : filesPreview ? 'files' : bomPreview ? 'bom' : null;
  const [page, setPage] = useState<Page | 'recovery'>(publicUiPreview ? 'recovery' : previewPage ?? 'planning');
  const drawingLeaveGuard = useRef<(() => boolean) | null>(null);
  const registerDrawingLeaveGuard = useCallback((guard: (() => boolean) | null) => { drawingLeaveGuard.current = guard; }, []);
  const outboundLeaveGuard = useRef<(() => boolean) | null>(null);
  const registerOutboundLeaveGuard = useCallback((guard: (() => boolean) | null) => { outboundLeaveGuard.current = guard; }, []);
  const navigatePage = (next: Page) => {
    if (page === 'drawings' && next !== page && drawingLeaveGuard.current && !drawingLeaveGuard.current()) return;
    if (page === 'exports' && next !== page && outboundLeaveGuard.current && !outboundLeaveGuard.current()) return;
    setPage(next);
    setVersionTarget(null);setDrawingBomTarget(null);
    if (next === 'drawings') setDrawingTarget(undefined);
    if (next === 'qr') setProductQrTarget(null);
    if (next === 'files') setDrawingPdfTarget(null);
    if (narrow) closeNavigation();
  };
  const [versionTarget, setVersionTarget] = useState<ProductVersionTarget | null>(null);
  const [drawingBomTarget,setDrawingBomTarget]=useState<{productId:number;bomVersionId:number}|null>(null);
  const [drawingTarget, setDrawingTarget] = useState<{productId:number;appearanceVersionId?:number;revision?:number}>();
  const [packagingTarget,setPackagingTarget]=useState<PackagingNavigationTarget|null>(null);
  const [packagingVisited,setPackagingVisited]=useState(false);
  useEffect(()=>{if(page==='packaging')setPackagingVisited(true);},[page]);
  const [filesVisited, setFilesVisited] = useState(false);
  useEffect(() => { if (page === 'files') setFilesVisited(true); }, [page]);
  const openVersion = (target:ProductVersionTarget) => {
    setVersionTarget(target);setDrawingBomTarget(null);
    if (target.section === 'drawings') setDrawingTarget({...target,revision:Date.now()});
    if (target.section === 'pdf') setDrawingPdfTarget({...target});
    if (target.section === 'qr') setProductQrTarget(null);
    setPage(target.section === 'pdf' ? 'files' : target.section === 'outbound' ? 'exports' : target.section);
  };
  const [productQrTarget, setProductQrTarget] = useState<ProductQrTarget | null>(null);
  const [drawingPdfTarget, setDrawingPdfTarget] = useState<DrawingPdfNavigationTarget | null>(null);
  const [drawingsVisited, setDrawingsVisited] = useState(false);
  useEffect(() => { if (page === 'drawings') setDrawingsVisited(true); }, [page]);
  const [qrVisited, setQrVisited] = useState(false);
  useEffect(() => { if (page === 'qr') setQrVisited(true); }, [page]);
  const [productsVisited, setProductsVisited] = useState(false);
  useEffect(() => { if (page === 'products') setProductsVisited(true); }, [page]);
  const [narrow, setNarrow] = useState(() => window.matchMedia?.('(max-width: 1023px)').matches ?? false);
  const [navigationOpen, setNavigationOpen] = useState(true);
  const navigationToggle = useRef<HTMLButtonElement>(null);
  const navigationPanel = useRef<HTMLElement>(null);
  const navigationWasOpen = useRef(false);
  useEffect(() => {
    const query = window.matchMedia?.('(max-width: 1023px)');
    if (!query) return;
    const change = () => {
      setNarrow(query.matches);
    };
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    if (!navigationOpen) {
      // Restore after React removes inert; the toggle is hidden until the directory has closed.
      if (navigationWasOpen.current) navigationToggle.current?.focus();
      navigationWasOpen.current = false;
      return;
    }
    navigationWasOpen.current = true;
    const panel = navigationPanel.current;
    if (!panel) return;
    const focusable = () => [...panel.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')]
      .filter(element => !element.closest('[hidden], [inert], [aria-hidden="true"]') && getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility !== 'hidden');
    if (narrow) focusable()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === 'Escape' && (narrow || panel.contains(document.activeElement))) {
        event.preventDefault(); setNavigationOpen(false); navigationToggle.current?.focus();
      } else if (narrow && event.key === 'Tab') {
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
  return <div className={`app-shell engineering-workspace ${navigationOpen ? 'navigation-open' : 'navigation-closed'} ${narrow ? 'navigation-overlay' : 'navigation-wide'}`}>

    {narrow && navigationOpen && <button type="button" tabIndex={-1} className="navigation-backdrop" aria-label="关闭导航遮罩" onClick={closeNavigation} />}
    <aside ref={navigationPanel} id="workspace-navigation" className="sidebar" hidden={!navigationOpen} inert={!navigationOpen}
      role={narrow ? 'dialog' : undefined} aria-label="工作导航" aria-modal={narrow && navigationOpen ? true : undefined}>
      <div className="navigation-heading"><strong>图号规划器</strong><button className="navigation-close" type="button" aria-label="关闭导航" title="收起工作导航" onClick={closeNavigation}><ChevronsLeft size={18} strokeWidth={1.8} aria-hidden="true"/></button></div>
    <nav aria-label="主导航">{navigation.map((group) => <section className="nav-group" key={group.label} aria-label={group.label}>
      <p className="nav-group-label">{group.label}</p>{group.items.map((item) => <button className={`nav-item ${page === item.key ? 'active' : ''}`} disabled={!item.enabled || (previewPage !== null && item.key !== previewPage)} onClick={() => item.enabled && (!previewPage || item.key === previewPage) && navigatePage(item.key as Page)} key={item.key} type="button">
        <span className="nav-label"><item.icon size={18} strokeWidth={1.8} aria-hidden="true"/>{item.label}</span></button>)}</section>)}</nav>
    <div className="sidebar-footer">{recoveryPreview ? <RecoveryMockPage docked/> : previewPage ? <small>开发 Mock · 未连接业务服务</small> : <SafeRecovery api={api} />}</div></aside>
    <main className="workspace" inert={narrow && navigationOpen}>    <button ref={navigationToggle} type="button" className="navigation-toggle" aria-controls="workspace-navigation"
      hidden={navigationOpen} aria-expanded={navigationOpen} aria-label="展开导航" title="展开工作导航"
      onClick={() => setNavigationOpen(true)}><Menu size={18} strokeWidth={1.8} aria-hidden="true"/></button>{publicUiPreview && <PublicUiMock/>}{(page === 'drawings' || drawingsVisited) && <div hidden={page !== 'drawings'} className="drawings-page-host"><DrawingLibraryPage onNavigateBom={target=>{if(drawingLeaveGuard.current&&!drawingLeaveGuard.current())return;setVersionTarget(null);setDrawingBomTarget(target);setPage('bom');}} api={api} navigationTarget={drawingTarget} registerLeaveGuard={registerDrawingLeaveGuard} active={page === 'drawings'} onNavigatePdf={target => { if (drawingLeaveGuard.current && !drawingLeaveGuard.current()) return; setDrawingPdfTarget(target); setPage('files'); }} /></div>}{page === 'dictionaries' && <DictionariesPage api={api} />}
      {(page === 'products' || productsVisited) && <div hidden={page !== 'products'} className="products-page-host"><ProductsPage api={api} onOpenVersion={openVersion} active={page === 'products'} onOpenQr={(target) => { setProductQrTarget(target); setPage('qr'); }} /></div>}{page === 'import' && <ImportPage api={api} />}{page === 'planning' && <PlanningPage api={api} onGenerateFiles={target=>{setPackagingTarget(target);setPage('packaging');}} onOpenDrawingLibrary={target => {setDrawingTarget({...target,revision:Date.now()});setPage('drawings');}} />}
      {(page === 'packaging'||packagingVisited)&&<div hidden={page!=='packaging'} className="packaging-page-host"><PackagingTemplatesPage api={api} target={packagingTarget}/></div>}
      {page === 'bom' && <BomPage api={api} target={drawingBomTarget??(versionTarget?.section === 'bom' ? versionTarget : undefined)} />}{page === 'exports' && <OutboundPage api={api} target={versionTarget?.section === 'outbound' ? versionTarget : undefined} registerLeaveGuard={registerOutboundLeaveGuard} />}{(page === 'files' || filesVisited) && <div hidden={page !== 'files'} className="files-page-host"><FilesPage active={page === 'files'} api={api} initialTarget={drawingPdfTarget} /></div>}{(page === 'qr' || qrVisited) && <div hidden={page !== 'qr'} className="qr-page-host"><QrCodesPage active={page === 'qr'} api={api} versionTarget={versionTarget?.section === 'qr' ? versionTarget : null} productTarget={productQrTarget} onReturnProducts={() => { setPage('products'); setProductQrTarget(null); }} /></div>}</main></div>;
}
