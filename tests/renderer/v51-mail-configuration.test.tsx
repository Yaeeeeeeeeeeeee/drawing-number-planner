import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { TemplateSettings } from '../../src/renderer/pages/outbound/TemplateSettings';
import type { PlannerApi } from '../../src/renderer/data/client';

it('keeps internal codes and variable choices out of daily editing until insertion is requested', async () => {
  const create = vi.fn().mockResolvedValue({ id: 10 });
  const api = { listOutboundTemplates: vi.fn().mockResolvedValue([]), listOutboundSignatures: vi.fn().mockResolvedValue([]), createOutboundTemplate: create } as unknown as PlannerApi;
  render(<TemplateSettings api={api} mode="templates" />);
  fireEvent.click(screen.getByRole('button', { name: '新增邮件模板' }));
  expect(screen.queryByLabelText('模板编码')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('选择变量')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('模板名称'), { target: { value: '完整资料' } });
  fireEvent.change(screen.getByLabelText('主题模板'), { target: { value: '资料交付' } });
  fireEvent.click(screen.getByRole('button', { name: '插入变量' }));
  const select = screen.getByLabelText('选择变量');
  expect(screen.queryByRole('option', { name: '邮件签名' })).not.toBeInTheDocument();
  for (const variable of ['brand', 'model', 'category', 'date', 'batch', 'package_name', 'count', 'file_list', 'change_files']) {
    expect(select.querySelector(`option[value="${variable}"]`)).not.toBeNull();
  }
  fireEvent.change(select, { target: { value: 'brand' } });
  expect(screen.getByLabelText('正文模板')).toHaveValue('{{brand}}');
  expect(screen.queryByLabelText('选择变量')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '保存模板' }));
  await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({ key: expect.stringMatching(/^mail_/), name: '完整资料', bodyTemplate: '{{brand}}' })));
});
