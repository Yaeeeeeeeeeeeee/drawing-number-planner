import { PageHeader } from '../components/PageHeader';
import { useState } from 'react';
import type { CreatedOutboundPackageView, PlannerApi } from '../data/client';
import { PackageResult } from './outbound/PackageResult';
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
  const [contactsOpen, setContactsOpen] = useState(false);
  const [mailContext, setMailContext] = useState<OutboundMailContext | null>(null);
  const [settings, setSettings] = useState(false);
  const [createdPackage,setCreatedPackage] = useState<CreatedOutboundPackageView|null>(null);

  return (
    <section className="page-surface page-enter outbound-page outbound-integrated outbound-mock-page approved-outbound">
      <PageHeader title="外发资料" description="核对资料、整理分包与邮件草稿。系统不会发送邮件。">
        <div className="ob-actions"><button type="button" className="text-button" onClick={()=>setContactsOpen(!contactsOpen)}>{contactsOpen?'返回外发工作':'联系人维护'}</button><button type="button" className="text-button" onClick={()=>setSettings(!settings)}>{settings?'返回外发工作':'模板与签名'}</button></div>
      </PageHeader>
      {settings && <TemplateSettings api={api} />}
      <div className="outbound-workflow" hidden={contactsOpen || settings}>
      <section className="ob-step" aria-label="资料打包步骤">
        <h2><span aria-hidden="true">01</span> 选择外发范围</h2>
        <PackageBuilder
          api={api}
          showResult={false}
          onResultChange={setCreatedPackage}
          onPackage={(_value, context) => setMailContext(context)}
        />
      </section>
      <section className="ob-step" aria-label="外发生成结果">
          <h2><span aria-hidden="true">02</span> 生成外发结果</h2>{createdPackage ? <PackageResult key={createdPackage.id} value={createdPackage}/> : <p className="muted-text">完成预览并打包后，在此核对真实生成结果。</p>}
      </section>
      <section className="ob-step" aria-label="邮件编辑步骤"><h2><span aria-hidden="true">03</span> 邮件草稿</h2>
          <div>
            <EmailComposer api={api} mailContext={mailContext} />
          </div>
      </section>
      </div>
      {contactsOpen && <ContactsManager api={api} />}
    </section>
  );
}
