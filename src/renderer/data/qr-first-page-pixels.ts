import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {equalImagePixels,type DecodedImagePixels} from './image-pixels';

/** PDF.js 5.4.624: first page, scale 1 (72 dpi), intrinsic rotation and crop box,
 * ceil viewport dimensions, sRGB RGBA on opaque white. Never fit/zoom, use DPR,
 * decode QR content, compare later pages, or apply a perceptual tolerance. */
export async function decodeQrFirstPagePixels(base64:string,signal?:AbortSignal):Promise<DecodedImagePixels> {
 signal?.throwIfAborted();
 const {getDocument,GlobalWorkerOptions,AnnotationMode}=await import('pdfjs-dist');
 GlobalWorkerOptions.workerSrc=workerUrl;
 signal?.throwIfAborted();
 const data=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
 const assets=new URL('pdfjs/',document.baseURI);
 const loading=getDocument({data,cMapUrl:new URL('cmaps/',assets).href,cMapPacked:true,standardFontDataUrl:new URL('standard_fonts/',assets).href,wasmUrl:new URL('wasm/',assets).href,useSystemFonts:false,isEvalSupported:false,stopAtErrors:true});
 const abort=()=>{void loading.destroy();};signal?.addEventListener('abort',abort,{once:true});
 try {
  const pdf=await loading.promise;signal?.throwIfAborted();const page=await pdf.getPage(1);signal?.throwIfAborted();
  const viewport=page.getViewport({scale:1,rotation:page.rotate});
  const width=Math.ceil(viewport.width),height=Math.ceil(viewport.height);
  // Reject an unrenderable original-size page; reducing it would change the equality rule.
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<=0||height<=0||width>32767||height>32767||width*height>16_777_216)throw new Error('PDF首页尺寸超出像素比较范围');
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const context=canvas.getContext('2d',{willReadFrequently:true,colorSpace:'srgb'});
  if(!context)throw new Error('当前环境无法读取PDF首页像素');
  await page.render({canvas,canvasContext:context,viewport,background:'rgb(255,255,255)',annotationMode:AnnotationMode.ENABLE}).promise;
  signal?.throwIfAborted();
  return {width,height,data:context.getImageData(0,0,width,height).data};
 } finally {signal?.removeEventListener('abort',abort);await loading.destroy();}
}
export async function compareQrFirstPagePixels(selected:string,current:string,signal?:AbortSignal):Promise<'equal'|'different'> {
 const first=await decodeQrFirstPagePixels(selected,signal);
 const previous=await decodeQrFirstPagePixels(current,signal);
 return equalImagePixels(first,previous)?'equal':'different';
}
