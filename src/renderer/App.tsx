const navigation = [
  ['图号库', true],
  ['编码字典', true],
  ['产品档案', true],
  ['迁移检查', true],
  ['图号规划', false],
  ['BOM 管理', false],
  ['PDF 文件中心', false],
  ['外发资料', false],
] as const;

export function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark" aria-label="图号规划器">
          <span className="brand-icon">图</span>
          <span>图号规划器</span>
        </div>
        <nav aria-label="主导航">
          {navigation.map(([label, enabled], index) => (
            <button
              className={index === 0 ? 'nav-item active' : 'nav-item'}
              disabled={!enabled}
              key={label}
              type="button"
            >
              <span>{label}</span>
              {!enabled && <small>后续阶段</small>}
            </button>
          ))}
        </nav>
        <div className="phase-badge">Phase 1 · 基础资料</div>
      </aside>
      <main className="workspace">
        <header className="workspace-header">
          <div>
            <p className="eyebrow">DRAWING NUMBER CONTROL</p>
            <h1>图号库</h1>
            <p>检索正式图号，并查看关联的产品与基础编码信息。</p>
          </div>
          <span className="status-chip">本机数据</span>
        </header>
        <section className="toolbar" aria-label="图号检索">
          <input aria-label="搜索" placeholder="搜索图号、型号、品牌或项目" />
          <button type="button">搜索</button>
        </section>
        <section className="empty-state">
          <div className="empty-symbol">⌕</div>
          <h2>图号库尚无记录</h2>
          <p>Phase 2 完成正式占号后，记录会显示在这里。</p>
        </section>
      </main>
    </div>
  );
}
