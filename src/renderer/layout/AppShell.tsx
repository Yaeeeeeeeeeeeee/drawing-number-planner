import { useState } from 'react';

import type { PlannerApi } from '../data/client';
import { DictionariesPage } from '../pages/DictionariesPage';
import { DrawingLibraryPage } from '../pages/DrawingLibraryPage';
import { ImportPage } from '../pages/ImportPage';
import { ProductsPage } from '../pages/ProductsPage';

type Page = 'drawings' | 'dictionaries' | 'products' | 'import';
const navigation = [
  { key: 'drawings', label: '图号库', icon: '图', enabled: true }, { key: 'dictionaries', label: '编码字典', icon: '码', enabled: true },
  { key: 'products', label: '产品档案', icon: '品', enabled: true }, { key: 'import', label: '迁移检查', icon: '迁', enabled: true },
  { key: 'planning', label: '图号规划', icon: '规', enabled: false, phase: 'Phase 2' }, { key: 'bom', label: 'BOM 管理', icon: 'B', enabled: false, phase: 'Phase 3' },
  { key: 'files', label: 'PDF 文件中心', icon: 'P', enabled: false, phase: 'Phase 4' }, { key: 'exports', label: '外发资料', icon: '外', enabled: false, phase: 'Phase 6' },
] as const;

export function AppShell({ api }: { api: PlannerApi }) {
  const [page, setPage] = useState<Page>('drawings');
  return <div className="app-shell"><aside className="sidebar"><div className="brand-mark"><span className="brand-icon">D</span><div><strong>图号规划器</strong><small>DRAWING CONTROL</small></div></div>
    <nav aria-label="主导航">{navigation.map((item) => <button className={`nav-item ${page === item.key ? 'active' : ''}`} disabled={!item.enabled} onClick={() => item.enabled && setPage(item.key as Page)} key={item.key} type="button">
      <span className="nav-label"><i>{item.icon}</i>{item.label}</span>{!item.enabled && <small>{item.phase}</small>}</button>)}</nav>
    <div className="sidebar-footer"><span className="connection-dot" />本机资料库<div>Phase 1 · 基础资料</div></div></aside>
    <main className="workspace">{page === 'drawings' && <DrawingLibraryPage api={api} />}{page === 'dictionaries' && <DictionariesPage api={api} />}
      {page === 'products' && <ProductsPage api={api} />}{page === 'import' && <ImportPage api={api} />}</main></div>;
}
