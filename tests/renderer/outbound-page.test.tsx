import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OutboundPage } from '../../src/renderer/pages/OutboundPage';

const product = { id: 3, sku: 'SKU-F60', model: 'F60', productCategory: '空气炸锅', brandId: 1, brandName: 'SAMKYO', status: 'active' };
const batch = { id: 8, name: '06.20260910', productId: 3, sku: 'SKU-F60', model: 'F60', productCategory: '空气炸锅', recognitionStatus: 'recognized', isPresent: true };
const preview = { previewToken: 'preview-1', packageName: 'D&D - SAMKYO F60空气炸锅 【更新包材资料-2026年9月15日】', items: [
  { slotKey: '0201', fullCode: '02.0101.010.0201004', projectItemId: 1, projectItemName: '铭牌', pdfFileId: 41, fileName: '铭牌（转曲）.pdf', relativePath: '空气炸锅/SKU-F60-F60/06.20260910/铭牌（转曲）.pdf', sourceBatchId: 8, sourceBatchName: '06.20260910', status: 'normal', change: 'replaced', selectable: true, conflictFullCodes: [] },
  { slotKey: '0402', fullCode: '02.0101.010.0402003', projectItemId: 2, projectItemName: '说明书', pdfFileId: null, fileName: null, relativePath: null, sourceBatchId: 7, sourceBatchName: '05.20251216', status: 'missing', change: 'carried_forward', selectable: false, conflictFullCodes: [] },
] };
const contact = { id: 1, company: '供应商甲', contactName: '王经理', email: 'wang@example.com', defaultRecipientType: 'to', status: 'active', notes: null, createdAt: '', updatedAt: '' };
const template = { id: 2, key: 'update_default', name: '更新资料', materialType: 'update', subjectTemplate: '{{package_name}}', bodyTemplate: '{{company_name}}：\n{{contact_salutation}}，您好！\n附件为 {{model}}{{product_category}} 的更新资料。\n{{optional_blocks}}\n{{signature}}', status: 'active', createdAt: '', updatedAt: '', blocks: [{ id: 4, templateId: 2, key: 'meti', name: 'METI 后更新', bodyTemplate: '铭牌待 METI 后更新。', displayOrder: 1, status: 'active', createdAt: '', updatedAt: '' }] };
const signature = { id: 5, name: '默认签名', content: '顺祝商祺\n田嘉滨 Yae', isDefault: true, status: 'active', createdAt: '', updatedAt: '' };

function apiFixture() {
  return {
    listProducts: vi.fn().mockResolvedValue([product]), listDictionaries: vi.fn().mockResolvedValue([{ id: 1, code: '02', name: 'SAMKYO', status: 'active' }]),
    listMaterialBatches: vi.fn().mockResolvedValue([batch]), previewOutboundPackage: vi.fn().mockResolvedValue(preview),
    createOutboundPackage: vi.fn().mockResolvedValue({ id: 9, packageName: preview.packageName, zipRelativePath: `${preview.packageName}.zip`, fileCount: 1, createdAt: '' }),
    listOutboundContacts: vi.fn().mockResolvedValue([contact]), listOutboundTemplates: vi.fn().mockResolvedValue([template]), listOutboundSignatures: vi.fn().mockResolvedValue([signature]),
    renderOutboundTemplate: vi.fn().mockResolvedValue({ subject: preview.packageName, body: '供应商甲：\n王经理，您好！\n铭牌待 METI 后更新。\n顺祝商祺\n田嘉滨 Yae' }),
    createOutboundContact: vi.fn().mockResolvedValue(contact), updateOutboundContact: vi.fn(), activateOutboundContact: vi.fn(), deactivateOutboundContact: vi.fn(), deleteOutboundContact: vi.fn(),
    createOutboundTemplate: vi.fn(), updateOutboundTemplate: vi.fn(), activateOutboundTemplate: vi.fn(), deactivateOutboundTemplate: vi.fn(), deleteOutboundTemplate: vi.fn(), createOutboundTemplateBlock: vi.fn(), updateOutboundTemplateBlock: vi.fn(), activateOutboundTemplateBlock: vi.fn(), deactivateOutboundTemplateBlock: vi.fn(), deleteOutboundTemplateBlock: vi.fn(), createOutboundSignature: vi.fn(), updateOutboundSignature: vi.fn(), activateOutboundSignature: vi.fn(), deactivateOutboundSignature: vi.fn(), deleteOutboundSignature: vi.fn(),
  };
}

