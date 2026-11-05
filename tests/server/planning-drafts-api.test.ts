import Fastify from 'fastify';
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect,it} from 'vitest';
import {PlanningDraftStore} from '../../src/core/planning/planning-draft-store';
import {PlanningService} from '../../src/core/planning/planning-service';
import {registerPlanningRoutes} from '../../src/server/routes/planning';
import {openDatabase} from '../../src/db/database';
it('saves and restores incomplete drafts with revision conflicts and independent modes',async()=>{
 const db=openDatabase(':memory:'),app=Fastify(),path=join(mkdtempSync(join(tmpdir(),'planning-draft-api-')),'planning-drafts.json');
 registerPlanningRoutes(app,new PlanningService(db),new PlanningDraftStore(path));
 try{
  expect((await app.inject({method:'GET',url:'/api/planning/drafts/new'})).json()).toEqual({draft:null,revision:0});
  const input={step:3,groups:[{productId:1,rows:[{clientId:'draft',shareWhite:true}]}]};
  const saved=await app.inject({method:'PUT',url:'/api/planning/drafts/new',payload:{input,expectedRevision:0}});
  expect(saved.statusCode).toBe(200);expect(saved.json().draft).toMatchObject({revision:1,requiresCheck:true,input});
  const stale=await app.inject({method:'PUT',url:'/api/planning/drafts/new',payload:{input,expectedRevision:0}});
  expect(stale.statusCode).toBe(409);expect(stale.json().error.code).toBe('DRAFT_STALE');
  expect((await app.inject({method:'GET',url:'/api/planning/drafts/batch'})).json()).toEqual({draft:null,revision:0});
  const deleted=await app.inject({method:'DELETE',url:'/api/planning/drafts/new',payload:{expectedRevision:1}});
  expect(deleted.json()).toEqual({deleted:true,revision:2});expect((await app.inject({method:'GET',url:'/api/planning/drafts/new'})).json()).toEqual({draft:null,revision:2});
  expect((await app.inject({method:'PUT',url:'/api/planning/drafts/new',payload:{input}})).statusCode).toBe(409);
  expect(readFileSync(path,'utf8')).not.toContain('draft"');
  expect((await app.inject({method:'PUT',url:'/api/planning/drafts/new',payload:{input,expectedRevision:2}})).statusCode).toBe(200);
 }finally{await app.close();db.close();}
});
