import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { TemplateSettings } from '../../src/renderer/pages/outbound/TemplateSettings';
import type { PlannerApi } from '../../src/renderer/data/client';
it('inserts selectable variables and saves independently with optional manufacturer and scenario', async () => {
 const create = vi.fn().mockResolvedValue({ id: 1 });
 const api = { listOutboundTemplates: vi.fn().mockResolvedValue([]), listOutboundSignatures: vi.fn().mockResolvedValue([]), createOutboundTemplate: create } as unknown as PlannerApi;
 render(<TemplateSettings api={api} mode="templates" />);
 fireEvent.click(screen.getByText('新增邮件模板'));
 for (const [label, value] of [['模板编码','厂家A-首批'],['模板名称','首批'],['适用厂家','厂家A'],['邮件场景','首批资料'],['主题模板','主题']]) fireEvent.change(screen.getByLabelText(label), { target: { value } });
 fireEvent.click(screen.getByText('品牌 · 添加'));
 expect(screen.getByLabelText('正文模板')).toHaveValue('{{brand}}');
 fireEvent.click(screen.getByText('保存模板'));
 await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({ key:'厂家A-首批', manufacturer:'厂家A', scenario:'首批资料', bodyTemplate:'{{brand}}' })));
});
