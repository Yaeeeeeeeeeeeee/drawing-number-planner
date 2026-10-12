import { useState } from 'react';

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
  return <div className="app-shell"><aside className="sidebar"><div className="brand-mark"><span className="brand-icon">D</span><div><strong>图号规划器</strong><small>DRAWING CONTROL</small></div></div>
    <nav aria-label="主导航">{navigation.map((group) => <section className="nav-group" key={group.label} aria-label={group.label}>
      <p className="nav-group-label">{group.label}</p>{group.items.map((item) => <button className={`nav-item ${page === item.key ? 'active' : ''}`} disabled={!item.enabled || (previewPage !== null && item.key !== previewPage)} onClick={() => item.enabled && (!previewPage || item.key === previewPage) && setPage(item.key as Page)} key={item.key} type="button">
        <span className="nav-label"><i>{item.icon}</i>{item.label}</span></button>)}</section>)}</nav>
    <div className="sidebar-footer">{recoveryPreview ? <RecoveryMockPage docked/> : previewPage ? <small>开发 Mock · 未连接业务服务</small> : <SafeRecovery api={api} />}</div></aside>
    <main className="workspace">{publicUiPreview && <PublicUiMock/>}{page === 'drawings' && <DrawingLibraryPage api={api} />}{page === 'dictionaries' && <DictionariesPage api={api} />}
      {page === 'products' && <ProductsPage api={api} onOpenQr={(id) => { setSelectedQrCodeId(id); setPage('qr'); }} />}{page === 'import' && <ImportPage api={api} />}{page === 'planning' && <PlanningPage api={api} />}
      {page === 'bom' && <BomPage api={api} />}{page === 'exports' && <OutboundPage api={api} />}{page === 'files' && <FilesPage api={api} />}{page === 'qr' && <QrCodesPage api={api} initialQrCodeId={selectedQrCodeId} onOpened={() => setSelectedQrCodeId(null)} />}</main></div>;
}
