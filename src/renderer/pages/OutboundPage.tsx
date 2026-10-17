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

export function OutboundPage({ api, registerLeaveGuard }: { api: PlannerApi; registerLeaveGuard?: RegisterLeaveGuard }) {
  return isOutboundMockEnabled() ? <OutboundMockPage /> : <OutboundWorkspace api={api} registerLeaveGuard={registerLeaveGuard} />;
}

function OutboundWorkspace({ api, registerLeaveGuard: registerOuterGuard }: { api: PlannerApi; registerLeaveGuard?: RegisterLeaveGuard }) {
  const [mailContext, setMailContext] = useState<OutboundMailContext | null>(null);
  const [settings, setSettings] = useState(false);
  const leaveGuard = useRef<LeaveGuard | null>(null);
  const registerLeaveGuard = useCallback((guard: LeaveGuard | null) => { leaveGuard.current = guard; registerOuterGuard?.(guard); }, [registerOuterGuard]);
  const [refreshRevision, setRefreshRevision] = useState(0);
  const [createdPackage,setCreatedPackage] = useState<CreatedOutboundPackageView|null>(null);

  return (
    <section className="page-surface page-enter outbound-page outbound-integrated outbound-mock-page approved-outbound">
      <PageHeader title={settings ? '邮件配置' : '外发资料'} description={settings ? '管理邮件模板、签名和联系人。' : '核对资料、整理分包与邮件草稿。系统不会发送邮件。'}>
        <div className="ob-actions"><button type="button" className="text-button" onClick={() => {
          if (!settings || !leaveGuard.current || leaveGuard.current()) {
            if (settings) setRefreshRevision(value => value + 1);
            setSettings(!settings);
          }
        }}>{settings ? '返回外发工作台' : '邮件配置'}</button></div>
      </PageHeader>
      {settings && <MailConfiguration api={api} registerLeaveGuard={registerLeaveGuard} />}
      <div className="outbound-workflow" hidden={settings}>
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
          {!mailContext && <p className="muted-text">生成外发包后显示邮件草稿；需要时可先展开编辑。</p>}
          <details className="ob-workbench-mail" open={mailContext !== null}>
            <summary>编辑邮件草稿</summary>
            <EmailComposer api={api} mailContext={mailContext} refreshRevision={refreshRevision} />
          </details>
      </section>
      </div>
    </section>
  );
}
