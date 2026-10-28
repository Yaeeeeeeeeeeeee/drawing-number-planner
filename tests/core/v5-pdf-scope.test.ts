import { describe,it,expect } from 'vitest';
import { isProductionChangeDirectory, isMaterialPdfPath } from '../../src/core/files/directory-policy';
const production='03.量产后的变更文件（已量产的产品看最新日期）';
const excluded=['03.量产后的变更文件','03.量产后的变更明细','03.量产后的变更文件(已量产的产品看最新日期)','03.量产后的变更明细（已量产的产品看最新日期）','03.量产后的变更明细(已量产的产品看最新日期)','03.量产后的变更文件备份'];
describe('V5.2 material directory boundary',()=>{
 it('limits fresh scans to the exact annotated production directory',()=>{
  expect(isProductionChangeDirectory(production)).toBe(true);
  for(const directory of excluded)expect(isProductionChangeDirectory(directory)).toBe(false);
 });
 it('requires the material directory immediately under the product',()=>{
  expect(isMaterialPdfPath('类别/SKU-型号/02.未转曲源文件/nested/a.pdf')).toBe(true);
  expect(isMaterialPdfPath(`类别/SKU-型号/${production}/首批大货/a.pdf`)).toBe(true);
  for(const path of ['类别/SKU-型号/a.pdf','类别/SKU-型号/其他/02.未转曲源文件/a.pdf',...excluded.map(directory=>`类别/SKU-型号/${directory}/首批大货/a.pdf`)])expect(isMaterialPdfPath(path)).toBe(false);
 });
});
it('scans source and every historical production batch while leaving excluded disk files intact',async()=>{
 const {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const {scanPdfWorkspace}=await import('../../src/core/files/pdf-scanner');
 const root=mkdtempSync(join(tmpdir(),'v52-material-scope-'));
 const paths=['类/SKU-M/root.pdf','类/SKU-M/02.未转曲源文件/direct.pdf','类/SKU-M/02.未转曲源文件/nested/source.pdf',...['00.首批大货','01.20240101','02.20261028'].map(batch=>`类/SKU-M/${production}/${batch}/${batch}.pdf`),...excluded.map(directory=>`类/SKU-M/${directory}/01.20260101/excluded.pdf`)];
 try {
  for(const path of paths){const segments=path.split('/');mkdirSync(join(root,...segments.slice(0,-1)),{recursive:true});writeFileSync(join(root,...segments),'%PDF unchanged');}
  const scanned=await scanPdfWorkspace(root);
  expect(scanned.map(file=>file.fileName).sort()).toEqual(['00.首批大货.pdf','01.20240101.pdf','02.20261028.pdf','direct.pdf','source.pdf']);
  for(const path of paths)expect(readFileSync(join(root,...path.split('/')),'utf8')).toBe('%PDF unchanged');
 }finally{rmSync(root,{recursive:true,force:true});}
});
it('uses the same exact directory scope in SQLite and the filesystem scanner',async()=>{
 const {MATERIAL_DIRECTORIES}=await import('../../src/core/files/material-directory-policy');
 const {materialDirectoryScopeSql}=await import('../../src/core/files/material-directory-sql');
 const {openDatabase}=await import('../../src/db/database');const db=openDatabase(':memory:');
 try{
  for(const directory of [...MATERIAL_DIRECTORIES,...excluded,'02.未转曲源文件备份','无关资料'])for(const separator of ['/',String.fromCharCode(92)]){
   const path=['冰柜','SKDZU070JP-ZU70SD',directory,'00.首批大货','a.pdf'].join(separator);
   expect(db.prepare(`select ${materialDirectoryScopeSql('@path')} as accepted`).get({path})).toEqual({accepted:isMaterialPdfPath(path)?1:0});
  }
 }finally{db.close();}
});
