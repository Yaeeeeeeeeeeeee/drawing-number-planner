import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OutboundPage } from '../../src/renderer/pages/OutboundPage';
import { EmailComposer } from '../../src/renderer/pages/outbound/EmailComposer';

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
    listOutboundPackages: vi.fn().mockResolvedValue([]),
    createOutboundPackage: vi.fn().mockResolvedValue({ id: 9, packageName: preview.packageName, zipRelativePath: `${preview.packageName}.zip`, fileCount: 1, createdAt: '' }),
    listOutboundContacts: vi.fn().mockResolvedValue([contact]), listOutboundTemplates: vi.fn().mockResolvedValue([template]), listOutboundSignatures: vi.fn().mockResolvedValue([signature]),
    renderOutboundTemplate: vi.fn().mockImplementation(async (_id, fields) => ({ subject: fields.package_name, body: '供应商甲：\n王经理，您好！\n铭牌待 METI 后更新。\n顺祝商祺\n田嘉滨 Yae' })),
    createOutboundContact: vi.fn().mockResolvedValue(contact), updateOutboundContact: vi.fn(), activateOutboundContact: vi.fn(), deactivateOutboundContact: vi.fn(), deleteOutboundContact: vi.fn(),
    createOutboundTemplate: vi.fn(), updateOutboundTemplate: vi.fn(), activateOutboundTemplate: vi.fn(), deactivateOutboundTemplate: vi.fn(), deleteOutboundTemplate: vi.fn(), createOutboundTemplateBlock: vi.fn(), updateOutboundTemplateBlock: vi.fn(), activateOutboundTemplateBlock: vi.fn(), deactivateOutboundTemplateBlock: vi.fn(), deleteOutboundTemplateBlock: vi.fn(), createOutboundSignature: vi.fn(), updateOutboundSignature: vi.fn(), activateOutboundSignature: vi.fn(), deactivateOutboundSignature: vi.fn(), deleteOutboundSignature: vi.fn(),
  };
}

afterEach(() => { delete window.plannerDesktop; vi.restoreAllMocks(); });

