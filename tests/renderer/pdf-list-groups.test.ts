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
 it('keeps02 and03 separate even when a production PDF has no outlined filename marker',()=>{
  const source='冰柜/SKDZU070JP-ZU70SD/02.未转曲源文件/';
  const production='冰柜/SKDZU070JP-ZU70SD/03.量产后的变更文件（已量产的产品看最新日期）/';
  const groups=groupPdfFiles([
   file(1,{conversionType:'source',relativePath:source+'铭牌.pdf'}),file(2,{conversionType:'source',relativePath:source+'旧铭牌.pdf'}),
   file(3,{conversionType:'source',relativePath:production+'00.首批大货/铭牌.pdf'}),file(4,{conversionType:'source',relativePath:production+'01.20261117/铭牌.pdf'}),
   file(5,{conversionType:'outlined',relativePath:production+'01.20261117/铭牌（转曲）.pdf'}),
  ]);
  expect(groups.map(g=>g.files.map(f=>f.id))).toEqual([[1,2],[3,4],[5]]);
 });
});
