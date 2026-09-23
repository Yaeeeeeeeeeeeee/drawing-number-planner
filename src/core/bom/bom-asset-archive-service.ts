import type { PlannerDatabase } from '../../db/database.js';
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { BomAssetService, type ManagedBomAsset } from './bom-asset-service.js';
import { BomError } from './bom-errors.js';
import { resolveWorkspacePath } from '../files/workspace-paths.js';

interface ArchiveCandidate {
  linkId: number; assetId: number; model: string; businessDate: string | null; project: string;
  role: 'image' | 'diagram'; relativePath: string; versionId: number;
}
export class BomAssetArchiveService {
  constructor(private readonly db: PlannerDatabase, private readonly root: string) {}
  preview(): ArchiveCandidate[] {
    return this.db.prepare(`select link.id as linkId, link.asset_id as assetId, product.model,
      version.business_change_date as businessDate, project.name as project, link.role,
      asset.relative_path as relativePath, version.id as versionId
      from bom_item_assets link join bom_items item on item.id = link.bom_item_id
      join bom_versions version on version.id = item.bom_version_id
      join products product on product.id = version.product_id
      join dictionary_items project on project.id = item.project_item_id
      join bom_assets asset on asset.id = link.asset_id
      where link.deleted_at is null and item.deleted_at is null and version.deleted_at is null and product.deleted_at is null
      order by link.id`).all() as ArchiveCandidate[];
  }
  migrate(linkId: number): ManagedBomAsset | undefined {
    let created: ManagedBomAsset | undefined;
    try {
      this.db.transaction(() => {
        const item = this.preview().find((candidate) => candidate.linkId === linkId);
        if (!item) throw new BomError('ASSET_NOT_FOUND', '附件关联不存在或已退出当前业务');
        if (!item.businessDate) throw new BomError('INVALID_BUSINESS_CHANGE_DATE', '请先补录 BOM 业务日期再迁移附件');
        const mapped = this.db.prepare('select 1 from bom_asset_archive_mappings where bom_item_asset_id = ? and archived_asset_id = ?')
          .get(linkId, item.assetId);
        if (mapped && dirname(item.relativePath) === join('BOM附件', item.model, item.businessDate.replaceAll('-', ''))) return;
        created = new BomAssetService(this.db, this.root).archive({ ...item, businessDate: item.businessDate });
        this.db.prepare(`update bom_item_assets set inheritance_snapshot_json = ?, inherited_from_bom_item_asset_id = null
          where inherited_from_bom_item_asset_id = ?`).run(JSON.stringify({ sourceLinkId: linkId,
            assetId: item.assetId, relativePath: item.relativePath }), linkId);
        this.db.prepare('update bom_item_assets set asset_id = ? where id = ?').run(created.id, linkId);
        this.db.prepare(`insert into bom_asset_archive_mappings
          (source_asset_id, archived_asset_id, bom_item_asset_id, created_at) values (?, ?, ?, ?)`)
          .run(item.assetId, created.id, linkId, new Date().toISOString());
      }).immediate();
      return created;
    } catch (error) {
      if (created) rmSync(resolveWorkspacePath(this.root, created.relativePath, { requireExistingParent: true }), { force: true });
      throw error;
    }
  }
}
