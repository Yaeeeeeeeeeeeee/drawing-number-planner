import {describe,it,expect,vi} from 'vitest';
import {createRequire} from 'node:module';
import {mkdtempSync,writeFileSync,mkdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const require=createRequire(import.meta.url);
describe('trial directory safety',()=>{
 it('reuses the same trial for recovery and relocates material paths',()=>{
  const sample=mkdtempSync(join(tmpdir(),'planner-second-acceptance-preview-'));
  mkdirSync(join(sample,'materials'));writeFileSync(join(sample,'planner.db'),'fixture');
  writeFileSync(join(sample,'settings.json'),JSON.stringify({workspaceRoot:join(sample,'materials')}));
  const {prepareTrial}=require('../../scripts/prepare-trial.cjs');
  const env:Record<string,string>={PLANNER_TRIAL_SAMPLE:sample};
  const first=prepareTrial(env);writeFileSync(join(first,'planner.db'),'changed trial');
  const second=prepareTrial(env);
  expect(second).toBe(first);expect(readFileSync(join(second,'planner.db'),'utf8')).toBe('changed trial');
  const settings=JSON.parse(readFileSync(join(second,'settings.json'),'utf8'));
  expect(settings.workspaceRoot).toBe(join(first,'materials'));
  expect(settings.outboundOutputRoot).toBe(join(first,'outbound'));
 });
 it('rejects a material directory outside the isolated sample',()=>{
  const sample=mkdtempSync(join(tmpdir(),'planner-second-acceptance-preview-'));
  writeFileSync(join(sample,'planner.db'),'fixture');writeFileSync(join(sample,'settings.json'),JSON.stringify({workspaceRoot:'C:/real-materials'}));
  const {prepareTrial}=require('../../scripts/prepare-trial.cjs');
  expect(()=>prepareTrial({PLANNER_TRIAL_SAMPLE:sample})).toThrow(/outside/);
 });
});
