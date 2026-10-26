import type { BomItemAssetView } from '../../data/client';
import { BomAssetPreview } from './BomAssetPreview';

export function BomHistoryAsset({ asset, gallery }: { asset: BomItemAssetView; gallery?: BomItemAssetView[]; onOpen(id: number): void; previewOnly: boolean }) {
  return <div className="bom-history-asset"><BomAssetPreview assetId={asset.assetId} name={asset.originalFileName} gallery={gallery} /></div>;
}
