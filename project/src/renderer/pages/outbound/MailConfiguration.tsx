import { useCallback, useRef, useState } from 'react';
import type { PlannerApi } from '../../data/client';
import { ContactsManager } from './ContactsManager';
import { TemplateSettings } from './TemplateSettings';
import type { LeaveGuard, RegisterLeaveGuard } from './useConfigurationEditor';
export function MailConfiguration({ api, registerLeaveGuard }: { api: PlannerApi; registerLeaveGuard: RegisterLeaveGuard }) {
  const [tab, setTab] = useState<'templates' | 'signatures' | 'contacts'>('templates');
  const guard = useRef<LeaveGuard | null>(null);
  const register = useCallback<RegisterLeaveGuard>(next => { guard.current = next; registerLeaveGuard(next); }, [registerLeaveGuard]);
  return <section className="ob-mail-configuration" aria-label="邮件配置">
    <div role="tablist" aria-label="邮件配置分类" className="ob-config-tabs">
      {([['templates', '邮件模板'], ['signatures', '邮件签名'], ['contacts', '联系人']] as const).map(([key, label]) => <button type="button" role="tab" id={`mail-tab-${key}`} aria-controls="mail-config-panel" aria-selected={tab === key} key={key} onClick={() => { if (tab !== key && (!guard.current || guard.current())) setTab(key); }}>{label}</button>)}
    </div>
    <div role="tabpanel" id="mail-config-panel" aria-labelledby={`mail-tab-${tab}`}>
      {tab === 'contacts' ? <ContactsManager api={api} registerLeaveGuard={register} /> : <TemplateSettings key={tab} api={api} mode={tab} registerLeaveGuard={register} />}
    </div>
  </section>;
}
