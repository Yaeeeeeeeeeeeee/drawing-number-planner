import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ImportPage } from '../../src/renderer/pages/ImportPage';

it('opens import from migration checks, edits preview and requires selected/contact/history confirmations before persistence', async () => {
  const candidate = { id: 'row1', sheet: '首批包材资料', source: '第1行', manufacturer: '实际甲厂', materialType: 'initial',
    scenario: '缺铭牌', name: '实际甲厂 · 缺铭牌', subjectTemplate: '旧型号资料', bodyTemplate: '历史说明',
    contacts: [], rawReference: '旧型号资料\n历史说明', requiresReview: true, warnings: ['待确认：历史示例'], match: 'new' };
  const api = { previewEmailTemplateImport: vi.fn().mockResolvedValue({ previewId: 'p1', report: {
    sheets: [{ name: '首批包材资料', supported: true, candidates: 1 }, { name: 'ITR', supported: false, candidates: 0 }], candidates: [candidate] } }),
    confirmEmailTemplateImport: vi.fn().mockResolvedValue({ created: 1, updated: 0, skipped: 0, contactsCreated: 0 }) };
  const view=render(<main style={{transform:"translateX(0)"}}><ImportPage api={api as never}/></main>);
  fireEvent.click(screen.getByRole('button', { name: '导入邮件模板' }));
  expect(view.container).not.toContainElement(screen.getByRole('dialog',{name:'导入邮件模板'}));
  fireEvent.change(screen.getByLabelText('邮件模板 Excel'), { target: { files: [new File(['xlsx'], '沟通模板.xlsx')] } });
  fireEvent.click(screen.getByRole('button', { name: '识别并预览' }));
  expect(await screen.findByText(/ITR：未支持/)).toBeVisible();
  expect(api.confirmEmailTemplateImport).not.toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText('选择模板 1'));
  expect(screen.getByRole('button', { name: '确认导入所选模板' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('主题 1'), { target: { value: '{{model}}资料' } });
  fireEvent.change(screen.getByLabelText('正文 1'), { target: { value: '请查收。' } });
  fireEvent.click(screen.getByLabelText('已确认联系人关联 1'));
  fireEvent.click(screen.getByLabelText('已核对固定话术、动态信息及历史示例 1'));
  fireEvent.click(screen.getByRole('button', { name: '确认导入所选模板' }));
  expect(await screen.findByText('新增 1 条，更新 0 条，跳过 0 条；新增联系人 0 条')).toBeVisible();
  expect(api.confirmEmailTemplateImport).toHaveBeenCalledWith('p1', [expect.objectContaining({ subjectTemplate: '{{model}}资料', bodyTemplate: '请查收。', historyReviewed: true })]);
});
