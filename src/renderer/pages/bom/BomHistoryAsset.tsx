import { useEffect, useRef, useState } from 'react';
import type { BomItemAssetView } from '../../data/client';
import { CopyButton } from '../../components/CopyButton';
import { BomAssetPreview } from './BomAssetPreview';
import { isBomMockEnabled } from './bom-mock';

export function HistoryCopy({ value, label }: { value: string; label: string }) {
  const [message, setMessage] = useState('');
  return <><CopyButton label={label} onClick={() => { void navigator.clipboard?.writeText(value).then(() => setMessage('已复制')).catch(() => setMessage('复制失败，请手动选择文本')); if (!navigator.clipboard) setMessage('复制不可用，请手动选择文本'); }} /><small role="status">{message}</small></>;
}
const errors: Record<string, string> = {
  ASSET_NOT_FOUND: '附件记录不存在，或文件缺失／不可读取',
  ASSET_PATH_INVALID: '附件路径无效',
  ASSET_CONTENT_INVALID: '附件内容校验失败，不能确认原始文件',
  ASSET_TYPE_INVALID: '附件格式不支持预览',
  ASSET_TOO_LARGE: '附件超过预览大小限制',
};
export function BomHistoryAsset({ asset, onOpen, previewOnly }: { asset: BomItemAssetView; onOpen(id: number): void; previewOnly: boolean }) {
  const mock = isBomMockEnabled();
  const [state, setState] = useState({ available: false, failed: false, label: '正在核验附件…' });
  const alive = useRef(true), request = useRef<AbortController | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; request.current?.abort(); }; }, []);
  const url = `/api/boms/assets/${asset.assetId}/preview`;
  const diagnose = async () => {
    setState({ available: false, failed: true, label: '预览失败，正在核验文件状态…' });
    const controller = new AbortController(); request.current?.abort(); request.current = controller;
    try {
      const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
      if (!alive.current || controller.signal.aborted) return;
      if (response.ok) { await response.body?.cancel(); if (alive.current && !controller.signal.aborted) setState({ available: true, failed: true, label: '文件已读取；上次预览未成功' }); return; }
      const payload = await response.json();
      if (alive.current && !controller.signal.aborted) setState({ available: false, failed: true, label: errors[payload?.error?.code] ?? errors[payload?.code] ?? `附件状态核验失败（HTTP ${response.status}）` });
    } catch { if (alive.current && !controller.signal.aborted) setState({ available: false, failed: true, label: '无法核验附件状态，请重试；未确认文件缺失' }); }
  };
  return <div className="bom-history-asset">
    <strong>{asset.originalFileName}</strong>{(asset.inherited || asset.inheritedFromBomItemAssetId) ? <small>沿用历史关联</small> : null}
    {mock ? <><BomAssetPreview assetId={asset.assetId} name={asset.originalFileName} /><small>开发示意，未核验磁盘文件</small></> : <>
      {!state.failed && <img src={url} alt={asset.originalFileName} loading="lazy" onLoad={() => { if (alive.current) setState({ available: true, failed: false, label: '文件存在 · 预览可用' }); }} onError={() => void diagnose()} />}
      <small role="status">{state.label}</small>
      {state.failed && <button type="button" className="text-button" onClick={() => { request.current?.abort(); setState({ available: false, failed: false, label: '正在重新核验并预览附件…' }); }}>重试预览</button>}
    </>}
    <button type="button" className="text-button" disabled={previewOnly || mock || !state.available} aria-label={`打开附件位置 ${asset.originalFileName}`} onClick={() => onOpen(asset.assetId)}>打开位置</button>
    <details><summary>查看完整路径</summary><span>{asset.relativePath}</span><HistoryCopy value={asset.relativePath} label={`复制附件路径 ${asset.originalFileName}`} /></details>
  </div>;
}
