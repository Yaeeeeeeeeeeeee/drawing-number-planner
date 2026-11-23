const assert=require('node:assert/strict');
// Verification-only: an active-product catchup can legitimately hold the scan lock.
// Retry that explicit contention response; fail immediately on every other error.
module.exports=async function scanFromUi(page){
 const deadline=Date.now()+45000;
 do{
  await page.getByRole('button',{name:'扫描资料库',exact:true}).click();
  const outcome=await page.waitForFunction(()=>{
   const button=[...document.querySelectorAll('button')].find(node=>node.textContent.trim()==='扫描资料库');
   const complete=[...document.querySelectorAll('[role=status] strong')].some(node=>node.textContent.trim()==='资料库扫描完成');
   const failure=[...document.querySelectorAll('[role=alert]')].map(node=>node.textContent).find(text=>text.includes('扫描未完成：'));
   return button&&!button.disabled&&(failure || (complete && 'complete'));
  },undefined,{timeout:45000});
  const errors=await outcome.jsonValue();
  await outcome.dispose();
  if(errors==='complete')return;
  assert.match(errors,/资料库正在扫描，请等待当前扫描完成/u,'Unexpected manual scan failure');
  await page.waitForTimeout(200);
 }while(Date.now()<deadline);
 throw Error('Manual scan could not acquire the scan lock within45 seconds');
};
