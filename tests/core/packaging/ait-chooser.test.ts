// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { createAitChooser } from '../../../src/main/ait-chooser';
it('rejects untrusted renderer frames and registers only native chooser paths',async()=>{const choose=vi.fn().mockResolvedValue('/original.ait'),select=vi.fn().mockResolvedValue({token:'cap'});const handler=createAitChooser({isTrustedEvent:e=>e==='trusted',choose,select});await expect(handler('untrusted')).rejects.toThrow('UNTRUSTED_AIT_SENDER');expect(choose).not.toHaveBeenCalled();expect(await handler('trusted')).toEqual({token:'cap'});expect(select).toHaveBeenCalledWith('/original.ait');choose.mockResolvedValue(null);expect(await handler('trusted')).toBeNull();expect(select).toHaveBeenCalledTimes(1);});
