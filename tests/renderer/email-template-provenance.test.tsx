import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { TemplateSettings } from '../../src/renderer/pages/outbound/TemplateSettings';
import type { PlannerApi } from '../../src/renderer/data/client';

it('shows saved original source cases read-only and collapsed inside the existing template editor', async () => {
  const source = { candidateId: '更新包材资料!B11', sheet: '更新包材资料', source: 'B2 / B11 / 历史案例', manufacturer: '原供应商', materialType: 'update', scenario: '更新案例', sourceCoordinates: { supplier: 'B2', body: 'B11', to: ['B7'], cc: ['B9'], subject: ['B10'] }, rawReference: '历史原因、旧型号与PO123仅供参考', contentHash: 'a'.repeat(64), importedAt: '2026-10-28T00:00:00.000Z' };
  const template = { id: 8, key: 'saved', name: '已导入模板', manufacturer: '原供应商', scenario: '更新案例', materialType: 'update', subjectTemplate: '资料', bodyTemplate: '{{change_files}}', status: 'active', blocks: [], importSources: [source] };
  const update = vi.fn().mockResolvedValue(template);
  const api = { listOutboundTemplates: vi.fn().mockResolvedValue([template]), listOutboundSignatures: vi.fn().mockResolvedValue([]), updateOutboundTemplate: update } as unknown as PlannerApi;
  render(<TemplateSettings api={api} mode="templates" />);
  fireEvent.click(await screen.findByRole('button', { name: '编辑模板 已导入模板' }));
  const editor = screen.getByRole('form', { name: '邮件模板编辑' });
  const details = within(editor).getByText('导入来源与历史案例（1）').closest('details')!;
  expect(details).not.toHaveAttribute('open');
  fireEvent.click(within(details).getByText('导入来源与历史案例（1）'));
  expect(within(details).getByText(source.rawReference)).toBeInTheDocument();
  expect(details.textContent).toContain('更新包材资料'); expect(details.textContent).toContain('原供应商'); expect(details.textContent).toContain('B11'); expect(details.textContent).toContain(source.contentHash);
  expect(within(details).queryByRole('textbox')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('正文模板'), { target: { value: '人工正文' } });
  fireEvent.click(screen.getByRole('button', { name: '保存模板' }));
  await waitFor(() => expect(update).toHaveBeenCalledWith(8, expect.objectContaining({ bodyTemplate: '人工正文' })));
  expect(update.mock.calls[0][1]).not.toHaveProperty('importSources');
});
