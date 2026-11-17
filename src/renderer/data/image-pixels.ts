export interface DecodedImagePixels { width:number; height:number; data:Uint8ClampedArray }
export type PixelComparison = 'equal' | 'different' | 'unavailable';

/** Exact original-size canvas RGBA; no scaling, perceptual threshold or file-name inference. */
export function equalImagePixels(a:DecodedImagePixels,b:DecodedImagePixels):boolean {
  for(const image of [a,b])if(!image.width||!image.height||image.data.length!==image.width*image.height*4)throw new Error('图片像素数据不完整');
  if(a.width!==b.width||a.height!==b.height)return false;
  return a.data.every((value,index)=>value===b.data[index]);
}

export async function decodeImagePixels(url:string,signal?:AbortSignal):Promise<DecodedImagePixels> {
  const response=await fetch(url,{signal,cache:'no-store'});
  if(!response.ok)throw new Error(`图片无法读取（HTTP ${response.status}），不能确认像素内容`);
  const bitmap=await createImageBitmap(await response.blob());
  try{
    signal?.throwIfAborted();
    const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
    const context=canvas.getContext('2d',{willReadFrequently:true,colorSpace:'srgb'});
    if(!context)throw new Error('当前环境无法比较图片像素');
    context.drawImage(bitmap,0,0);
    return {width:bitmap.width,height:bitmap.height,data:context.getImageData(0,0,bitmap.width,bitmap.height).data};
  }finally{bitmap.close();}
}
