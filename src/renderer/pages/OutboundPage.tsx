import { useState } from 'react';
import type { CreatedOutboundPackageView, PlannerApi, ProductView } from '../data/client';
import { ContactsManager } from './outbound/ContactsManager';
import { EmailComposer } from './outbound/EmailComposer';
import { PackageBuilder } from './outbound/PackageBuilder';
import { TemplateSettings } from './outbound/TemplateSettings';

type Tab = 'package' | 'email' | 'contacts';
export function OutboundPage({ api }: { api: PlannerApi }) {
  const [tab, setTab] = useState<Tab>('package'); const [latestPackage, setLatestPackage] = useState<CreatedOutboundPackageView | null>(null); const [packageProduct, setPackageProduct] = useState<ProductView | null>(null); const [settings, setSettings] = useState(false);
  return <section className="page-surface page-enter outbound-page"><header className="page-header"><div><p className="eyebrow">OUTBOUND WORKSPACE</p><h1>外发资料</h1><p>从当前有效资料生成压缩包，并整理可复制的邮件内容；系统不会发送邮件。</p></div></header>
    <nav className="section-tabs" aria-label="外发资料功能">{([['package', '资料打包'], ['email', '邮件撰写'], ['contacts', '联系人']] as const).map(([key, label]) => <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} type="button" onClick={() => setTab(key)}>{label}</button>)}</nav>
    {tab === 'package' && <PackageBuilder api={api} onPackage={(value, product) => { setLatestPackage(value); setPackageProduct(product); }} />}
    {tab === 'email' && <><div className="outbound-settings-toggle"><button className="text-button" type="button" onClick={() => setSettings((v) => !v)}>{settings ? '收起模板设置' : '模板与签名设置'}</button></div>{settings ? <TemplateSettings api={api} /> : <EmailComposer api={api} latestPackage={latestPackage} product={packageProduct} />}</>}
    {tab === 'contacts' && <ContactsManager api={api} />}
  </section>;
}
