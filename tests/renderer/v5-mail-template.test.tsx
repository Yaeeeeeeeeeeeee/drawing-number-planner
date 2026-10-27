import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { TemplateSettings } from '../../src/renderer/pages/outbound/TemplateSettings';
import type { PlannerApi } from '../../src/renderer/data/client';
it('inserts selectable variables and saves independently with optional manufacturer and scenario', async () => {
 const create = vi.fn().mockResolvedValue({ id: 1 });
 const api = { listOutboundTemplates: vi.fn().mockResolvedValue([]), listOutboundSignatures: vi.fn().mockResolvedValue([]), createOutboundTemplate: create } as unknown as PlannerApi;
 render(<TemplateSettings api={api} mode="templates" />);
 fireEvent.click(screen.getByText('新增邮件模板'));
 for (const [label, value] of [['模板名称','首批'],['适用厂家','厂家A'],['邮件场景','首批资料'],['主题模板','主题']]) fireEvent.change(screen.getByLabelText(label), { target: { value } });
 fireEvent.click(screen.getByRole('button', { name: '插入变量' }));
 fireEvent.change(screen.getByLabelText('选择变量'), { target: { value: 'brand' } });
 expect(screen.getByLabelText('正文模板')).toHaveValue('{{brand}}');
 fireEvent.click(screen.getByText('保存模板'));
 await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({ key:expect.stringMatching(/^mail_/), manufacturer:'厂家A', scenario:'首批资料', bodyTemplate:'{{brand}}' })));
});
