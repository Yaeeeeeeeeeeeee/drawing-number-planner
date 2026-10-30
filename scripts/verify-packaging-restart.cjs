const assert=require('node:assert/strict');
/** Startup catchup may append scoped scan observations, never change business facts. */
module.exports=function verifyRestart(before,after,{pdfIndexIds,productDirectory}){
 const owned=new Set(pdfIndexIds),normalize=value=>value.replaceAll('\\','/');
 assert.deepEqual(Object.keys(after),Object.keys(before));
 for(const [table,rows]of Object.entries(before)){
  if(['file_scan_runs','file_scan_changes'].includes(table)){
   for(const row of rows)assert.ok(after[table].some(candidate=>Object.keys(row).every(key=>candidate[key]===row[key])),`Historical row changed in ${table}`);
   continue;
  }
  const business=records=>records.map(row=>{if(table==='pdf_files'&&owned.has(row.id)){const {scanned_at,last_seen_scan_run_id,...facts}=row;return facts;}return row;});
  assert.deepEqual(business(after[table]),business(rows),`Restart changed protected ${table} facts`);
 }
 const newScans=after.file_scan_runs.filter(row=>!before.file_scan_runs.some(prior=>prior.id===row.id));
 for(const scan of newScans){assert.equal(scan.scope_kind,'products');assert.deepEqual(JSON.parse(scan.scope_directories_json).map(normalize),[normalize(productDirectory)]);}
 for(const change of after.file_scan_changes.filter(row=>!before.file_scan_changes.some(prior=>prior.id===row.id))){assert.ok(newScans.some(scan=>scan.id===change.scan_run_id));assert.equal(change.index_kind,'pdf');assert.ok(owned.has(change.file_index_id));assert.equal(change.change_type,'unchanged');}
};