afterEach(() => { delete window.plannerDesktop; vi.restoreAllMocks(); });

describe('OutboundPage', () => {
  for (const [label, materialType] of [['首批资料', 'initial'], ['更新资料', 'update']] as const) {
    it(`completes the desktop package flow for ${label}`, async () => {
      const api = apiFixture();
      api.previewOutboundPackage.mockResolvedValue({ ...preview, items: [preview.items[0]] });
      const packageResult = { id: materialType === 'initial' ? 91 : 92,
        packageName: `D&D - SAMKYO F60空气炸锅 【${materialType === 'initial' ? '包材资料' : '更新包材资料'}-2026年9月15日】`,
        zipRelativePath: `${materialType}.zip`, fileCount: 1, createdAt: '' };
      api.createOutboundPackage.mockResolvedValue(packageResult);
      const chooseOutboundDirectory = vi.fn().mockResolvedValue({ ok: true, path: 'D:\\temp-outbound' });
      const showOutboundPackageInFolder = vi.fn().mockResolvedValue({ ok: true });
      window.plannerDesktop = { chooseOutboundDirectory, showOutboundPackageInFolder } as never;
      render(<OutboundPage api={api as never} />);
      fireEvent.click(await screen.findByLabelText(label));
      fireEvent.change(screen.getByLabelText('产品'), { target: { value: '3' } });
      fireEvent.change(await screen.findByLabelText('资料批次'), { target: { value: '8' } });
      fireEvent.click(screen.getByRole('button', { name: '预览文件' }));
      await screen.findByText('铭牌（转曲）.pdf');
      fireEvent.click(screen.getByRole('button', { name: '生成压缩包' }));
      await waitFor(() => expect(api.createOutboundPackage).toHaveBeenCalledWith(expect.objectContaining({
        materialType, previewToken: 'preview-1', selectedPdfFileIds: [41],
      })));
      expect(await screen.findByText(`${packageResult.packageName}.zip`)).toBeVisible();
      expect(screen.getByText(`保存位置：${materialType}.zip`)).toBeVisible();
      expect(screen.getByText('文件数量：1')).toBeVisible();
      fireEvent.click(screen.getByRole('button', { name: '打开位置' }));
      await waitFor(() => expect(showOutboundPackageInFolder).toHaveBeenCalledWith(packageResult.id));
    });
  }

  it('uses the brand dictionary before product and keeps product identity authoritative', async () => {
    const api = apiFixture(); render(<OutboundPage api={api as never} />);
    const brand = await screen.findByLabelText('品牌');
    expect(brand.tagName).toBe('SELECT');
    fireEvent.change(brand, { target: { value: '1' } });
    expect(screen.getByRole('option', { name: 'SKU-F60 · F60 · 空气炸锅' })).toBeVisible();
    expect(api.listDictionaries).toHaveBeenCalledWith('brand', false);
  });

  it('previews both explicit business dimensions and blocks missing materials', async () => {
    const api = apiFixture(); render(<OutboundPage api={api as never} />);
    expect(await screen.findByRole('heading', { name: '外发资料' })).toBeVisible();
    expect(screen.getByRole('tab', { name: '资料打包' })).toBeVisible();
    expect(screen.getByLabelText('本次变更资料')).toBeChecked();
    fireEvent.click(screen.getByLabelText('当前完整包材资料'));
    fireEvent.click(screen.getByLabelText('更新资料'));
    fireEvent.change(screen.getByLabelText('产品'), { target: { value: '3' } });
    fireEvent.change(await screen.findByLabelText('资料批次'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: '预览文件' }));
    await waitFor(() => expect(api.previewOutboundPackage).toHaveBeenCalledWith({ productId: 3, selectedMaterialBatchId: 8, materialType: 'update', packageMode: 'current_complete' }));
    expect(await screen.findByText('铭牌（转曲）.pdf')).toBeVisible();
    expect(screen.getByText('缺失')).toBeVisible();
    expect(screen.getByRole('button', { name: '全选可用文件' })).toBeVisible();
    expect(screen.getByRole('button', { name: '生成压缩包' })).toBeDisabled();
    expect(screen.getByText('存在缺失、冲突或待确认资料，处理后才能打包。')).toBeVisible();
  });

  it('explains desktop-only packaging without calling the API in browser preview', async () => {
    const api = apiFixture(); const safePreview = { ...preview, items: [preview.items[0]] }; api.previewOutboundPackage.mockResolvedValue(safePreview);
    render(<OutboundPage api={api as never} />);
    fireEvent.change(await screen.findByLabelText('产品'), { target: { value: '3' } });
    fireEvent.change(await screen.findByLabelText('资料批次'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: '预览文件' }));
    await screen.findByText('铭牌（转曲）.pdf');
    fireEvent.click(screen.getByRole('button', { name: '生成压缩包' }));
    expect(await screen.findByText('生成 ZIP 仅支持 Windows 桌面版，请在桌面版选择输出目录。')).toBeVisible();
    expect(api.createOutboundPackage).not.toHaveBeenCalled();
  });

  it('generates editable email text from contacts, blocks and signature and copies labelled fields', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined); Object.assign(navigator, { clipboard: { writeText } });
    const api = apiFixture(); render(<OutboundPage api={api as never} />);
    fireEvent.click(await screen.findByRole('tab', { name: '邮件撰写' }));
    fireEvent.click(await screen.findByLabelText('收件人 王经理'));
    fireEvent.click(screen.getByLabelText('附加段落 METI 后更新'));
    fireEvent.click(screen.getByRole('button', { name: '生成邮件内容' }));
    await waitFor(() => expect(api.renderOutboundTemplate).toHaveBeenCalledWith(2, expect.objectContaining({ company_name: '供应商甲', contact_salutation: '王经理', optional_blocks: '铭牌待 METI 后更新。', signature: signature.content })));
    expect(await screen.findByDisplayValue(preview.packageName)).toBeVisible();
    fireEvent.change(screen.getByLabelText('正文'), { target: { value: '人工修改后的正文' } });
    fireEvent.click(screen.getByRole('button', { name: '全部复制' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('收件人：wang@example.com')));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('正文：\n人工修改后的正文'));
    expect(screen.queryByRole('button', { name: /发送/ })).not.toBeInTheDocument();
  });

  it('passes editable update description and selected preview files into the update template', async () => {
    const api = apiFixture(); api.previewOutboundPackage.mockResolvedValue({ ...preview, items: [preview.items[0]] });
    window.plannerDesktop = { chooseOutboundDirectory: vi.fn().mockResolvedValue({ ok: true, path: 'D:\\temp' }), showOutboundPackageInFolder: vi.fn() } as never;
    render(<OutboundPage api={api as never} />);
    fireEvent.click(await screen.findByLabelText('更新资料'));
    fireEvent.change(screen.getByLabelText('产品'), { target: { value: '3' } });
    fireEvent.change(await screen.findByLabelText('资料批次'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: '预览文件' }));
    await screen.findByText('铭牌（转曲）.pdf');
    fireEvent.click(screen.getByRole('tab', { name: '邮件撰写' }));
    fireEvent.change(await screen.findByLabelText('本次变更内容'), { target: { value: '铭牌文字修正' } });
    fireEvent.click(screen.getByRole('button', { name: '生成邮件内容' }));
    await waitFor(() => expect(api.renderOutboundTemplate).toHaveBeenCalledWith(2, expect.objectContaining({
      change_description: '铭牌文字修正', file_list: '铭牌：铭牌（转曲）.pdf（来源：06.20260910）', model: 'F60', product_category: '空气炸锅',
    })));
  });

  it('keeps email input and shows a local error when rendering fails', async () => {
    const api = apiFixture(); api.renderOutboundTemplate.mockRejectedValue(new Error('模板变量缺失'));
    render(<OutboundPage api={api as never} />);
    fireEvent.click(await screen.findByRole('tab', { name: '邮件撰写' }));
    fireEvent.change(await screen.findByLabelText('本次变更内容'), { target: { value: '保留此内容' } });
    fireEvent.click(screen.getByRole('button', { name: '生成邮件内容' }));
    expect(await screen.findByText('模板变量缺失')).toBeVisible();
    expect(screen.getByLabelText('本次变更内容')).toHaveValue('保留此内容');
  });

  it('does not require a change description for an initial-material email', async () => {
    const api = apiFixture();
    api.listOutboundTemplates.mockResolvedValue([
      { ...template, id: 3, key: 'initial_default', name: '首批资料', materialType: 'initial', blocks: [] },
      template,
    ]);
    render(<OutboundPage api={api as never} />);
    fireEvent.click(await screen.findByRole('tab', { name: '邮件撰写' }));
    fireEvent.change(await screen.findByLabelText('邮件资料类型'), { target: { value: 'initial' } });
    expect(screen.queryByLabelText('本次变更内容')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '生成邮件内容' }));
    await waitFor(() => expect(api.renderOutboundTemplate).toHaveBeenCalledWith(3, expect.objectContaining({ change_description: '' })));
  });

  it('creates and toggles contacts nearby', async () => {
    const api = apiFixture(); render(<OutboundPage api={api as never} />);
    fireEvent.click(await screen.findByRole('tab', { name: '联系人' }));
    fireEvent.click(screen.getByRole('button', { name: '新增联系人' }));
    const form = screen.getByRole('form', { name: '联系人编辑' });
    fireEvent.change(within(form).getByLabelText('公司'), { target: { value: '供应商乙' } });
    fireEvent.change(within(form).getByLabelText('称呼'), { target: { value: '李经理' } });
    fireEvent.change(within(form).getByLabelText('邮箱'), { target: { value: 'li@example.com' } });
    fireEvent.click(within(form).getByRole('button', { name: '保存联系人' }));
    await waitFor(() => expect(api.createOutboundContact).toHaveBeenCalledWith(expect.objectContaining({ company: '供应商乙', contactName: '李经理', email: 'li@example.com' })));
    fireEvent.click(screen.getByRole('button', { name: '停用 王经理' }));
    await waitFor(() => expect(api.deactivateOutboundContact).toHaveBeenCalledWith(1));
  });

  it('shows a nearby contact status error without discarding the open edit form', async () => {
    const api = apiFixture(); api.deactivateOutboundContact.mockRejectedValue(new Error('联系人已被引用'));
    render(<OutboundPage api={api as never} />);
    fireEvent.click(await screen.findByRole('tab', { name: '联系人' }));
    fireEvent.click(await screen.findByRole('button', { name: '编辑' }));
    fireEvent.change(screen.getByLabelText('备注'), { target: { value: '未保存备注' } });
    fireEvent.click(screen.getByRole('button', { name: '停用 王经理' }));
    expect(await screen.findByText('联系人已被引用')).toBeVisible();
    expect(screen.getByLabelText('备注')).toHaveValue('未保存备注');
  });

  it('keeps template blocks and signatures maintainable from the email settings area', async () => {
    const api = apiFixture(); render(<OutboundPage api={api as never} />);
    fireEvent.click(await screen.findByRole('tab', { name: '邮件撰写' }));
    fireEvent.click(screen.getByRole('button', { name: '模板与签名设置' }));
    expect(await screen.findByRole('button', { name: '编辑模板 更新资料' })).toBeVisible();
    fireEvent.click(screen.getByText('附加段落'));
    expect(screen.getByRole('button', { name: '新增附加段落到 更新资料' })).toBeVisible();
    expect(screen.getByRole('button', { name: '新增邮件模板' })).toBeVisible();
    expect(screen.getByRole('button', { name: '新增邮件签名' })).toBeVisible();
    expect(screen.getByRole('button', { name: '编辑附加段落 METI 后更新' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '停用附加段落 METI 后更新' }));
    await waitFor(() => expect(api.deactivateOutboundTemplateBlock).toHaveBeenCalledWith(4));
    fireEvent.click(screen.getByRole('button', { name: '编辑签名 默认签名' }));
    fireEvent.change(screen.getByLabelText('签名内容'), { target: { value: '新版签名' } });
    fireEvent.click(screen.getByRole('button', { name: '保存签名' }));
    await waitFor(() => expect(api.updateOutboundSignature).toHaveBeenCalledWith(5, expect.objectContaining({ content: '新版签名', isDefault: true })));
  });

  it('keeps template editing open with its input when save fails', async () => {
    const api = apiFixture(); api.updateOutboundTemplate.mockRejectedValue(new Error('模板编码冲突'));
    render(<OutboundPage api={api as never} />);
    fireEvent.click(await screen.findByRole('tab', { name: '邮件撰写' }));
    fireEvent.click(screen.getByRole('button', { name: '模板与签名设置' }));
    fireEvent.click(await screen.findByRole('button', { name: '编辑模板 更新资料' }));
    fireEvent.change(screen.getByLabelText('模板名称'), { target: { value: '未保存模板名' } });
    fireEvent.click(screen.getByRole('button', { name: '保存模板' }));
    expect(await screen.findByText('模板编码冲突')).toBeVisible();
    expect(screen.getByLabelText('模板名称')).toHaveValue('未保存模板名');
  });

  it('creates templates and signatures and edits existing optional blocks', async () => {
    const api = apiFixture();
    render(<OutboundPage api={api as never} />);
    fireEvent.click(await screen.findByRole('tab', { name: '邮件撰写' }));
    fireEvent.click(screen.getByRole('button', { name: '模板与签名设置' }));

    fireEvent.click(await screen.findByRole('button', { name: '新增邮件模板' }));
    fireEvent.change(screen.getByLabelText('模板编码'), { target: { value: 'initial_extra' } });
    fireEvent.change(screen.getByLabelText('模板名称'), { target: { value: '首批补充模板' } });
    fireEvent.change(screen.getByLabelText('主题模板'), { target: { value: '{{package_name}}' } });
    fireEvent.change(screen.getByLabelText('正文模板'), { target: { value: '{{file_list}}' } });
    fireEvent.click(screen.getByRole('button', { name: '保存模板' }));
    await waitFor(() => expect(api.createOutboundTemplate).toHaveBeenCalledWith(expect.objectContaining({ key: 'initial_extra', name: '首批补充模板' })));

    fireEvent.click(screen.getByRole('button', { name: '新增邮件签名' }));
    fireEvent.change(screen.getByLabelText('签名名称'), { target: { value: '供应商签名' } });
    fireEvent.change(screen.getByLabelText('签名内容'), { target: { value: '顺祝商祺' } });
    fireEvent.click(screen.getByRole('button', { name: '保存签名' }));
    await waitFor(() => expect(api.createOutboundSignature).toHaveBeenCalledWith(expect.objectContaining({ name: '供应商签名', content: '顺祝商祺' })));

    fireEvent.click(screen.getByText('附加段落'));
    fireEvent.click(screen.getByRole('button', { name: '编辑附加段落 METI 后更新' }));
    fireEvent.change(screen.getByLabelText('段落内容'), { target: { value: 'METI 确认后另行更新。' } });
    fireEvent.click(screen.getByRole('button', { name: '保存附加段落' }));
    await waitFor(() => expect(api.updateOutboundTemplateBlock).toHaveBeenCalledWith(4, expect.objectContaining({ bodyTemplate: 'METI 确认后另行更新。' })));
  });

  it('keeps a new signature form open when its write fails', async () => {
    const api = apiFixture();
    api.createOutboundSignature.mockRejectedValue(new Error('签名名称已存在'));
    render(<OutboundPage api={api as never} />);
    fireEvent.click(await screen.findByRole('tab', { name: '邮件撰写' }));
    fireEvent.click(screen.getByRole('button', { name: '模板与签名设置' }));
    fireEvent.click(await screen.findByRole('button', { name: '新增邮件签名' }));
    fireEvent.change(screen.getByLabelText('签名名称'), { target: { value: '保留的新签名' } });
    fireEvent.change(screen.getByLabelText('签名内容'), { target: { value: '未保存内容' } });
    fireEvent.click(screen.getByRole('button', { name: '保存签名' }));
    expect(await screen.findByText('签名名称已存在')).toBeVisible();
    expect(screen.getByLabelText('签名名称')).toHaveValue('保留的新签名');
    expect(screen.getByLabelText('签名内容')).toHaveValue('未保存内容');
  });
});
