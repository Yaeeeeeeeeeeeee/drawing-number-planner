import './outbound/outbound-v2.css';
import { PageHeader } from '../components/PageHeader';
import { useCallback, useRef, useState } from 'react';
import type { CreatedOutboundPackageView, PlannerApi } from '../data/client';
import { PackageResult } from './outbound/PackageResult';
import { MailConfiguration } from './outbound/MailConfiguration';
import type { LeaveGuard, RegisterLeaveGuard } from './outbound/useConfigurationEditor';
import './outbound/outbound-configuration.css';
import { EmailComposer } from './outbound/EmailComposer';
import { PackageBuilder, type OutboundMailContext } from './outbound/PackageBuilder';
import { isOutboundMockEnabled } from './outbound/outbound-mock';
import { OutboundMockPage } from './outbound/OutboundMockPage';

export function OutboundPage({ api, registerLeaveGuard, target }: { api: PlannerApi; registerLeaveGuard?: RegisterLeaveGuard; target?:{productId:number;appearanceVersionId?:number} }) {
  return isOutboundMockEnabled() ? <OutboundMockPage /> : <OutboundWorkspace api={api} registerLeaveGuard={registerLeaveGuard} target={target} />;
}

function OutboundWorkspace({ api, registerLeaveGuard: registerOuterGuard, target }: { api: PlannerApi; registerLeaveGuard?: RegisterLeaveGuard; target?:{productId:number;appearanceVersionId?:number} }) {
  const [mailContext, setMailContext] = useState<OutboundMailContext | null>(null);
  const [completedContext, setCompletedContext] = useState<OutboundMailContext | null>(null);
  const [settings, setSettings] = useState(false);
  const leaveGuard = useRef<LeaveGuard | null>(null);
  const registerLeaveGuard = useCallback((guard: LeaveGuard | null) => { leaveGuard.current = guard; registerOuterGuard?.(guard); }, [registerOuterGuard]);
  const [refreshRevision, setRefreshRevision] = useState(0);
  const [createdPackage,setCreatedPackage] = useState<CreatedOutboundPackageView|null>(null);

  return (
    <section className="page-surface page-enter outbound-page outbound-integrated outbound-mock-page approved-outbound">
      <PageHeader title={settings ? '邮件配置' : '外发资料'} description={settings ? '管理邮件模板、签名和联系人。' : '核对资料、整理分包与邮件草稿。'}>
        <div className="ob-actions"><button type="button" className="text-button" onClick={() => {
          if (!settings || !leaveGuard.current || leaveGuard.current()) {
            if (settings) setRefreshRevision(value => value + 1);
            setSettings(!settings);
          }
        }}>{settings ? '返回外发工作台' : '邮件配置'}</button></div>
      </PageHeader>
      {settings && <MailConfiguration api={api} registerLeaveGuard={registerLeaveGuard} />}
      <div className="outbound-workflow" hidden={settings}>

        <PackageBuilder
          api={api}
          target={target}
          showResult={false}
          onResultChange={setCreatedPackage}
          onPackage={(_value, context) => setCompletedContext(context)}
        />
      <section className="ob-step" aria-label="外发生成结果">
          <h2><span aria-hidden="true">03</span> 生成外发结果</h2>{createdPackage ? <><PackageResult key={createdPackage.id} value={createdPackage}/><button type="button" className="primary-button" disabled={!completedContext || completedContext.packageId !== createdPackage.id} onClick={() => { if (completedContext) setMailContext({ ...completedContext }); }}>生成邮件草稿</button></> : <p className="muted-text">完成预览并打包后，在此核对真实生成结果。</p>}
      </section>
      <section className="ob-step" aria-label="邮件编辑步骤"><h2><span aria-hidden="true">04</span> 邮件草稿</h2>
          {!mailContext && <p className="muted-text">ZIP 成功生成后，点击“生成邮件草稿”带入本次外发资料。</p>}
          <details className="ob-workbench-mail" open={mailContext !== null}>
            <summary>编辑邮件草稿</summary>
            <EmailComposer api={api} mailContext={mailContext} refreshRevision={refreshRevision} />
          </details>
      </section>
      </div>
    </section>
  );
}
