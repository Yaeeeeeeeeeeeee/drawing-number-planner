import {useEffect,useState} from 'react';
import type {QrManualApi} from '../data/qr-manual-client';
type Result={previewId:string;label:string};
export function QrPixelComparison({previewId,api}:{previewId:string;api:QrManualApi}) {
 const [result,setResult]=useState<Result|null>(null);
 useEffect(()=>{
  const abort=new AbortController();let current=true;
  void (async()=>{
   let label:string;
   try {
    if(!api.qrManualComparison)throw new Error('请使用支持像素比较的桌面版');
    const source=await api.qrManualComparison(previewId);abort.signal.throwIfAborted();
    if(source.status==='not-compared')label='无当前关联文件，未比较首页像素';
    else if(source.status==='unavailable')throw new Error(source.message);
    else {
     const {compareQrFirstPagePixels}=await import('../data/qr-first-page-pixels');abort.signal.throwIfAborted();
     label=await compareQrFirstPagePixels(source.selectedPdfBase64,source.currentPdfBase64,abort.signal)==='equal'?'首页像素相同':'首页像素不同';
    }
   }catch(error){label=`无法比较首页像素：${error instanceof Error?error.message:'文件无法解码'}`;}
   if(current)setResult({previewId,label});
  })();
  return ()=>{current=false;abort.abort();};
 },[previewId,api.qrManualComparison]);
 return <div className="qr-pixel-comparison"><p role="status">{result?.previewId===previewId?result.label:'正在比较首页像素…'}</p><small>仅比较PDF首页；后续页面不参与。比较结果供核对，仍需手动确认关联。</small></div>;
}
