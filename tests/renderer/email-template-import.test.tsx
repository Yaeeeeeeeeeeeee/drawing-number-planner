import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ImportPage } from '../../src/renderer/pages/ImportPage';

it('keeps submit errors beside the sticky confirm button and preserves the reviewed form for retry', async () => {
  const { EmailTemplateImport } = await import('../../src/renderer/pages/EmailTemplateImport');
  const candidate={id:'H14',sheet:'首批包材资料',source:'H2 / H14 / 完整交付',manufacturer:'实际甲厂',materialType:'initial',scenario:'完整交付',name:'甲厂完整交付',subjectTemplate:'资料',bodyTemplate:'请查收',contacts:[],rawReference:'原案例',warnings:[],match:'new'};
  const api={previewEmailTemplateImport:vi.fn().mockResolvedValue({previewId:'p',report:{sheets:[],candidates:[candidate]}}),confirmEmailTemplateImport:vi.fn().mockRejectedValueOnce(new Error('未知变量：unverified')).mockResolvedValueOnce({created:1,updated:0,skipped:0,contactsCreated:0})};
  render(<EmailTemplateImport api={api as never} onClose={()=>undefined}/>);
  fireEvent.change(screen.getByLabelText('邮件模板 Excel'),{target:{files:[new File(['xlsx'],'mail.xlsx')]}});fireEvent.click(screen.getByRole('button',{name:'识别并预览'}));
  fireEvent.click(await screen.findByLabelText('选择模板 1'));
  fireEvent.click(screen.getByLabelText('已确认联系人关联 1'));fireEvent.click(screen.getByLabelText('已核对固定话术、动态信息及历史示例 1'));
  fireEvent.click(screen.getByRole('button',{name:'确认导入所选模板'}));
  const alert=await screen.findByRole('alert');
  const footer=screen.getByRole('button',{name:'确认导入所选模板'}).closest('footer')!;
  expect(footer).toContainElement(alert);
  expect(screen.getByLabelText('正文 1')).toHaveValue('请查收');
  expect(screen.getByLabelText('已确认联系人关联 1')).toBeChecked();
  fireEvent.click(screen.getByRole('button',{name:'确认导入所选模板'}));
  expect(await within(footer).findByText(/^新增 1 条/)).toHaveAttribute('role','status');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

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
  expect(api.confirmEmailTemplateImport).toHaveBeenCalledWith('p1', [expect.objectContaining({ subjectTemplate: '{{model}}资料', bodyTemplate: '请查收。', historyReviewed: true })], undefined);
});

it('shows a separate source signature and requires explicit choice and review without changing defaults', async () => {
  const { EmailTemplateImport } = await import('../../src/renderer/pages/EmailTemplateImport');
  const api={previewEmailTemplateImport:vi.fn().mockResolvedValue({previewId:'p-signature',report:{sheets:[],candidates:[],signatures:[{id:'sig',content:'Example signature',contentHash:'hash',sources:['首批包材资料!B11'],matches:[]}]}}),confirmEmailTemplateImport:vi.fn().mockResolvedValue({created:0,updated:0,skipped:0,contactsCreated:0,signaturesCreated:1})};
  render(<EmailTemplateImport api={api as never} onClose={()=>undefined}/>);
  fireEvent.change(screen.getByLabelText('邮件模板 Excel'),{target:{files:[new File(['xlsx'],'mail.xlsx')]}});fireEvent.click(screen.getByRole('button',{name:'识别并预览'}));
  expect(await screen.findByText('来源签名（独立保存，不设为默认）')).toBeVisible();
  expect(screen.getByLabelText('签名处理 1')).toHaveValue('skip');
  fireEvent.change(screen.getByLabelText('签名处理 1'),{target:{value:'create'}});
  expect(screen.getByRole('button',{name:'确认导入所选模板'})).toBeDisabled();
  fireEvent.change(screen.getByLabelText('签名名称 1'),{target:{value:'Reviewed'}});fireEvent.click(screen.getByLabelText('已确认签名 1'));
  fireEvent.click(screen.getByRole('button',{name:'确认导入所选模板'}));
  expect(await screen.findByText(/新增签名 1 条/)).toBeVisible();
  expect(api.confirmEmailTemplateImport).toHaveBeenCalledWith('p-signature',[],[expect.objectContaining({id:'sig',action:'create',confirmed:true,name:'Reviewed'})]);
});
