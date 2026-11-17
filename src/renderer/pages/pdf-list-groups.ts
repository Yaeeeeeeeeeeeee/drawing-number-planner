import type {PdfFileView} from '../data/client';
import {isMaterialPdfPath,isSourcePdfPath} from '../../core/files/material-directory-policy';

export interface PdfFileGroup { key:string; code:string; files:PdfFileView[] }
/** Only known loaded files are grouped; an unassociated file has no safe group identity. */
export function groupPdfFiles(files:PdfFileView[]):PdfFileGroup[] {
  const groups = new Map<string,PdfFileGroup>();
  for (const file of files) {
    const code=file.fullCode || file.historicalFullCode;
    // A missing filename marker in03 must not merge a production instance into02.
    const directory=isSourcePdfPath(file.relativePath)?'source':isMaterialPdfPath(file.relativePath)?'production':'legacy';
    const key=code ? JSON.stringify([file.productId,code,directory,file.conversionType]) : `file:${file.id}`;
    const group=groups.get(key);
    if(group) group.files.push(file); else groups.set(key,{key,code:code??'',files:[file]});
  }
  return [...groups.values()];
}
