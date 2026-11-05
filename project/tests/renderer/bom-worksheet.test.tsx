import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { BomPage } from '../../src/renderer/pages/BomPage';
import { BomRecordNotices } from '../../src/renderer/pages/bom/BomRecordNotices';
import { BomEditComparison } from '../../src/renderer/pages/bom/BomEditComparison';
import { createBomMockApi } from '../../src/renderer/pages/bom/bom-mock';

afterEach(() => window.history.replaceState(null, '', '/'));
it('emphasizes change details only where content exists, independently of reference data', async () => {
  await preview();
  const record = screen.getByRole('article', { name: 'BOM 项目 1' });
  const field = within(record).getByLabelText('第 1 行修改明细');
  expect(field.closest('.bom-edit-field')).toHaveClass('bom-change-present');
  fireEvent.change(field, { target: { value: '   ' } });
  expect(field.closest('.bom-edit-field')).not.toHaveClass('bom-change-present');
  fireEvent.click(within(record).getByRole('button',{name:'修改前数据'}));
  expect(screen.getByLabelText('项目 1 修改前数据 · 修改明细')).toHaveClass('bom-change-present');
});
it('does not infer attachment differences or changes without authoritative diff data', async () => {
  const item = (await createBomMockApi('normal').getBomVersion(-201)).items[0];
  const props = { index: 1, original: item, mainCategories: [], projects: [], query: true };
  const fields = ['主类别', '项目', '图号', '生效批次', '材质', '尺寸', '图片', '位置', '位置示意图', '修改明细', '备注'];
  const { rerender } = render(<BomEditComparison {...props}>{fields.map((field) => <div key={field}>{field}</div>)}</BomEditComparison>);
  expect(screen.queryByLabelText('项目 1 图片差异')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('项目 1 位置示意图差异')).not.toBeInTheDocument();
  rerender(<BomEditComparison {...props} original={undefined}>{fields.map((field) => <div key={field}>{field}</div>)}</BomEditComparison>);
  expect(screen.queryByText('值不同')).not.toBeInTheDocument();
  expect(screen.queryByText('新增')).not.toBeInTheDocument();
});
it('preserves editable values and their baseline without inferred change markers', async () => {
  await preview();
  const record = screen.getByRole('article', { name: 'BOM 项目 1' });
  expect(within(record).queryByText('已修改')).not.toBeInTheDocument();
  fireEvent.change(within(record).getByLabelText('第 1 行材质'), { target: { value: '157g 铜版纸' } });
  expect(within(record).queryByLabelText('项目 1 材质差异')).not.toBeInTheDocument();
  expect(within(record).getByLabelText('第 1 行材质')).toHaveValue('157g 铜版纸');
  fireEvent.click(within(record).getByRole('button',{name:'修改前数据'}));
  expect(screen.getByLabelText('项目 1 修改前数据 · 材质')).toHaveTextContent('128g 铜版纸');
  expect(within(record).queryByLabelText('项目 1 尺寸差异')).not.toBeInTheDocument();
  fireEvent.change(within(record).getByLabelText('第 1 行材质'), { target: { value: '128g 铜版纸' } });
  expect(within(record).queryByText('已修改')).not.toBeInTheDocument();
});
it('compares the explicit predecessor and clears it when selecting the first record', async () => {
  await preview();
  fireEvent.click(screen.getByRole('button', { name: '查询 BOM' }));
  fireEvent.click(await screen.findByRole('button', { name: '查看 BOM -201' }));
  await screen.findAllByRole('button',{name:'全部字段'});
  const project = screen.getByRole('button', { name: /项目 2 · 包装箱/ }).closest('article')!;
  fireEvent.click(within(project).getByRole('button', { name: '全部字段' }));
  const drawing = within(project).getByRole('rowheader', { name: '图号' }).closest('tr')!;
  expect(drawing.cells[2]).toHaveTextContent('02.0209.010.0501002');
  expect(drawing.cells[1]).not.toHaveTextContent('历史图号 · 已停用');
  fireEvent.click(screen.getByRole('button', { name: '查看 BOM -202' }));
  expect((await screen.findAllByRole('button',{name:/首次记录/})).length).toBeGreaterThan(0);
  expect(screen.queryByText(/对照上一条记录/)).not.toBeInTheDocument();
  expect(screen.queryByRole('columnheader', { name: '上一条记录' })).not.toBeInTheDocument();
});
it('retains complete query fields and independent attachment roles in all-fields mode', async () => {
  await preview();
  fireEvent.click(screen.getByRole('button', { name: '查询 BOM' }));
  fireEvent.click(await screen.findByRole('button', { name: '查看 BOM -201' }));
  await screen.findAllByRole('button',{name:'全部字段'});
  const project = screen.getByRole('button', { name: /项目 1 · 说明书/ }).closest('article')!;
  fireEvent.click(within(project).getByRole('button', { name: '全部字段' }));
  for (const field of ['主类别','项目明细','图号','生效批次','材质','尺寸','位置','修改明细','备注','数量','引用白色图号'])
    expect(within(project).getByRole('rowheader', {name: field})).toBeVisible();
  expect(project).toHaveTextContent('02.0209.010.0501001');
  expect(within(project).getAllByRole('button',{name:'放大图片'}).length).toBeGreaterThan(0);
  expect(project).not.toHaveTextContent('说明书-图片.png');
});

