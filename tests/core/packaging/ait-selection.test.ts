// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { AitSelections } from '../../../src/core/packaging/ait-selections';
it('only resolves a native-issued selection while the service instance lives and checks content changes',()=>{
 const dir=mkdtempSync(join(tmpdir(),'ait-selection-'));try{const path=join(dir,'source.ait');writeFileSync(path,'original');const selections=new AitSelections();const selection=selections.selectTrusted(path);expect(selections.resolve(selection.token)).toBe(path);expect(()=>new AitSelections().resolve(selection.token)).toThrow();expect(()=>selections.resolve(path)).toThrow();writeFileSync(path,'changed');expect(()=>selections.resolve(selection.token)).toThrow();}finally{rmSync(dir,{recursive:true,force:true});}
});
