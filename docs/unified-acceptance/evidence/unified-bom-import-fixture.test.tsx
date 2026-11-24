import { readFileSync } from 'node:fs';

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BomPage, localBusinessDateToday } from '../../src/renderer/pages/BomPage';
import { openBomAssetLocation } from '../../src/renderer/desktop-files';

const product = { id: 1, brandId: 1, brandName: 'SAMKYO', productSizeId: 2, productSizeName: '冰柜',
  defaultAppearanceId: 3, defaultAppearanceName: '一号外观', model: 'ZC100', productCategory: '冰柜',
  referenceProductId: null, referenceProductModel: null, status: 'active' as const };
const project = { id: 7, code: '01', name: 'LOGO', parentId: 6, status: 'active' as const };
const mainCategory = { id: 6, code: '04', name: '印刷件类', parentId: null, status: 'active' as const };
const candidate = { origin: 'planned' as const, drawingId: 10, fullCode: '02.0404.010.0401001', displayName: 'SAMKYO-ZC100白色-LOGO',
  projectItemId: 7, projectItemName: 'LOGO', status: 'reserved' as const };
const asset = { id: 31, relativePath: 'BOM/SKU/a.png', originalFileName: '客户示意图.png', mimeType: 'image/png', sizeBytes: 8,
  contentSha256: 'abc', createdAt: '2026-09-01T00:00:00Z' };
const currentWithReferences = { id: 20, productId: 1, model: 'ZC100', versionNumber: 1, previousVersionId: null,
  businessChangeDate: '2026-09-02', businessChangeDateLabel: '2026-09-02', notes: null, createdAt: '2026-09-02T00:00:00Z', items: [{
    bomItemId: 30, origin: 'planned' as const, drawingId: 10, fullCode: candidate.fullCode, displayName: candidate.displayName, projectItemId: 7, projectItemName: 'LOGO',
    status: 'voided' as const, effectiveMaterialBatchId: null, effectiveBatchRelativePath: null, effectiveBatchName: null, material: null,
    dimensions: null, position: null, notes: null, usesWhiteMaterial: false,
    assets: [{ ...asset, assetId: 31, role: 'image' as const, inheritedFromBomItemAssetId: null }],
    qrCodes: [{ id: 9, name: '说明书二维码', purposeDisplayName: '说明书', status: 'inactive' as const }],
  }] };
const activeCurrent = { ...currentWithReferences, items: [{ ...currentWithReferences.items[0], status: 'active' as const, qrCodes: [] }] };
const secondProject = { id: 8, code: '02', name: '说明书', parentId: 6, status: 'active' as const };
const replacementCandidate = { ...candidate, drawingId: 11, fullCode: '02.0404.010.0401002', status: 'active' as const };

function apiFixture() {
  return {
    listProducts: vi.fn().mockResolvedValue([product]),
    listDictionaries: vi.fn().mockImplementation((type: string) => Promise.resolve(type === 'main_category' ? [mainCategory] : [project])),
    listMaterialBatches: vi.fn().mockResolvedValue([{ id: 8, name: '20260901', relativePath: 'X/20260901', productId: 1, isPresent: true }]),
    getCurrentBom: vi.fn().mockResolvedValue(null), listBomVersions: vi.fn().mockResolvedValue([]),
    queryBomVersions: vi.fn().mockResolvedValue([]), listBomCandidates: vi.fn().mockResolvedValue([candidate]),
    listBomQrCandidates: vi.fn().mockResolvedValue([{ id: 9, name: '说明书二维码', purposeDisplayName: '说明书', status: 'active' }]),
    uploadBomAsset: vi.fn().mockResolvedValue(asset), getBomVersion: vi.fn(),
    previewBomVersionDeletion: vi.fn().mockResolvedValue({ versionId: 20, productId: 1, model: 'ZC100', versionNumber: 1,
      isCurrent: true, fallbackVersionId: null, fallbackVersionNumber: null }),
    deleteBomVersion: vi.fn().mockResolvedValue({ deletedVersionId: 20, productId: 1, wasCurrent: true,
      currentVersionId: null, currentVersionNumber: null }),
    deleteProductBom: vi.fn().mockResolvedValue({ productId: 1, deletedCount: 1, currentVersionId: null }),
    saveBomVersion: vi.fn().mockResolvedValue({ version: { id: 20, productId: 1, model: 'ZC100', versionNumber: 1,
      previousVersionId: null, businessChangeDate: '2026-09-02', businessChangeDateLabel: '2026-09-02', notes: null,
      createdAt: '2026-09-02T00:00:00Z', items: [] }, diff: [] }),
  };
}

async function selectProduct(expectEmpty = true) {
  fireEvent.change(await screen.findByLabelText('BOM 产品型号'), { target: { value: '1' } });
  if (expectEmpty) await screen.findByText('尚未建立 BOM');
}

it('imports the explicitly selected drawings as BOM draft rows and rejects two candidates for the same project', async () => {
  const api = apiFixture();
  api.listBomCandidates.mockResolvedValue([candidate, replacementCandidate]);
  render(<BomPage api={api as never} />);
  await selectProduct();
  fireEvent.click(screen.getByRole('button', {name:'从图号库批量导入'}));
  const dialog = within(await screen.findByRole('dialog', {name:'从图号库批量导入'}));
  fireEvent.change(dialog.getByLabelText('批量导入主类别'), {target:{value:String(mainCategory.id)}});
  const boxes = await dialog.findAllByRole('checkbox');
  expect(boxes).toHaveLength(2);
  fireEvent.click(boxes[0]); fireEvent.click(boxes[1]);
  expect(dialog.getByRole('button', {name:'导入 2 个项目'})).toBeDisabled();
  expect(dialog.getByRole('alert')).toHaveTextContent(project.name);
  fireEvent.click(boxes[0]);
  fireEvent.click(dialog.getByRole('button', {name:'导入 1 个项目'}));
  expect(screen.getByLabelText('第 1 行图号')).toHaveValue('planned:11');
  expect(screen.getByLabelText('第 1 行项目明细')).toHaveValue(String(project.id));
  expect(screen.getByLabelText('第 1 行材质')).toHaveValue('');
  expect(api.saveBomVersion).not.toHaveBeenCalled();
  expect(api.uploadBomAsset).not.toHaveBeenCalled();
});
