import {expect,it} from 'vitest';
import {selectLatestBusinessBatch,codeScopeFromFullCode} from '../../src/core/files/batch-business-order';
it('uses complete business order, rejects ties and never guesses missing chronology',()=>{
 expect(selectLatestBusinessBatch([{id:1,sequenceNumber:null,businessDate:'2025-01-01'},{id:2,sequenceNumber:null,businessDate:'2026-01-01'}])).toEqual({status:'selected',batchId:2});
 expect(selectLatestBusinessBatch([{id:1,sequenceNumber:2,businessDate:null},{id:2,sequenceNumber:2,businessDate:null}])).toEqual({status:'indeterminate',batchId:null});
 expect(selectLatestBusinessBatch([{id:1,sequenceNumber:null,businessDate:null},{id:2,sequenceNumber:2,businessDate:'2026-01-01'}])).toEqual({status:'none',batchId:null});
 expect(codeScopeFromFullCode('02.0209.010.0401001')).toBe('02:0209:01');
 expect(codeScopeFromFullCode('02.0209.020.0401001')).toBe('02:0209:02');
});
