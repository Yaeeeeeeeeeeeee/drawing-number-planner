import type { BomItemRecord, BomVersionDetail } from './bom-types.js';

export const bomExportPath = (id: number, revision: number) => `/api/boms/versions/${id}/export-source?revision=${revision}`;

export function formatBomTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value || '—' : new Intl.DateTimeFormat('sv-SE', {
    dateStyle: 'short', timeStyle: 'medium', hourCycle: 'h23',
  }).format(date);
}

function escapeText(value: string | null | undefined): string {
  return (value || '—').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function fields(rows: [string, string | null | undefined][]): string {
  return rows.map(([label, value]) => `<tr><th scope="row">${label}</th><td>${escapeText(value)}</td></tr>`).join('');
}

function attachments(item: BomItemRecord): string {
  return (['image', 'diagram'] as const).map(role => {
    const label = role === 'image' ? '图片' : '位置示意图';
    const assets = item.assets.filter(asset => asset.role === role);
    const content = assets.map(asset => {
      const description = escapeText(`${item.projectItemName} · ${label} · ${asset.originalFileName}`);
      return `<img src="/api/boms/assets/${asset.assetId}/preview" alt="${description}">`;
    }).join('');
    return `<figure><figcaption>${label}</figcaption>${content || '<p>未提供</p>'}</figure>`;
  }).join('');
}

export function renderBomExportDocument(version: BomVersionDetail, productCategory: string | null,
  mainCategoryNames: ReadonlyMap<number, string>): string {
  const recordFields = fields([
    ['产品类别', productCategory], ['产品型号', version.model], ['业务变更日期', version.businessChangeDate],
    ['提交时间', formatBomTimestamp(version.createdAt)], ['最后修改时间', formatBomTimestamp(version.updatedAt)],
    ['记录备注', version.notes],
  ]);
  const projects = version.items.map(item => {
    const itemFields = fields([
      ['主类别', mainCategoryNames.get(item.projectItemId)], ['项目明细', item.projectItemName], ['完整图号', item.fullCode],
      ['生产批次', item.effectiveBatchName ?? item.effectiveBatchRelativePath],
      ['材质', item.material], ['尺寸', item.dimensions], ['位置', item.position],
      ['修改说明', item.changeDetails], ['备注', item.notes],
    ]);
    return `<table class="project">
      <colgroup><col class="label"><col></colgroup>
      <thead><tr><th colspan="2">${escapeText(item.projectItemName)} · ${escapeText(item.fullCode)}</th></tr>
        <tr><th scope="col">字段</th><th scope="col">内容</th></tr></thead>
      <tbody>${itemFields}<tr class="attachments"><td colspan="2"><div class="gallery">${attachments(item)}</div></td></tr></tbody>
    </table>`;
  }).join('');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>BOM-${version.id}</title>
  <style>
    @page { size: A4 portrait; margin: 13mm 14mm; }
    * { box-sizing: border-box; }
    body { font-family: "Microsoft YaHei", "Noto Sans CJK SC", "PingFang SC", sans-serif; color: #172331; font-size: 10pt; }
    h1 { font-size: 21pt; margin: 0 0 4mm; }
    h2 { font-size: 12pt; margin: 5mm 0 2mm; break-after: avoid; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 0 0 5mm; }
    .label { width: 28mm; }
    th, td { border: 1px solid #abb8c6; padding: 2mm 2.5mm; text-align: left; vertical-align: top; }
    th { background: #edf2f7; }
    td { white-space: pre-wrap; overflow-wrap: anywhere; }
    thead { display: table-header-group; break-inside: avoid; }
    .attachments { break-inside: avoid; }
    .attachments td { white-space: normal; }
    .gallery { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3mm; }
    figure { margin: 0; min-width: 0; }
    figcaption { font-weight: 700; margin-bottom: 2mm; }
    figure p { margin: 0; }
    img { display: block; width: 100%; height: 62mm; object-fit: contain; object-position: left top; }
    @media screen { body { max-width: 182mm; margin: 12mm auto; padding: 0 4mm; } }
  </style></head>
  <body data-bom-export="${version.id}" data-edit-revision="${version.editRevision}">
    <h1>BOM 记录 ${version.id}</h1>
    <h2>基本信息</h2><table><colgroup><col class="label"><col></colgroup><tbody>${recordFields}</tbody></table>
    <h2>BOM 项目明细</h2>${projects || '<p>未提供</p>'}
  </body></html>`;
}
