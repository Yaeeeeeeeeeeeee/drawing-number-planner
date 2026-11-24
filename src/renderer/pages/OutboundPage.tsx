import './outbound/outbound-v2.css';
import { PageHeader } from '../components/PageHeader';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlannerApi } from '../data/client';
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
  const draftGuard = useRef<LeaveGuard | null>(null);
  const activeSettings = useRef(settings);activeSettings.current=settings;
  const registerLeaveGuard = useCallback((guard: LeaveGuard | null) => { leaveGuard.current = guard; }, []);
  const registerDraftGuard = useCallback((guard: LeaveGuard | null) => { draftGuard.current = guard; }, []);
  useEffect(()=>{registerOuterGuard?.(()=> (activeSettings.current?leaveGuard.current:draftGuard.current)?.() ?? true);return()=>registerOuterGuard?.(null);},[registerOuterGuard]);
  const [refreshRevision, setRefreshRevision] = useState(0);

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
          renderMailAction={result => <button type="button" className="primary-button"
            disabled={!completedContext || completedContext.packageId !== result.id}
            onClick={() => { if (completedContext) setMailContext({ ...completedContext }); }}>生成邮件草稿</button>}
          onPackage={(_value, context) => setCompletedContext(context)}
        />
        <section className="ob-step ob-mail-step" aria-label="邮件编辑步骤">
          <details className="ob-workbench-mail" open={mailContext !== null}>
            <summary onClick={event => { if ((event.currentTarget.parentElement as HTMLDetailsElement).open && draftGuard.current && !draftGuard.current()) event.preventDefault(); }}>
              <h2><span aria-hidden="true">04</span> 邮件草稿</h2><span>编辑邮件草稿</span>
            </summary>
            <EmailComposer api={api} mailContext={mailContext} refreshRevision={refreshRevision} registerLeaveGuard={registerDraftGuard} />
          </details>
      </section>
      </div>
    </section>
  );
}
