import { useRef, useState } from 'react';
import type { PlannerApi } from '../data/client';
import { ContactsManager } from './outbound/ContactsManager';
import { EmailComposer } from './outbound/EmailComposer';
import { PackageBuilder, type OutboundMailContext } from './outbound/PackageBuilder';
import { TemplateSettings } from './outbound/TemplateSettings';
import { isOutboundMockEnabled } from './outbound/outbound-mock';
import { OutboundMockPage } from './outbound/OutboundMockPage';

export function OutboundPage({ api }: { api: PlannerApi }) {
  return isOutboundMockEnabled() ? <OutboundMockPage /> : <OutboundWorkspace api={api} />;
}

function OutboundWorkspace({ api }: { api: PlannerApi }) {
  const [work,setWork]=useState<'package'|'email'>('package');
  const [contactsOpen, setContactsOpen] = useState(false);
  const packageSection = useRef<HTMLElement>(null);
  const emailSection = useRef<HTMLElement>(null);
  const [mailContext, setMailContext] = useState<OutboundMailContext | null>(null);
  const [settings, setSettings] = useState(false);

  return (
    <section className="page-surface page-enter outbound-page outbound-integrated">
      <header className="page-header">
        <div>
          <p className="eyebrow">OUTBOUND WORKSPACE</p>
          <h1>外发资料</h1>
          <p>从当前有效资料生成压缩包，并整理可复制的邮件内容；系统不会发送邮件。</p>
        </div>
      </header>
      <nav className="section-tabs" aria-label="外发工作步骤">
        {contactsOpen ? <button type="button" onClick={() => setContactsOpen(false)}>返回外发工作</button> : <>
          <button type="button" aria-pressed={work==='package'} onClick={() => setWork('package')}>资料打包</button>
          <button type="button" aria-pressed={work==='email'} onClick={() => setWork('email')}>邮件撰写</button>
        </>}
        <button type="button" onClick={() => setContactsOpen(true)}>联系人</button>
      </nav>
      <div hidden={contactsOpen}>
      <section hidden={work !== 'package'} ref={packageSection} aria-label="资料打包步骤">
        <h2>1. 选择资料并打包</h2>
        <PackageBuilder
          api={api}
          onPackage={(_value, context) => setMailContext(context)}
        />
      </section>
      <section hidden={work !== 'email'} ref={emailSection} aria-label="邮件编辑步骤">
          <h2>2. 编辑邮件并复制</h2>
          <div className="outbound-settings-toggle">
            <button className="text-button" type="button" onClick={() => setSettings((value) => !value)}>
              {settings ? '收起模板设置' : '模板与签名设置'}
            </button>
          </div>
          {settings && <TemplateSettings api={api} />}
          <div hidden={settings}>
            <EmailComposer api={api} mailContext={mailContext} />
          </div>
      </section>
      </div>
      {contactsOpen && <ContactsManager api={api} />}
    </section>
  );
}
