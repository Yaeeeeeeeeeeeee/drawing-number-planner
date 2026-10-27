import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmailComposer } from '../../src/renderer/pages/outbound/EmailComposer';

const product = { id: 1, brandName: '品牌甲', model: 'T40', productCategory: '电饭煲' };
const template = { id: 1, key: 'a', name: '厂家甲更新', manufacturer: '厂家甲', scenario: '更新包材资料', materialType: 'update', subjectTemplate: '{{brand}} {{model}} {{date}} {{package_name}}', bodyTemplate: '{{change_files}}\n{{signature}}', status: 'active', blocks: [] };
const context = { packageId: 12, createdAt: '2026-10-20T12:00:00Z', packageName: '本次资料', packageFiles: ['private/本次资料.zip'], product, materialType: 'update', packageMode: 'change_only', manufacturer: '厂家甲', scenario: '更新包材资料', batchName: '本次批次', items: [
  { pdfFileId: 1, projectItemName: '铭牌', fullCode: '02.0101.010.0201005', mainCategoryName: '标贴', fileName: 'private/真实铭牌（转曲）.pdf', sourceBatchName: '本次批次', change: 'replaced' },
] };
function apiFixture() { return {
  listOutboundTemplates: vi.fn().mockResolvedValue([template, { ...template, id: 2, name: '厂家乙更新', manufacturer: '厂家乙' }]),
  listOutboundContacts: vi.fn().mockResolvedValue([{ id: 1, company: '厂家甲', contactName: '张经理', email: 'to@a.test', defaultRecipientType: 'to' }, { id: 2, company: '厂家甲', contactName: '李经理', email: 'cc@a.test', defaultRecipientType: 'cc' }, { id: 3, company: '厂家乙', contactName: '王经理', email: 'other@b.test', defaultRecipientType: 'to' }]),
  listOutboundSignatures: vi.fn().mockResolvedValue([{ id: 1, name: '工作签名', content: '工作签名内容', isDefault: true }]),
  renderOutboundTemplate: vi.fn().mockImplementation(async (_id, fields) => ({ subject: `${fields.brand} ${fields.model} ${fields.date} ${fields.package_name}`, body: `${fields.change_files}\n${fields.signature}` })),
}; }
afterEach(() => vi.restoreAllMocks());
describe('V5.1 outbound mail draft', () => {
  it('uses only actual changed ZIP files, retains PDF names, and synchronizes reasons', async () => {
    const api = apiFixture();
    render(<EmailComposer api={api as never} mailContext={{ ...context, items: [...context.items, { ...context.items[0], pdfFileId: 2, fileName: '沿用说明书.pdf', projectItemName: '说明书', change: 'copied' }] } as never} />);
    await waitFor(() => expect((screen.getByLabelText('正文') as HTMLTextAreaElement).value).toContain('真实铭牌（转曲）.pdf'));
    expect((screen.getByLabelText('正文') as HTMLTextAreaElement).value).toContain('【请填写具体修改原因】');
    expect((screen.getByLabelText('正文') as HTMLTextAreaElement).value).not.toContain('沿用说明书');
    fireEvent.change(screen.getByLabelText('修改原因 铭牌'), { target: { value: '修正额定功率' } });
    await waitFor(() => expect((screen.getByLabelText('正文') as HTMLTextAreaElement).value).toContain('修正额定功率'));
    expect((screen.getByLabelText('正文') as HTMLTextAreaElement).value).not.toContain('private');
    expect(screen.getByLabelText('主题')).toHaveValue('品牌甲 T40 2026-10-20 本次资料');
    expect(screen.getByLabelText('收件人文本')).toHaveValue('to@a.test');
    expect(screen.getByLabelText('抄送文本')).toHaveValue('cc@a.test');
    fireEvent.change(screen.getByLabelText('收件人文本'), { target: { value: 'manual@a.test' } });
    expect(screen.getByLabelText('收件人文本')).toHaveValue('manual@a.test');
  });
  it('requires explicit manufacturer and scenario selection and never picks another manufacturer', async () => {
    const api = apiFixture();
    api.listOutboundTemplates.mockResolvedValue([template, { ...template, id: 3, name: '厂家甲补发', scenario: '补发' }, { ...template, id: 2, name: '厂家乙更新', manufacturer: '厂家乙' }]);
    render(<EmailComposer api={api as never} mailContext={{ ...context, manufacturer: undefined, scenario: undefined } as never} />);
    await screen.findByRole('option', { name: '厂家甲' });
    expect(api.renderOutboundTemplate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '生成邮件内容' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('适用厂家'), { target: { value: '厂家甲' } });
    expect(api.renderOutboundTemplate).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('邮件场景'), { target: { value: '更新包材资料' } });
    await waitFor(() => expect((screen.getByLabelText('正文') as HTMLTextAreaElement).value).toContain('真实铭牌'));
    expect(within(screen.getByLabelText('邮件模板')).queryByRole('option', { name: '厂家乙更新' })).not.toBeInTheDocument();
  });
  it('does not substitute another scenario when the specified scenario has no matching template', async () => {
    const api = apiFixture();
    render(<EmailComposer api={api as never} mailContext={{ ...context, scenario: '补铭牌' } as never} />);
    await screen.findByText(/没有匹配厂家、资料类型和场景的模板/);
    await screen.findByRole('option', { name: '厂家甲' });
    await act(async () => {});
    expect(screen.getByRole('button', { name: '生成邮件内容' })).toBeDisabled();
    expect(api.renderOutboundTemplate).not.toHaveBeenCalled();
  });
  it('preserves manually adjusted addresses when configuration choices refresh', async () => {
    const api = apiFixture();
    const { rerender } = render(<EmailComposer api={api as never} mailContext={context as never} />);
    await waitFor(() => expect(screen.getByLabelText('收件人文本')).toHaveValue('to@a.test'));
    fireEvent.change(screen.getByLabelText('收件人文本'), { target: { value: 'manual@a.test' } });
    api.listOutboundContacts.mockResolvedValue([{ id: 1, company: '厂家甲', contactName: '新称呼', email: 'new@a.test', defaultRecipientType: 'to' }]);
    rerender(<EmailComposer api={api as never} mailContext={context as never} refreshRevision={1} />);
    await screen.findByLabelText('收件人 新称呼');
    expect(screen.getByLabelText('收件人文本')).toHaveValue('manual@a.test');
  });
  it('keeps manually edited body until explicit regeneration confirmation', async () => {
    const api = apiFixture(); const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<EmailComposer api={api as never} mailContext={context as never} />);
    await waitFor(() => expect((screen.getByLabelText('正文') as HTMLTextAreaElement).value).toContain('真实铭牌'));
    fireEvent.change(screen.getByLabelText('正文'), { target: { value: '请保留我的正文' } });
    fireEvent.change(screen.getByLabelText('修改原因 铭牌'), { target: { value: '人工原因' } });
    await act(async () => {});
    expect(screen.getByLabelText('正文')).toHaveValue('请保留我的正文');
    fireEvent.click(screen.getByRole('button', { name: '生成邮件内容' }));
    expect(confirm).toHaveBeenCalled(); expect(screen.getByLabelText('正文')).toHaveValue('请保留我的正文');
    confirm.mockReturnValue(true); fireEvent.click(screen.getByRole('button', { name: '生成邮件内容' }));
    await waitFor(() => expect((screen.getByLabelText('正文') as HTMLTextAreaElement).value).toContain('人工原因'));
  });
  it('supports reorder, merge and delete descriptions without changing ZIP context', async () => {
    const api = apiFixture(); const original = { ...context, items: [...context.items, { ...context.items[0], pdfFileId: 2, projectItemName: '彩盒', fileName: '真实彩盒.pdf' }] };
    render(<EmailComposer api={api as never} mailContext={original as never} />);
    await screen.findByLabelText('修改原因 彩盒');
    fireEvent.click(screen.getByRole('button', { name: '上移 彩盒' }));
    await waitFor(() => expect((screen.getByLabelText('正文') as HTMLTextAreaElement).value.indexOf('彩盒')).toBeLessThan((screen.getByLabelText('正文') as HTMLTextAreaElement).value.indexOf('铭牌')));
    fireEvent.click(screen.getByLabelText('选择合并 铭牌')); fireEvent.click(screen.getByLabelText('选择合并 彩盒'));
    fireEvent.click(screen.getByRole('button', { name: '合并所选说明' }));
    expect(screen.getAllByPlaceholderText('请填写具体修改原因')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /删除说明/ }));
    await waitFor(() => expect((screen.getByLabelText('正文') as HTMLTextAreaElement).value).not.toContain('新文件'));
    expect(original.items).toHaveLength(2);
  });
  it('blocks automatic claims for unverified changes while retaining actual ZIP facts', async () => {
    const api = apiFixture();
    render(<EmailComposer api={api as never} mailContext={{ ...context, items: [{ ...context.items[0], changeVerified: false }] } as never} />);
    await screen.findByText(/变更状态尚未确认/);
    expect(screen.getByRole('button', { name: '生成邮件内容' })).toBeDisabled();
    expect(screen.queryByLabelText('修改原因 铭牌')).not.toBeInTheDocument();
    expect(api.renderOutboundTemplate).not.toHaveBeenCalled();
  });
  it('appends changes before independent signature when an update template has no change variable', async () => {
    const api = apiFixture(); api.listOutboundTemplates.mockResolvedValue([{ ...template, bodyTemplate: '固定开场和结尾' }]);
    api.renderOutboundTemplate.mockResolvedValue({ subject: '更新', body: '固定开场和结尾\n\n工作签名内容' });
    render(<EmailComposer api={api as never} mailContext={context as never} />);
    await waitFor(() => expect((screen.getByLabelText('正文') as HTMLTextAreaElement).value).toContain('本次修改的内容为'));
    const body = (screen.getByLabelText('正文') as HTMLTextAreaElement).value;
    expect(body.indexOf('真实铭牌')).toBeLessThan(body.indexOf('工作签名内容'));
    expect(body.match(/工作签名内容/g)).toHaveLength(1);
  });
  it('keeps filenames and visibility edits in legacy change_description templates', async () => {
    const api = apiFixture();
    api.listOutboundTemplates.mockResolvedValue([{ ...template, bodyTemplate: '{{change_description}}' }]);
    api.renderOutboundTemplate.mockImplementation(async (_id, fields) => ({ subject: '更新', body: fields.change_description }));
    render(<EmailComposer api={api as never} mailContext={context as never} />);
    await waitFor(() => expect((screen.getByLabelText('正文') as HTMLTextAreaElement).value).toContain('真实铭牌（转曲）.pdf'));
    fireEvent.click(screen.getByLabelText('显示文件名 铭牌'));
    await waitFor(() => expect((screen.getByLabelText('正文') as HTMLTextAreaElement).value).not.toContain('真实铭牌（转曲）.pdf'));
  });
  it('keeps unchanged files in ZIP facts without claiming a change in complete update mail', async () => {
    const api = apiFixture();
    render(<EmailComposer api={api as never} mailContext={{ ...context, packageMode: 'current_complete', items: [{ ...context.items[0], change: 'copied' }] } as never} />);
    await waitFor(() => expect(screen.getByLabelText('正文')).toHaveValue('\n工作签名内容'));
    expect(screen.queryByLabelText('修改原因 铭牌')).not.toBeInTheDocument();
  });
  it('does not force change descriptions into initial templates and blocks copying unresolved tokens', async () => {
    const api = apiFixture(); api.listOutboundTemplates.mockResolvedValue([{ ...template, materialType: 'initial', scenario: '完整交付' }]);
    api.renderOutboundTemplate.mockResolvedValue({ subject: '首批', body: '{{unknown}}' });
    const writeText = vi.fn(); Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<EmailComposer api={api as never} mailContext={{ ...context, materialType: 'initial', scenario: '完整交付' } as never} />);
    await screen.findByText(/未替换变量/);
    expect(screen.queryByLabelText('修改原因 铭牌')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('正文'), { target: { value: '{{unknown}}' } });
    fireEvent.click(screen.getByRole('button', { name: '复制邮件内容' }));
    expect(writeText).not.toHaveBeenCalled();
  });
});
