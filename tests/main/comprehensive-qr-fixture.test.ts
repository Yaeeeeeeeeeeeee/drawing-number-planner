// @vitest-environment node
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {expect,it} from 'vitest';
import {openDatabase} from '../../src/db/database';
import {migrateDatabase} from '../../src/db/migrations';
import {QrManualService} from '../../src/core/qr/qr-manual-service';

it('native v15 verification fixture permits a new shared Warranty PDF without changing original User Manual QR7',()=>{
 const root=mkdtempSync(join(tmpdir(),'native-qr-v3-'));
 try{
  const legacy=join(root,'legacy'),bundle=join(root,'database-verifier.mjs');
  execFileSync(process.execPath,[resolve('scripts/build-comprehensive-verifier.mjs'),resolve('.'),bundle]);
  execFileSync(process.execPath,[bundle,'prepare',legacy],{env:{...process.env,NODE_PATH:resolve('node_modules')}});
  const db=openDatabase(join(legacy,'planner.db'));
  try{
   migrateDatabase(db,{databaseExists:true,createBackup:()=>undefined});
   const original=db.prepare('select * from product_qr_codes where id=7').get();
   expect(original).toMatchObject({product_id:5,purpose_id:1,name:'原QR',status:'active',appearance_version_id:null});
   const purpose=db.prepare("select * from qr_purposes where key='warranty'").get() as {id:number;english_name:string;status:string};
   expect(purpose).toMatchObject({english_name:'Warranty',status:'active'});
   expect(db.prepare('select id from product_qr_codes where product_id=5 and purpose_id=? and appearance_version_id is null').get(purpose.id)).toBeUndefined();
   const file=join(root,'M1-warranty (qagp85g).pdf');
   writeFileSync(file,'%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
   const bytes=readFileSync(file),service=new QrManualService(db),selected=service.selectTrustedFile(file);
   const preview=service.preview({token:selected.token,productId:5,purposeId:purpose.id,name:'Windows原生手动售后卡',targetUrl:'https://qrs.ly/qagp85g',appearanceVersionId:null});
   expect(preview.issues).toEqual([]);const code=service.commit(preview.previewId);
   expect(code).toMatchObject({productId:5,purposeId:purpose.id,appearanceVersionId:null,status:'inactive',targetUrl:'https://qrs.ly/qagp85g'});
   expect(code.files[0].fileName).toBe('M1-warranty (qagp85g).pdf');expect(readFileSync(file)).toEqual(bytes);
   expect(db.prepare('select * from product_qr_codes where id=7').get()).toEqual(original);
   expect(db.prepare('select event from qr_manual_audit where qr_code_id=?').all(code.id)).toEqual([{event:'link'}]);
  }finally{db.close();}
 }finally{rmSync(root,{recursive:true,force:true});}
},20000);
