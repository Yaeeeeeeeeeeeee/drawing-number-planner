import {expect,it,vi} from 'vitest';
import {createOpenPdfHandler} from '../../src/main/open-file-location';
it('opens only a resolved PDF from the trusted main frame and reports shell errors',async()=>{
 const resolve=vi.fn(()=>'/validated/file.pdf'),open=vi.fn(async()=>''),handler=createOpenPdfHandler({isTrustedEvent:event=>event==='trusted',resolvePdfFilePath:resolve,openPath:open});
 expect((await handler('untrusted',1)).ok).toBe(false);expect(resolve).not.toHaveBeenCalled();
 expect(await handler('trusted',1)).toEqual({ok:true});expect(open).toHaveBeenCalledWith('/validated/file.pdf');
 open.mockResolvedValueOnce('No application');expect(await handler('trusted',1)).toMatchObject({ok:false,error:{message:'No application'}});
 expect((await handler('trusted','/arbitrary.pdf')).ok).toBe(false);
});
