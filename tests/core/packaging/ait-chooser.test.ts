// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { createAitChooser } from '../../../src/main/ait-chooser';
it('rejects untrusted renderer frames and registers only native chooser paths',async()=>{const choose=vi.fn().mockResolvedValue('/original.ait'),select=vi.fn().mockResolvedValue({token:'cap'});const handler=createAitChooser({isTrustedEvent:e=>e==='trusted',choose,select});await expect(handler('untrusted')).rejects.toThrow('UNTRUSTED_AIT_SENDER');expect(choose).not.toHaveBeenCalled();expect(await handler('trusted')).toEqual({token:'cap'});expect(select).toHaveBeenCalledWith('/original.ait');choose.mockResolvedValue(null);expect(await handler('trusted')).toBeNull();expect(select).toHaveBeenCalledTimes(1);});

it('accepts a dropped AIT only from the trusted desktop frame',async()=>{
 const select=vi.fn().mockResolvedValue({token:'drop'});
 const handler=createAitChooser({isTrustedEvent:event=>event==='trusted',choose:async()=>null,select});
 await expect(handler.drop('untrusted','/original.ait')).rejects.toThrow('UNTRUSTED_AIT_SENDER');
 await expect(handler.drop('trusted','/original.pdf')).rejects.toThrow();
 expect(select).not.toHaveBeenCalled();
 await expect(handler.drop('trusted','/original.AIT')).resolves.toEqual({token:'drop'});
 expect(select).toHaveBeenCalledWith('/original.AIT');
});
