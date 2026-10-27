import { describe,it,expect } from 'vitest';
import { isProductionChangeDirectory, isMaterialPdfPath } from '../../src/core/files/directory-policy';
describe('V5 material directory boundary',()=>{
 it('recognizes bounded production directory aliases and their known explanatory suffix',()=>{
 expect(isProductionChangeDirectory('03.量产后的变更文件')).toBe(true);
 expect(isProductionChangeDirectory('03.量产后的变更明细')).toBe(true);
 expect(isProductionChangeDirectory('03.量产后的变更文件（已量产的产品看最新日期）')).toBe(true);
 expect(isProductionChangeDirectory('03.量产后的变更文件(已量产的产品看最新日期)')).toBe(true);
 expect(isProductionChangeDirectory('03.量产后的变更文件备份')).toBe(false);
 });
 it('requires the material directory immediately under the product',()=>{
 expect(isMaterialPdfPath('类别/SKU-型号/02.未转曲源文件/nested/a.pdf')).toBe(true);
 expect(isMaterialPdfPath('类别/SKU-型号/03.量产后的变更文件/首批大货/a.pdf')).toBe(true);
 for(const path of ['类别/SKU-型号/a.pdf','类别/SKU-型号/其他/02.未转曲源文件/a.pdf','类别/SKU-型号/03.量产后的变更文件备份/首批大货/a.pdf'])expect(isMaterialPdfPath(path)).toBe(false);
 });
});

it('scans both exact material trees and excludes root and lookalike directories while retaining historical production names',async()=>{
 const {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const {scanPdfWorkspace}=await import('../../src/core/files/pdf-scanner');
 const root=mkdtempSync(join(tmpdir(),'v5-material-scope-'));
 const paths=['类/SKU-M/root.pdf','类/SKU-M/02.未转曲源文件/nested/source.pdf','类/SKU-M/03.量产后的变更文件/首批大货/outlined.pdf','类/SKU-M/03.量产后的变更明细/01.20260101/legacy.pdf','类/SKU-M/03.量产后的变更文件备份/01.20260101/copy.pdf'];
 try {
  for(const path of paths){const segments=path.split('/');mkdirSync(join(root,...segments.slice(0,-1)),{recursive:true});writeFileSync(join(root,...segments),'%PDF unchanged');}
  const scanned=await scanPdfWorkspace(root);
  expect(scanned.map(file=>file.fileName).sort()).toEqual(['legacy.pdf','outlined.pdf','source.pdf']);
  for(const path of paths)expect(readFileSync(join(root,...path.split('/')),'utf8')).toBe('%PDF unchanged');
 }finally{rmSync(root,{recursive:true,force:true});}
});

it('uses the same bounded directory scope in SQLite as in the filesystem scanner',async()=>{
 const {MATERIAL_DIRECTORIES}=await import('../../src/core/files/material-directory-policy');
 const {materialDirectoryScopeSql}=await import('../../src/core/files/material-directory-sql');
 const {openDatabase}=await import('../../src/db/database');const db=openDatabase(':memory:');
 try{
  for(const directory of [...MATERIAL_DIRECTORIES,'03.量产后的变更文件备份','02.未转曲源文件备份','无关资料'])for(const separator of ['/',String.fromCharCode(92)]){
   const path=['冰柜','SKDZU070JP-ZU70SD',directory,'00.首批大货','a.pdf'].join(separator);
   expect(db.prepare(`select ${materialDirectoryScopeSql('@path')} as accepted`).get({path})).toEqual({accepted:isMaterialPdfPath(path)?1:0});
  }
 }finally{db.close();}
});
