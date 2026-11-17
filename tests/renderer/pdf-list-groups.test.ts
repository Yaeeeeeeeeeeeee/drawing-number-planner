import {describe,it,expect} from 'vitest';
import {groupPdfFiles} from '../../src/renderer/pages/pdf-list-groups';
import type {PdfFileView} from '../../src/renderer/data/client';
const file=(id:number, extra:Partial<PdfFileView>={}):PdfFileView=>({id,fileName:`${id}.pdf`,relativePath:`03/${id}.pdf`,fullCode:'ABC-01',historicalFullCode:null,productId:1,conversionType:'outlined',isPresent:true,...extra} as PdfFileView);
describe('PDF list groups',()=>{
 it('groups only the same complete code, product and conversion role',()=>{
  const groups=groupPdfFiles([file(1),file(2),file(3,{productId:2}),file(4,{conversionType:'source'}),file(5,{fullCode:null})]);
  expect(groups.map(g=>g.files.map(f=>f.id))).toEqual([[1,2],[3],[4],[5]]);
 });
 it('uses historical codes and leaves unrelated unassociated files separate',()=>{
  const groups=groupPdfFiles([file(1,{fullCode:null,historicalFullCode:'OLD'}),file(2,{fullCode:'OLD'}),file(3,{fullCode:null}),file(4,{fullCode:null})]);
  expect(groups.map(g=>g.files.map(f=>f.id))).toEqual([[1,2],[3],[4]]);
 });
});
