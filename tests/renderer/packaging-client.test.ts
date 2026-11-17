import { describe, expect, it, vi } from 'vitest';
import { createPackagingApi } from '../../src/renderer/data/packaging-client';

describe('packaging API transport',()=>{
  it('sends native selection capabilities for saving and inspection',async()=>{
    const request=vi.fn().mockResolvedValue({id:9});const api=createPackagingApi(request);
    const metadata={name:'铭牌',mainCategoryId:1,projectItemId:2,brandIds:[],productIds:[],fields:[],requiredFonts:[],status:'active' as const};
    await api.saveTemplateReference(metadata,'selection',9);expect(request.mock.calls[0][0]).toBe('/api/packaging/template-reference');expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({metadata,token:'selection',id:9});
    await api.inspectTemplateReference('selection',[],[]);expect(request.mock.calls[1][0]).toBe('/api/packaging/inspect-template-reference');
    expect(api.itemBackupUrl('task 1',5)).toBe('/api/packaging/tasks/task%201/items/5/backup');
    await api.scanProduct(7);expect(JSON.parse(request.mock.calls[2][1].body)).toEqual({productId:7});
  });
  it('sends exact source selection, review hash and explicit archive confirmation',async()=>{
    const request=vi.fn().mockResolvedValue({});const api=createPackagingApi(request);
    await api.createTask({productId:7,name:'修改',type:'modify',productDirectory:'冰柜/T40',drawings:[{origin:'historical',id:22,sourcePdfFileId:88}]});
    expect(JSON.parse(request.mock.calls[0][1].body).drawings).toEqual([{origin:'historical',id:22,sourcePdfFileId:88}]);
    await api.reviewItem('task 1',5,'current-sha');expect(request.mock.calls[1][0]).toBe('/api/packaging/tasks/task%201/items/5/review');expect(JSON.parse(request.mock.calls[1][1].body)).toEqual({sha256:'current-sha'});
    await api.archive('task 1');expect(JSON.parse(request.mock.calls[2][1].body)).toEqual({confirmed:true});
  });
  it('unwraps actual task and product directory lists from the service',async()=>{
    const request=vi.fn().mockResolvedValue({items:[{id:'persisted-task'}]});const api=createPackagingApi(request);
    expect(await api.listTasks(7)).toEqual([{id:'persisted-task'}]);expect(request.mock.calls[0][0]).toBe('/api/packaging/tasks?productId=7');
    request.mockResolvedValue({items:[{productId:7,relativePath:'T40',exists:true}]});expect(await api.getProductDirectories(7)).toEqual([{productId:7,relativePath:'T40',exists:true}]);
  });
});