it('keeps loaded baseline unchanged when editing a field or changing project identity', async () => {
  await preview();
  const record = screen.getByRole('article', { name: 'BOM 项目 1' });
  fireEvent.click(within(record).getByRole('button',{name:'修改前数据'}));
  const baseline = screen.getByLabelText('项目 1 修改前数据 · 材质');
  expect(baseline).toHaveTextContent('128g 铜版纸');
  fireEvent.change(within(record).getByLabelText('第 1 行材质'), { target: { value: '本次新材质' } });
  expect(baseline).toHaveTextContent('128g 铜版纸');
  expect(baseline).not.toHaveTextContent('本次新材质');
  fireEvent.change(within(record).getByLabelText('第 1 行项目明细'), { target: { value: '-21' } });
  expect(screen.getByLabelText('项目 1 修改前数据 · 项目')).toHaveTextContent('说明书');
  expect(baseline).not.toHaveTextContent('五层瓦楞纸');
});
it('does not borrow another project baseline for newly added rows', async () => {
  await preview();
  fireEvent.click(screen.getByRole('button', { name: '添加 BOM 项目' }));
  const record = screen.getByRole('article', { name: 'BOM 项目 9' });
  expect(within(record).queryByRole('button',{name:'修改前数据'})).toBeNull();
});
it('distinguishes nonblocking cautions from existing save blockers', () => {
  const { rerender } = render(<BomRecordNotices index={1} drawingStatus="voided" batchMissing previewFailed />);
  expect(screen.getByText('图号作废')).toHaveAttribute('data-tone', 'error');
  expect(screen.getByText('批次缺失')).toHaveAttribute('data-tone', 'warning');
  expect(screen.getByText('附件预览失败')).toHaveAttribute('data-tone', 'warning');
  expect(screen.queryByText('保存阻塞')).not.toBeInTheDocument();
  rerender(<BomRecordNotices index={1} drawingStatus="voided" blocked />);
  expect(screen.getByText('保存阻塞')).toBeVisible();
});
async function preview(scenario = 'normal') {
  window.history.replaceState(null, '', `/?mock=bom&bom-scenario=${scenario}`);
  render(<BomPage api={{} as never} />);
  await screen.findByLabelText('第 1 行图号');
}
it('keeps code primary and shows qualification once outside the select', async () => {
  await preview();
  const row = within(screen.getByRole('article', { name: 'BOM 项目 1' }));
  expect(row.getByRole('option', { name: '02.0209.010.0501001' })).toBeInTheDocument();
  expect(row.getByText('正式规划 · 正式使用')).toBeVisible();
});
it('groups upload and reuse with each independent attachment role', async () => {
  await preview();
  const image = screen.getByRole('group', { name: '第 1 行图片附件' });
  const diagram = screen.getByRole('group', { name: '第 1 行位置示意图附件' });
  expect(within(image).getByLabelText('第 1 行图片')).toBeDisabled();
  expect(within(image).getByRole('radio',{name:'使用上一版图片'})).toBeChecked();
  expect(within(diagram).getByRole('radio',{name:'使用上一版位置示意图'})).toBeChecked();
  expect(within(image).getByRole('radio',{name:'更换图片'})).not.toBeChecked();
  expect(within(diagram).getByRole('radio',{name:'使用上一版位置示意图'})).toBeChecked();
});
it('summarizes known exceptions but does not classify legal empty attachments as errors', async () => {
  await preview('references');
  expect(screen.getByLabelText('项目 1 提示')).toHaveTextContent('图号作废');
  expect(screen.getByLabelText('项目 3 提示')).toHaveTextContent('批次缺失');
  expect(await screen.findByLabelText('项目 5 提示')).toHaveTextContent('附件预览失败');
  expect(screen.queryByLabelText('项目 4 提示')).not.toBeInTheDocument();
  expect(within(screen.getByRole('group', { name: '第 4 行图片附件' })).getByText('未关联图片')).toBeInTheDocument();
});
it('query details inherit exception summaries and show content rather than disabled inputs', async () => {
  await preview('references');
  fireEvent.click(screen.getByRole('button', { name: '查询 BOM' }));
  fireEvent.click(await screen.findByRole('button', { name: '查看 BOM -201' }));
  const detail = await screen.findByLabelText('所选 BOM 记录');
  expect(within(detail).getByLabelText('项目 1 提示')).toHaveTextContent('图号作废');
  expect(detail.querySelectorAll('.bom-history-project input')).toHaveLength(0);
  expect(detail.querySelectorAll('.bom-history-project textarea')).toHaveLength(0);
});
it('locates drawing exceptions at the field without a repeated project footer', async () => {
  await preview('references');
  const record = screen.getByRole('article', { name: 'BOM 项目 1' });
  const drawing = within(record).getByLabelText('第 1 行图号');
  expect(drawing).toHaveAttribute('aria-invalid', 'true');
  const description = drawing.getAttribute('aria-describedby')!.split(' ').map((id) => document.getElementById(id)?.textContent).join(' ');
  expect(description).toContain('请选择可用图号替换后再保存');
  expect(within(record).queryByText('项目 1 · 图号：原引用已作废，请选择可用图号')).not.toBeInTheDocument();
  expect(screen.getAllByRole('status').some(e=>e.textContent?.includes('项目 1 · 图号：原引用已作废，请选择可用图号'))).toBe(true);
});