describe('OutboundPage', () => {
  it('opens completed history without requiring a still-active product', async () => {
    const api = apiFixture(); api.listProducts.mockResolvedValue([]);
    api.listOutboundPackages.mockResolvedValue([{ id: 90, packageName: '已退出型号历史包', zipRelativePath: 'old.zip',
      fileCount: 1, createdAt: '2026-09-20', parts: [{ partNumber: 1, zipRelativePath: 'old.zip', sizeBytes: 100 }] }] as never);
    render(<OutboundPage api={api as never} />);
    fireEvent.click(await screen.findByRole('button', { name: '查询全部外发历史（含退出产品）' }));
    expect(await screen.findByText('已退出型号历史包')).toBeVisible();
    expect(api.listOutboundPackages).toHaveBeenCalledWith(undefined);
  });
  it.each(['missing', 'matched'])('warns about %s BOM change details before packaging', async (status) => {
    const api = apiFixture();
    api.previewOutboundPackage.mockResolvedValue({ ...preview, items: [{ ...preview.items[0],
      bomContext: { status, changeDetails: null, candidates: [] } }] } as never);
    render(<OutboundPage api={api as never} />);
    fireEvent.change(await screen.findByLabelText('产品'), { target: { value: '3' } });
    fireEvent.change(await screen.findByLabelText('资料批次'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: '预览文件' }));
    expect(await screen.findByText(status === 'missing' ? /未找到对应 BOM/ : /BOM 未填写修改明细/)).toBeVisible();
  });
  it('marks missing change details visibly in the generated draft and offers manual supplementation', async () => {
    const api = apiFixture();
    api.renderOutboundTemplate.mockImplementation(async (_id, fields) => ({ subject: fields.package_name, body: fields.change_files }));
    render(<EmailComposer api={api as never} mailContext={{ packageName: '测试包', product: product as never,
      materialType: 'update', items: [{ projectItemName: '铭牌', fileName: '铭牌.pdf', sourceBatchName: batch.name, pdfFileId: 41 }] }} />);
    expect(await screen.findByText(/修改明细待补充：铭牌/)).toBeVisible();
    await waitFor(() => expect((screen.getByLabelText('正文') as HTMLTextAreaElement).value).toContain('【待补充修改明细】'));
    fireEvent.change(screen.getByLabelText('本次变更内容'), { target: { value: '铭牌：调整功率' } });
    fireEvent.click(screen.getByRole('button', { name: '生成邮件内容' }));
    await waitFor(() => expect((screen.getByLabelText('正文') as HTMLTextAreaElement).value).toContain('调整功率'));
  });
  it('replaces an untouched automatic draft with the next completed package', async () => {
    const api = apiFixture();
    api.renderOutboundTemplate.mockImplementation(async (_id, fields) => ({ subject: fields.package_name, body: fields.package_name }));
    const first = { packageName: '第一包', product: product as never, materialType: 'update' as const, items: [] };
    const { rerender } = render(<EmailComposer api={api as never} mailContext={first} />);
    await waitFor(() => expect(screen.getByLabelText('正文')).toHaveValue('第一包'));
    rerender(<EmailComposer api={api as never} mailContext={{ ...first, packageName: '第二包' }} />);
    await waitFor(() => expect(screen.getByLabelText('正文')).toHaveValue('第二包'));
    expect(screen.queryByRole('button', { name: '使用新压缩包资料' })).not.toBeInTheDocument();
  });

  it('automatically prepares the completed package email after templates load without requiring a generate click', async () => {
    const api = apiFixture();
    api.renderOutboundTemplate.mockImplementation(async (_id, fields) => ({
      subject: fields.package_name, body: `本次修改：\n${fields.change_description}\n${fields.file_list}`,
    }));
    const context = { packageName: '新完成包', product: product as never, materialType: 'update' as const,
      items: [{ projectItemName: '铭牌', fileName: '铭牌（转曲）.pdf', sourceBatchName: batch.name,
        pdfFileId: 41, changeDetails: '调整功率' }] };
    render(<EmailComposer api={api as never} mailContext={context} />);
    await waitFor(() => expect(screen.getByLabelText('正文')).toHaveValue('本次修改：\n1. 铭牌：调整功率\n  铭牌（转曲）'));
    expect(screen.getByLabelText('主题')).toHaveValue('新完成包');
    fireEvent.change(screen.getByLabelText('正文'), { target: { value: '人工补充' } });
    fireEvent.click(screen.getByLabelText('收件人 王经理'));
    expect(screen.getByLabelText('正文')).toHaveValue('人工补充');
  });

  it('shows persisted package parts after selecting a product and opens the historical part', async () => {
    const api = apiFixture();
    api.listOutboundPackages.mockResolvedValue([{ id: 90, packageName: '历史包', zipRelativePath: '历史包-1.zip',
      fileCount: 3, createdAt: '2026-09-20T12:00:00Z', parts: [
        { partNumber: 1, zipRelativePath: '历史包-1.zip', sizeBytes: null },
        { partNumber: 2, zipRelativePath: '历史包-2.zip', sizeBytes: 123 },
      ] }] as never);
    const showOutboundPackageInFolder = vi.fn().mockResolvedValue({ ok: true });
    window.plannerDesktop = { showOutboundPackageInFolder } as never;
    render(<OutboundPage api={api as never} />);
    fireEvent.change(await screen.findByLabelText('产品'), { target: { value: '3' } });
    fireEvent.click(screen.getByText('已生成的压缩包'));
    expect(await screen.findByText('历史包-2.zip')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '打开历史包第2份位置' }));
    await waitFor(() => expect(showOutboundPackageInFolder).toHaveBeenCalledWith(90, 2));
    expect(screen.queryByText('NaN MB')).not.toBeInTheDocument();
  });
  it('keeps the latest generation when responses finish out of order', async () => {
    const api = apiFixture();
    const pending: Array<(value: { subject: string; body: string }) => void> = [];
    api.renderOutboundTemplate.mockImplementation(() => new Promise((resolve) => { pending.push(resolve); }));
    render(<EmailComposer api={api as never} mailContext={null} />);
    const button = screen.getByRole('button', { name: '生成邮件内容' });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    fireEvent.click(button);
    await act(async () => { pending[1]({ subject: '最新主题', body: '最新正文' }); });
    await act(async () => { pending[0]({ subject: '过期主题', body: '过期正文' }); });
    expect(screen.getByLabelText('主题')).toHaveValue('最新主题');
    expect(screen.getByLabelText('正文')).toHaveValue('最新正文');
  });

  it('preserves text edited while email generation is pending', async () => {
    const api = apiFixture();
    let finish!: (value: { subject: string; body: string }) => void;
    api.renderOutboundTemplate.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    render(<EmailComposer api={api as never} mailContext={null} />);
    await waitFor(() => expect(screen.getByRole('button', { name: '生成邮件内容' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '生成邮件内容' }));
    fireEvent.change(screen.getByLabelText('正文'), { target: { value: '请求期间补充的重要说明' } });
    fireEvent.change(screen.getByLabelText('主题'), { target: { value: '最新人工主题' } });
    await act(async () => { finish({ subject: '旧生成主题', body: '旧生成正文' }); });
    expect(screen.getByLabelText('正文')).toHaveValue('请求期间补充的重要说明');
    expect(screen.getByLabelText('主题')).toHaveValue('最新人工主题');
  });
  it('includes all multipart attachment names in generated mail without output paths', async () => {
    const api = apiFixture();
    render(<EmailComposer api={api as never} mailContext={{ packageName: '包材资料', product: product as never,
      materialType: 'update', items: [], packageFiles: ['私有目录/包材资料-1.zip', '私有目录/包材资料-2.zip'] } as never} />);
    await waitFor(() => expect(screen.getByRole('button', { name: '生成邮件内容' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '生成邮件内容' }));
    await waitFor(() => expect(api.renderOutboundTemplate).toHaveBeenCalled());
    const fields = api.renderOutboundTemplate.mock.calls[0][1];
    expect(fields.file_list).toContain('包材资料-1.zip');
    expect(fields.file_list).toContain('包材资料-2.zip');
    expect(fields.file_list).not.toContain('私有目录');
  });
  it('shows every generated ZIP and opens the selected part instead of inventing a single ZIP name', async () => {
    const api = apiFixture();
    api.previewOutboundPackage.mockResolvedValue({ ...preview, items: [preview.items[0]] });
    api.createOutboundPackage.mockResolvedValue({ id: 9, packageName: '资料', zipRelativePath: '资料-1.zip', fileCount: 1, createdAt: '',
      parts: [{ partNumber: 1, zipRelativePath: '资料-1.zip', sizeBytes: 100 }, { partNumber: 2, zipRelativePath: '资料-2.zip', sizeBytes: 200 }] } as never);
    const showOutboundPackageInFolder = vi.fn().mockResolvedValue({ ok: true });
    window.plannerDesktop = { chooseOutboundDirectory: vi.fn().mockResolvedValue({ ok: true }), showOutboundPackageInFolder } as never;
    render(<OutboundPage api={api as never} />);
    fireEvent.change(await screen.findByLabelText('产品'), { target: { value: '3' } });
    fireEvent.change(await screen.findByLabelText('资料批次'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: '预览文件' }));
    await screen.findByText('铭牌（转曲）.pdf');
    fireEvent.click(screen.getByRole('button', { name: '生成压缩包' }));
    expect(await screen.findByText('资料-2.zip')).toBeVisible();
    expect(screen.queryByText('资料.zip')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '打开第2份位置' }));
    await waitFor(() => expect(showOutboundPackageInFolder).toHaveBeenCalledWith(9, 2));
  });
  it('keeps packaging and email on one page and preserves a draft while managing contacts', async () => {
    const api = apiFixture();
    render(<OutboundPage api={api as never} />);
    expect(await screen.findByRole('button', { name: '预览文件' })).toBeVisible();
    expect(screen.getByRole('heading', { name: '邮件草稿' })).toBeVisible();
    expect(screen.getByLabelText('正文')).not.toBeVisible();
    fireEvent.click(screen.getByText('编辑邮件草稿', {selector:'summary'}));
    expect(screen.getByLabelText('正文')).toBeVisible();
    fireEvent.change(screen.getByLabelText('正文'), { target: { value: '保留草稿' } });
    fireEvent.click(screen.getByRole('button', { name: '邮件配置' }));
    fireEvent.click(screen.getByRole('tab', { name: '联系人' }));
    fireEvent.click(screen.getByRole('button', { name: '返回外发工作台' }));
    expect(screen.getByLabelText('正文')).toHaveValue('保留草稿');
    expect(screen.getByRole('heading', { name: '选择外发范围' })).toBeVisible();
    expect(screen.getByRole('button', { name: '预览文件' })).toBeVisible();
  });
  it('loads a completed package into the mounted composer without mixing it with an existing draft', async () => {
    const api = apiFixture();
    const first = { packageName: '首个包', product: product as never, materialType: 'update' as const,
      items: [{ projectItemName: '铭牌', fileName: '铭牌.pdf', sourceBatchName: batch.name, pdfFileId: 41, changeDetails: '调整功率' }] };
    const { rerender } = render(<EmailComposer api={api as never} mailContext={null} />);
    await screen.findByRole('option', { name: '更新资料' });
    rerender(<EmailComposer api={api as never} mailContext={first} />);
    expect(await screen.findByDisplayValue('1. 铭牌：调整功率')).toBeVisible();
    fireEvent.change(screen.getByLabelText('主题'), { target: { value: '手写主题' } });
    fireEvent.change(screen.getByLabelText('正文'), { target: { value: '请保留手写正文' } });
    const second = { ...first, packageName: '第二个包', items: [{ ...first.items[0], changeDetails: '新修改' }] };
    rerender(<EmailComposer api={api as never} mailContext={second} />);
    expect(screen.getByLabelText('主题')).toHaveValue('手写主题');
    expect(screen.getByLabelText('正文')).toHaveValue('请保留手写正文');
    expect(screen.getByLabelText('本次变更内容')).toHaveValue('1. 铭牌：调整功率');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: '使用新压缩包资料' }));
    expect(screen.getByLabelText('主题')).toHaveValue('第二个包');
    expect(screen.getByLabelText('正文')).toHaveValue('');
    expect(screen.getByLabelText('本次变更内容')).toHaveValue('1. 铭牌：新修改');
  });
  it('does not overwrite manually edited email text when regeneration is cancelled', async () => {
    const api = apiFixture();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<EmailComposer api={api as never} mailContext={null} />);
    await waitFor(() => expect(screen.getByRole('button', { name: '生成邮件内容' })).toBeEnabled());
    fireEvent.change(screen.getByLabelText('正文'), { target: { value: '请保留我的人工说明' } });
    fireEvent.change(screen.getByLabelText('主题'), { target: { value: '人工主题' } });
    fireEvent.click(screen.getByRole('button', { name: '生成邮件内容' }));
    await waitFor(() => expect(window.confirm).toHaveBeenCalled());
    expect(screen.getByLabelText('正文')).toHaveValue('请保留我的人工说明');
    expect(screen.getByLabelText('主题')).toHaveValue('人工主题');
    expect(api.renderOutboundTemplate).not.toHaveBeenCalled();
  });
  it('requires an explicit BOM conflict choice and a fresh preview before packaging', async () => {
    const api = apiFixture();
    api.previewOutboundPackage.mockResolvedValueOnce({ ...preview, items: [{ ...preview.items[0], selectable: false,
      bomContext: { status: 'ambiguous', changeDetails: null, candidates: [
        { bomVersionId: 10, bomItemId: 11, businessDate: '2026-09-01', revision: 1, changeDetails: '旧修改' },
        { bomVersionId: 20, bomItemId: 21, businessDate: '2026-09-10', revision: 1, changeDetails: '更正功率' },
      ] } }] } as never).mockResolvedValue({ ...preview, previewToken: 'resolved', items: [{ ...preview.items[0],
        bomContext: { status: 'matched', changeDetails: '更正功率', candidates: [] } }] } as never);
    render(<OutboundPage api={api as never} />);
    fireEvent.change(await screen.findByLabelText('产品'), { target: { value: '3' } });
    fireEvent.change(await screen.findByLabelText('资料批次'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: '预览文件' }));
    const choice = await screen.findByLabelText('铭牌 BOM 修改记录');
    expect(screen.getByRole('button', { name: '生成压缩包' })).toBeDisabled();
    fireEvent.change(choice, { target: { value: '20' } });
    expect(screen.getByRole('button', { name: '生成压缩包' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '预览文件' }));
    await waitFor(() => expect(api.previewOutboundPackage).toHaveBeenLastCalledWith(expect.objectContaining({ bomSelections: { '1': 20 } })));
    await waitFor(() => expect(screen.getByRole('button', { name: '生成压缩包' })).toBeEnabled());
  });
  it('generates supplier-facing fields from BOM changes without internal paths, batch names or PDF extensions', async () => {
    const api = apiFixture();
    render(<EmailComposer api={api as never} mailContext={{ packageName: preview.packageName, product: product as never,
      materialType: 'update', items: [{ projectItemName: '铭牌', fileName: '铭牌（转曲）.pdf', sourceBatchName: '06.20260910',
        pdfFileId: 41, changeDetails: '更正额定功率' }] }} />);
    fireEvent.click(await screen.findByRole('button', { name: '生成邮件内容' }));
    await waitFor(() => expect(api.renderOutboundTemplate).toHaveBeenCalled());
    const fields = api.renderOutboundTemplate.mock.calls[0][1];
    expect(fields.change_description).toContain('更正额定功率');
    expect(fields.change_files).toBe('1.铭牌：更正额定功率\n　　新文件：铭牌（转曲）');
    expect(fields.brand_name).toBe('SAMKYO');
    expect(fields.file_list).toContain('铭牌（转曲）');
    expect(fields.file_list).not.toMatch(/\.pdf|来源|06\.20260910/i);
  });
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
      fireEvent.change(await screen.findByLabelText('打包资料类型'), {target:{value:materialType}});
      fireEvent.change(screen.getByLabelText('产品'), { target: { value: '3' } });
      fireEvent.change(await screen.findByLabelText('资料批次'), { target: { value: '8' } });
      fireEvent.click(screen.getByRole('button', { name: '预览文件' }));
      await screen.findByText('铭牌（转曲）.pdf');
      fireEvent.click(screen.getByRole('button', { name: '生成压缩包' }));
      await waitFor(() => expect(api.createOutboundPackage).toHaveBeenCalledWith(expect.objectContaining({
        materialType, previewToken: 'preview-1', selectedPdfFileIds: [41],
      })));
      expect(await screen.findByRole('table',{name:'ZIP 分包结果'})).toBeVisible();
      expect(screen.getByText(`${materialType}.zip`)).toBeVisible();
      expect(screen.getByText('1 个文件 · 1 个分包')).toBeVisible();
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
    expect(screen.getByRole('heading', { name: '选择外发范围' })).toBeVisible();
    expect(screen.getByLabelText('本次变更资料')).toBeChecked();
    fireEvent.click(screen.getByLabelText('当前完整包材资料'));
    fireEvent.change(screen.getByLabelText('打包资料类型'), {target:{value:'update'}});
    fireEvent.change(screen.getByLabelText('产品'), { target: { value: '3' } });
    fireEvent.change(await screen.findByLabelText('资料批次'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: '预览文件' }));
    await waitFor(() => expect(api.previewOutboundPackage).toHaveBeenCalledWith({ productId: 3, selectedMaterialBatchId: 8, materialType: 'update', packageMode: 'current_complete' }));
    expect(await screen.findByText('铭牌（转曲）.pdf')).toBeVisible();
    expect(screen.getAllByText('缺失').length).toBeGreaterThan(0);
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
    expect(await screen.findByRole('heading', { name: '邮件草稿' })).toBeVisible();
    fireEvent.click(screen.getByText('编辑邮件草稿', {selector:'summary'}));
    fireEvent.click(await screen.findByLabelText('收件人 王经理'));
    fireEvent.click(screen.getByLabelText('附加段落 METI 后更新'));
    fireEvent.click(screen.getByRole('button', { name: '生成邮件内容' }));
    await waitFor(() => expect(api.renderOutboundTemplate).toHaveBeenCalledWith(2, expect.objectContaining({ company_name: '供应商甲', contact_salutation: '王经理', optional_blocks: '铭牌待 METI 后更新。', signature: signature.content })));
    await waitFor(() => expect((screen.getByLabelText('正文') as HTMLTextAreaElement).value).toContain('王经理，您好！'));
    expect(screen.getByLabelText('主题')).toHaveValue(''); // No package has been created in this flow.
    fireEvent.change(screen.getByLabelText('正文'), { target: { value: '人工修改后的正文' } });
    for (const label of ['复制收件人', '复制抄送', '复制主题', '复制正文']) {
      const button = screen.getByRole('button', { name: label });
      expect(button).toHaveAttribute('title', label);
      expect(button.querySelector('svg')).not.toBeNull();
      expect(button).not.toHaveTextContent(label);
    }
    fireEvent.click(screen.getByRole('button', { name: '复制正文' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('人工修改后的正文'));
    fireEvent.click(screen.getByRole('button', { name: '全部复制' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('收件人：wang@example.com')));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('正文：\n人工修改后的正文'));
    expect(screen.queryByRole('button', { name: /发送/ })).not.toBeInTheDocument();
  });

  it('passes editable update description and selected preview files into the update template', async () => {
    const api = apiFixture(); api.previewOutboundPackage.mockResolvedValue({ ...preview, items: [preview.items[0]] });
    window.plannerDesktop = { chooseOutboundDirectory: vi.fn().mockResolvedValue({ ok: true, path: 'D:\\temp' }), showOutboundPackageInFolder: vi.fn() } as never;
    render(<OutboundPage api={api as never} />);
    fireEvent.change(await screen.findByLabelText('打包资料类型'),{target:{value:'update'}});
    fireEvent.change(screen.getByLabelText('产品'), { target: { value: '3' } });
    fireEvent.change(await screen.findByLabelText('资料批次'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: '预览文件' }));
    await screen.findByText('铭牌（转曲）.pdf');
    fireEvent.click(screen.getByRole('button', { name: '生成压缩包' }));
    await screen.findByText('压缩包已生成');
    expect(screen.getByRole('table',{name:'ZIP 分包结果'})).toBeVisible();
    expect(screen.getByRole('heading', { name: '邮件草稿' })).toBeVisible();
    fireEvent.change(await screen.findByLabelText('本次变更内容'), { target: { value: '铭牌文字修正' } });
    fireEvent.click(screen.getByRole('button', { name: '生成邮件内容' }));
    await waitFor(() => expect(api.renderOutboundTemplate).toHaveBeenCalledWith(2, expect.objectContaining({
      change_description: '铭牌文字修正', file_list: '  铭牌（转曲）', model: 'F60', product_category: '空气炸锅',
    })));
  });

  it('keeps the email package name, product and files atomic after previewing a different package', async () => {
    const api = apiFixture();
    const previewA = { ...preview, packageName: 'A包', items: [{ ...preview.items[0], fileName: 'A铭牌.pdf', sourceBatchName: 'A批次' }] };
    const previewB = { ...preview, packageName: 'B包', items: [{ ...preview.items[0], pdfFileId: 42, fileName: 'B说明书.pdf', projectItemName: '说明书', sourceBatchName: 'B批次' }] };
    api.previewOutboundPackage.mockResolvedValueOnce(previewA).mockResolvedValueOnce(previewB);
    api.createOutboundPackage.mockResolvedValue({ id: 93, packageName: 'A包', zipRelativePath: 'A包.zip', fileCount: 1, createdAt: '' });
    window.plannerDesktop = { chooseOutboundDirectory: vi.fn().mockResolvedValue({ ok: true, path: 'D:\\temp' }), showOutboundPackageInFolder: vi.fn() } as never;
    render(<OutboundPage api={api as never} />);
    fireEvent.change(await screen.findByLabelText('打包资料类型'),{target:{value:'update'}});
    fireEvent.change(screen.getByLabelText('产品'), { target: { value: '3' } });
    fireEvent.change(await screen.findByLabelText('资料批次'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: '预览文件' }));
    await screen.findByText('A铭牌.pdf');
    fireEvent.click(screen.getByRole('button', { name: '生成压缩包' }));
    await screen.findByText('压缩包已生成');

    fireEvent.click(screen.getByLabelText('当前完整包材资料'));
    fireEvent.click(screen.getByRole('button', { name: '预览文件' }));
    await screen.findByText('B说明书.pdf');
    expect(screen.getByRole('heading', { name: '邮件草稿' })).toBeVisible();
    expect(await screen.findByLabelText('主题')).toHaveValue('A包');
    fireEvent.click(await screen.findByRole('button', { name: '生成邮件内容' }));
    await waitFor(() => expect(api.renderOutboundTemplate).toHaveBeenCalledWith(2, expect.objectContaining({
      package_name: 'A包', model: 'F60', product_category: '空气炸锅',
      file_list: '  A铭牌',
    })));
  });

  it('keeps email input and shows a local error when rendering fails', async () => {
    const api = apiFixture(); api.renderOutboundTemplate.mockRejectedValue(new Error('模板变量缺失'));
    render(<OutboundPage api={api as never} />);
    expect(await screen.findByRole('heading', { name: '邮件草稿' })).toBeVisible();
    fireEvent.click(screen.getByText('编辑邮件草稿', {selector:'summary'}));
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
    expect(await screen.findByRole('heading', { name: '邮件草稿' })).toBeVisible();
    fireEvent.click(screen.getByText('编辑邮件草稿', {selector:'summary'}));
    fireEvent.change(await screen.findByLabelText('邮件资料类型'), { target: { value: 'initial' } });
    expect(screen.queryByLabelText('本次变更内容')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '生成邮件内容' }));
    await waitFor(() => expect(api.renderOutboundTemplate).toHaveBeenCalledWith(3, expect.objectContaining({ change_description: '' })));
  });

  it('creates and toggles contacts nearby', async () => {
    const api = apiFixture(); render(<OutboundPage api={api as never} />);
    fireEvent.click(await screen.findByRole('button', { name: '邮件配置' }));
    fireEvent.click(screen.getByRole('tab', { name: '联系人' }));
    fireEvent.click(screen.getByRole('button', { name: '新增联系人' }));
    const form = screen.getByRole('form', { name: '联系人编辑' });
    fireEvent.change(within(form).getByLabelText('公司'), { target: { value: '供应商乙' } });
    fireEvent.change(within(form).getByLabelText('称呼'), { target: { value: '李经理' } });
    fireEvent.change(within(form).getByLabelText('邮箱'), { target: { value: 'li@example.com' } });
    fireEvent.click(within(form).getByRole('button', { name: '保存联系人' }));
    await waitFor(() => expect(api.createOutboundContact).toHaveBeenCalledWith(expect.objectContaining({ company: '供应商乙', contactName: '李经理', email: 'li@example.com' })));
    await waitFor(() => expect(screen.getByRole('button', { name: '停用 王经理' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '停用 王经理' }));
    await waitFor(() => expect(api.deactivateOutboundContact).toHaveBeenCalledWith(1));
  });

  it('shows a nearby contact status error without discarding the open edit form', async () => {
    const api = apiFixture(); api.deactivateOutboundContact.mockRejectedValue(new Error('联系人已被引用'));
    render(<OutboundPage api={api as never} />);
    fireEvent.click(await screen.findByRole('button', { name: '邮件配置' }));
    fireEvent.click(screen.getByRole('tab', { name: '联系人' }));
    fireEvent.click(await screen.findByRole('button', { name: '编辑' }));
    fireEvent.change(screen.getByLabelText('备注'), { target: { value: '未保存备注' } });
    await waitFor(() => expect(screen.getByRole('button', { name: '停用 王经理' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '停用 王经理' }));
    expect(await screen.findByText('联系人已被引用')).toBeVisible();
    expect(screen.getByLabelText('备注')).toHaveValue('未保存备注');
  });

  it('keeps template blocks and signatures maintainable from the email settings area', async () => {
    const api = apiFixture(); render(<OutboundPage api={api as never} />);
    expect(await screen.findByRole('heading', { name: '邮件草稿' })).toBeVisible();
    fireEvent.click(screen.getByText('编辑邮件草稿', {selector:'summary'}));
    fireEvent.click(screen.getByRole('button', { name: '邮件配置' }));
    expect(await screen.findByRole('button', { name: '编辑模板 更新资料' })).toBeVisible();
    fireEvent.click(screen.getByText('附加段落'));
    expect(screen.getByRole('button', { name: '新增附加段落到 更新资料' })).toBeVisible();
    expect(screen.getByRole('button', { name: '新增邮件模板' })).toBeVisible();
    expect(screen.queryByRole('button', { name: '新增邮件签名' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '编辑附加段落 METI 后更新' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '停用附加段落 METI 后更新' }));
    await waitFor(() => expect(api.deactivateOutboundTemplateBlock).toHaveBeenCalledWith(4));
    await waitFor(() => expect(screen.getByRole('tab', { name: '邮件签名' })).toBeEnabled());
    fireEvent.click(screen.getByRole('tab', { name: '邮件签名' }));
    fireEvent.click(await screen.findByRole('button', { name: '编辑签名 默认签名' }));
    fireEvent.change(screen.getByLabelText('签名内容'), { target: { value: '新版签名' } });
    fireEvent.click(screen.getByRole('button', { name: '保存签名' }));
    await waitFor(() => expect(api.updateOutboundSignature).toHaveBeenCalledWith(5, expect.objectContaining({ content: '新版签名', isDefault: true })));
  });

  it('keeps template editing open with its input when save fails', async () => {
    const api = apiFixture(); api.updateOutboundTemplate.mockRejectedValue(new Error('模板编码冲突'));
    render(<OutboundPage api={api as never} />);
    expect(await screen.findByRole('heading', { name: '邮件草稿' })).toBeVisible();
    fireEvent.click(screen.getByText('编辑邮件草稿', {selector:'summary'}));
    fireEvent.click(screen.getByRole('button', { name: '邮件配置' }));
    fireEvent.click(await screen.findByRole('button', { name: '编辑模板 更新资料' }));
    fireEvent.change(screen.getByLabelText('模板名称'), { target: { value: '未保存模板名' } });
    fireEvent.click(screen.getByRole('button', { name: '保存模板' }));
    expect(await screen.findByText('模板编码冲突')).toBeVisible();
    expect(screen.getByLabelText('模板名称')).toHaveValue('未保存模板名');
  });

  it('creates templates and signatures and edits existing optional blocks', async () => {
    const api = apiFixture();
    render(<OutboundPage api={api as never} />);
    expect(await screen.findByRole('heading', { name: '邮件草稿' })).toBeVisible();
    fireEvent.click(screen.getByText('编辑邮件草稿', {selector:'summary'}));
    fireEvent.click(screen.getByRole('button', { name: '邮件配置' }));

    fireEvent.click(await screen.findByRole('button', { name: '新增邮件模板' }));
    fireEvent.change(screen.getByLabelText('模板编码'), { target: { value: 'initial_extra' } });
    fireEvent.change(screen.getByLabelText('模板名称'), { target: { value: '首批补充模板' } });
    fireEvent.change(screen.getByLabelText('主题模板'), { target: { value: '{{package_name}}' } });
    fireEvent.change(screen.getByLabelText('正文模板'), { target: { value: '{{file_list}}' } });
    fireEvent.click(screen.getByRole('button', { name: '保存模板' }));
    await waitFor(() => expect(api.createOutboundTemplate).toHaveBeenCalledWith(expect.objectContaining({ key: 'initial_extra', name: '首批补充模板' })));

    await waitFor(() => expect(screen.queryByRole('form')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('tab', { name: '邮件签名' }));
    fireEvent.click(await screen.findByRole('button', { name: '新增邮件签名' }));
    fireEvent.change(screen.getByLabelText('签名名称'), { target: { value: '供应商签名' } });
    fireEvent.change(screen.getByLabelText('签名内容'), { target: { value: '顺祝商祺' } });
    fireEvent.click(screen.getByRole('button', { name: '保存签名' }));
    await waitFor(() => expect(api.createOutboundSignature).toHaveBeenCalledWith(expect.objectContaining({ name: '供应商签名', content: '顺祝商祺' })));
    await waitFor(() => expect(screen.queryByRole('form')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('tab', { name: '邮件模板' }));
    await screen.findByRole('button', { name: '编辑模板 更新资料' });
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
    expect(await screen.findByRole('heading', { name: '邮件草稿' })).toBeVisible();
    fireEvent.click(screen.getByText('编辑邮件草稿', {selector:'summary'}));
    fireEvent.click(screen.getByRole('button', { name: '邮件配置' }));
    fireEvent.click(screen.getByRole('tab', { name: '邮件签名' }));
    fireEvent.click(await screen.findByRole('button', { name: '新增邮件签名' }));
    fireEvent.change(screen.getByLabelText('签名名称'), { target: { value: '保留的新签名' } });
    fireEvent.change(screen.getByLabelText('签名内容'), { target: { value: '未保存内容' } });
    fireEvent.click(screen.getByRole('button', { name: '保存签名' }));
    expect(await screen.findByText('签名名称已存在')).toBeVisible();
    expect(screen.getByLabelText('签名名称')).toHaveValue('保留的新签名');
    expect(screen.getByLabelText('签名内容')).toHaveValue('未保存内容');
  });
  it('keeps one editor and refuses dirty cancel, replacement, tab changes and return', async () => {
    const api = apiFixture(); const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<OutboundPage api={api as never} />);
    fireEvent.click(screen.getByText('编辑邮件草稿', {selector:'summary'}));
    fireEvent.change(await screen.findByLabelText('正文'), { target: { value: '保留工作草稿' } });
    fireEvent.click(screen.getByRole('button', { name: '邮件配置' }));
    fireEvent.click(await screen.findByRole('button', { name: '编辑模板 更新资料' }));
    fireEvent.change(screen.getByLabelText('模板名称'), { target: { value: '未保存' } });
    for (const target of [screen.getByRole('button', { name: '取消' }), screen.getByRole('button', { name: '新增邮件模板' }), screen.getByRole('tab', { name: '邮件签名' }), screen.getByRole('button', { name: '返回外发工作台' })]) {
      fireEvent.click(target); expect(screen.getByLabelText('模板名称')).toHaveValue('未保存');
      expect(screen.getAllByRole('form')).toHaveLength(1);
    }
    expect(confirm).toHaveBeenCalledTimes(4); confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('tab', { name: '邮件签名' }));
    expect(await screen.findByRole('button', { name: '新增邮件签名' })).toBeVisible();
    expect(screen.queryByLabelText('模板名称')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '新增邮件模板' })).not.toBeInTheDocument();
    await screen.findByRole('button', { name: '编辑签名 默认签名' });
    expect(screen.getByText((_text, element) => element?.tagName === 'PRE' && element.textContent === signature.content)).not.toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '返回外发工作台' }));
    expect(screen.getByLabelText('正文')).toHaveValue('保留工作草稿');
  });
  it('retains dirty contacts on failed save and blocks duplicate writes and leaving while busy', async () => {
    const api = apiFixture(); let rejectSave!: (error: Error) => void;
    api.updateOutboundContact.mockImplementation(() => new Promise((_resolve, reject) => { rejectSave = reject; }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<OutboundPage api={api as never} />);
    fireEvent.click(await screen.findByRole('button', { name: '邮件配置' }));
    fireEvent.click(screen.getByRole('tab', { name: '联系人' }));
    fireEvent.click(await screen.findByRole('button', { name: '编辑' }));
    expect(screen.getByRole('table', { name: '联系人列表' }).querySelectorAll('th')).toHaveLength(6);
    fireEvent.change(screen.getByLabelText('备注'), { target: { value: '保留备注' } });
    fireEvent.click(screen.getByRole('button', { name: '保存联系人' }));
    fireEvent.submit(screen.getByRole('form', { name: '联系人编辑' }));
    fireEvent.click(screen.getByRole('tab', { name: '邮件模板' }));
    fireEvent.click(screen.getByRole('button', { name: '返回外发工作台' }));
    expect(api.updateOutboundContact).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('备注')).toHaveValue('保留备注');
    await act(async () => rejectSave(new Error('保存失败')));
    expect(await screen.findByText('保存失败')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '取消' })); expect(confirm).toHaveBeenCalledOnce();
    expect(screen.getByLabelText('备注')).toHaveValue('保留备注'); confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: '新增联系人' }));
    expect(screen.getByLabelText('备注')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
  });
  it('exposes configuration dirty and in-flight guards to the owning shell and clears them on return', async () => {
    const api = apiFixture(); const register = vi.fn(); const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<OutboundPage api={api as never} registerLeaveGuard={register} />);
    fireEvent.click(await screen.findByRole('button', { name: '邮件配置' }));
    fireEvent.click(await screen.findByRole('button', { name: '编辑模板 更新资料' }));
    fireEvent.change(screen.getByLabelText('模板名称'), { target: { value: '脏修改' } });
    expect(register.mock.lastCall?.[0]()).toBe(false); confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: '返回外发工作台' }));
    expect(register.mock.lastCall?.[0]).toBeNull();
  });
  it.each(['template', 'parent', 'block', 'signature'])('closes the unified editor after deleting its %s record', async kind => {
    const api = apiFixture(); vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<OutboundPage api={api as never} />);
    fireEvent.click(await screen.findByRole('button', { name: '邮件配置' }));
    const editTemplate = await screen.findByRole('button', { name: '编辑模板 更新资料' });
    if (kind === 'template') fireEvent.click(editTemplate);
    else if (kind === 'signature') { fireEvent.click(screen.getByRole('tab', { name: '邮件签名' })); fireEvent.click(await screen.findByRole('button', { name: '编辑签名 默认签名' })); }
    else { fireEvent.click(screen.getByText('附加段落')); fireEvent.click(screen.getByRole('button', { name: '编辑附加段落 METI 后更新' })); }
    const record = kind === 'signature' ? screen.getByRole('button', { name: '编辑签名 默认签名' }).closest('article')! : editTemplate.closest('article')!;
    const deletes = within(record).getAllByRole('button', { name: '删除' }); fireEvent.click(deletes[kind === 'block' ? 1 : 0]);
    const remove = kind === 'signature' ? api.deleteOutboundSignature : kind === 'block' ? api.deleteOutboundTemplateBlock : api.deleteOutboundTemplate;
    await waitFor(() => expect(remove).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.queryByRole('form')).not.toBeInTheDocument());
  });
  it('refreshes composer choices on configuration return and keeps manual text', async () => {
    const api = apiFixture(); render(<OutboundPage api={api as never} />);
    fireEvent.click(await screen.findByLabelText('收件人 王经理'));
    fireEvent.click(screen.getByText('编辑邮件草稿', {selector:'summary'}));
    fireEvent.change(screen.getByLabelText('主题'), { target: { value: '手工主题' } });
    fireEvent.change(screen.getByLabelText('正文'), { target: { value: '手工正文' } });
    fireEvent.click(screen.getByLabelText('附加段落 METI 后更新'));
    fireEvent.click(screen.getByRole('button', { name: '邮件配置' }));
    await screen.findByRole('button', { name: '编辑模板 更新资料' });
    api.listOutboundContacts.mockResolvedValue([]); api.listOutboundTemplates.mockResolvedValue([]); api.listOutboundSignatures.mockResolvedValue([]);
    fireEvent.click(screen.getByRole('button', { name: '返回外发工作台' }));
    await waitFor(() => expect(screen.queryByLabelText('收件人 王经理')).not.toBeInTheDocument());
    expect(screen.getByLabelText('邮件模板')).toHaveValue(''); expect(screen.getByLabelText('邮件签名')).toHaveValue('');
    expect(screen.getByLabelText('收件人文本')).toHaveValue(''); expect(screen.queryByLabelText('附加段落 METI 后更新')).not.toBeInTheDocument();
    expect(screen.getByLabelText('主题')).toHaveValue('手工主题'); expect(screen.getByLabelText('正文')).toHaveValue('手工正文');
    expect(screen.getByRole('button', { name: '生成邮件内容' })).toBeDisabled();
  });

  it('closes a persisted new template when refresh fails and retries only the list read', async () => {
    const api = apiFixture();
    render(<OutboundPage api={api as never} />);
    fireEvent.click(await screen.findByRole('button', { name: '邮件配置' }));
    await screen.findByRole('button', { name: '编辑模板 更新资料' });
    fireEvent.click(screen.getByRole('button', { name: '新增邮件模板' }));
    fireEvent.change(screen.getByLabelText('模板编码'), { target: { value: 'persisted_extra' } });
    fireEvent.change(screen.getByLabelText('模板名称'), { target: { value: '已保存的新模板' } });
    fireEvent.change(screen.getByLabelText('主题模板'), { target: { value: '{{package_name}}' } });
    fireEvent.change(screen.getByLabelText('正文模板'), { target: { value: '{{file_list}}' } });
    api.listOutboundTemplates.mockRejectedValueOnce(new Error('读取暂时不可用'));
    fireEvent.click(screen.getByRole('button', { name: '保存模板' }));
    expect(await screen.findByText('已保存，但列表刷新失败：读取暂时不可用')).toBeVisible();
    await waitFor(() => expect(screen.queryByRole('form', { name: '邮件模板编辑' })).not.toBeInTheDocument());
    expect(api.createOutboundTemplate).toHaveBeenCalledOnce();
    api.listOutboundTemplates.mockResolvedValue([template, { ...template, id: 22, key: 'persisted_extra', name: '已保存的新模板', blocks: [] }]);
    fireEvent.click(screen.getByRole('button', { name: '重新加载列表' }));
    expect(await screen.findByRole('button', { name: '编辑模板 已保存的新模板' })).toBeVisible();
    expect(screen.queryByRole('button', { name: '重新加载列表' })).not.toBeInTheDocument();
    expect(api.createOutboundTemplate).toHaveBeenCalledOnce();
  });

  it('clears a deleted record editor even if its following list refresh fails', async () => {
    const api = apiFixture(); vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<OutboundPage api={api as never} />);
    fireEvent.click(await screen.findByRole('button', { name: '邮件配置' }));
    const edit = await screen.findByRole('button', { name: '编辑模板 更新资料' });
    fireEvent.click(edit);
    api.listOutboundTemplates.mockRejectedValueOnce(new Error('列表读取失败'));
    fireEvent.click(within(edit.closest('article')!).getAllByRole('button', { name: '删除' })[0]);
    expect(await screen.findByText('已保存，但列表刷新失败：列表读取失败')).toBeVisible();
    await waitFor(() => expect(screen.queryByRole('form')).not.toBeInTheDocument());
    expect(api.deleteOutboundTemplate).toHaveBeenCalledOnce();
  });

});
