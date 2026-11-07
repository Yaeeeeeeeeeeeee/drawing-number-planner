// @vitest-environment node
import {createRequire} from 'node:module';
import {expect,it} from 'vitest';
const verify=createRequire(import.meta.url)('../../scripts/verify-packaging-restart.cjs');
function fixture(){const before={pdf_files:[{id:9,relative_path:'category/product/02/file.pdf',drawing_id:7,content_sha256:'current',is_present:1,scanned_at:'before',last_seen_scan_run_id:1},{id:10,relative_path:'other/file.pdf',scanned_at:'original'}],drawing_numbers:[{id:7,status:'reserved'}],packaging_tasks:[{id:'task',state:'active'}],file_scan_runs:[{id:1,scope_kind:'products',scope_directories_json:'["category/product"]'}],file_scan_changes:[]};const after=structuredClone(before) as any;after.pdf_files[0].scanned_at='after';after.pdf_files[0].last_seen_scan_run_id=2;after.file_scan_runs.push({id:2,scope_kind:'products',scope_directories_json:'["category/product"]'});after.file_scan_changes.push({id:1,scan_run_id:2,index_kind:'pdf',file_index_id:9,change_type:'unchanged'});return{before,after,scope:{pdfIndexIds:[9],productDirectory:'category\\product'}};}
it('allows only real PDF scan observation fields for explicitly known index IDs without assuming a product_id column',()=>{const f=fixture();expect(()=>verify(f.before,f.after,f.scope)).not.toThrow();});
it('accepts independently declared active product scopes without allowing a third undeclared directory',()=>{
 const f=fixture();f.after.file_scan_runs.push({id:3,scope_kind:'products',scope_directories_json:'["other/product"]'});
 const scope={...f.scope,productDirectories:[f.scope.productDirectory,'other/product']};expect(()=>verify(f.before,f.after,scope)).not.toThrow();
 f.after.file_scan_runs[2].scope_directories_json='["unowned/product"]';expect(()=>verify(f.before,f.after,scope)).toThrow();
});
it('allows only observation timestamps on batches of declared directories and protects batch ownership',()=>{
 const f=fixture();(f.before as any).material_batches=[{id:4,product_directory:'category/product',product_id:3,name:'首批',last_seen_at:'before',last_seen_scan_run_id:1}];
 f.after.material_batches=[{...((f.before as any).material_batches[0]),last_seen_at:'after',last_seen_scan_run_id:2}];
 expect(()=>verify(f.before,f.after,f.scope)).not.toThrow();f.after.material_batches[0].product_id=99;expect(()=>verify(f.before,f.after,f.scope)).toThrow('protected');
});
it.each(['content','ownership','other-file','task'])('rejects %s changes while allowing scoped catchup observations',kind=>{const f=fixture();if(kind==='content')f.after.pdf_files[0].content_sha256='changed';if(kind==='ownership')f.after.pdf_files[0].drawing_id=8;if(kind==='other-file')f.after.pdf_files[1].scanned_at='changed';if(kind==='task')f.after.packaging_tasks[0].state='completed';expect(()=>verify(f.before,f.after,f.scope)).toThrow(/protected/);});
it.each(['scope','old-scan','new-file-change'])('rejects %s outside the declared unchanged product observation',kind=>{const f=fixture();if(kind==='scope')f.after.file_scan_runs[1].scope_directories_json='["other/product"]';if(kind==='old-scan')f.after.file_scan_runs[0].scope_kind='workspace';if(kind==='new-file-change')f.after.file_scan_changes[0].file_index_id=10;expect(()=>verify(f.before,f.after,f.scope)).toThrow();});
it('permits last-seen observation only for historical numbers referenced by declared scoped PDF indices',()=>{
 const f=fixture();(f.before.pdf_files[0] as any).historical_drawing_id=21;f.after.pdf_files[0].historical_drawing_id=21;
 (f.before as any).historical_drawing_numbers=[{id:21,full_code:'02.0001.010.0101001',product_id:3,first_seen_at:'original',last_seen_at:'before'},{id:22,full_code:'02.0001.010.0101002',last_seen_at:'original'}];
 f.after.historical_drawing_numbers=structuredClone((f.before as any).historical_drawing_numbers);f.after.historical_drawing_numbers[0].last_seen_at='after';
 expect(()=>verify(f.before,f.after,f.scope)).not.toThrow();
 for(const key of ['full_code','product_id','first_seen_at']){const changed=structuredClone(f.after);changed.historical_drawing_numbers[0][key]='changed';expect(()=>verify(f.before,changed,f.scope)).toThrow('protected');}
 f.after.historical_drawing_numbers[1].last_seen_at='changed';expect(()=>verify(f.before,f.after,f.scope)).toThrow('protected');
});
it('does not grant historical timestamp permission through an index outside the declared product directory',()=>{
 const f=fixture();(f.before.pdf_files[1] as any).historical_drawing_id=22;f.after.pdf_files[1].historical_drawing_id=22;
 (f.before as any).historical_drawing_numbers=[{id:22,last_seen_at:'before'}];f.after.historical_drawing_numbers=[{id:22,last_seen_at:'after'}];
 expect(()=>verify(f.before,f.after,{...f.scope,pdfIndexIds:[9,10]})).toThrow('protected');
});
