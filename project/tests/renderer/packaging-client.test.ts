import { describe, expect, it, vi } from 'vitest';
import { createPackagingApi } from '../../src/renderer/data/packaging-client';

describe('packaging API transport',()=>{
  it('uploads the original AIT with structured metadata and replaces via a separate asset endpoint',async()=>{
    const request=vi.fn().mockResolvedValue({id:9});const api=createPackagingApi(request);const file=new File(['AIT data'],'铭牌.ait');
    const metadata={name:'铭牌',mainCategoryId:1,projectItemId:2,brandIds:[3],productIds:[7],fields:[{objectName:'DRAWING_NO',sourceKey:'DRAWING_NO',required:true}],requiredFonts:['ArialMT'],status:'active' as const};
    await api.createTemplate(metadata,file);
    const [path,init]=request.mock.calls[0];expect(path).toBe('/api/packaging/templates');expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);expect(JSON.parse(init.body.get('metadata'))).toEqual(metadata);expect(init.body.get('file')).toBe(file);expect(init.headers).toBeUndefined();
    await api.replaceTemplateFile(9,file);expect(request.mock.calls[1][0]).toBe('/api/packaging/templates/9/file');expect(request.mock.calls[1][1].body.get('file')).toBe(file);
    await api.replaceTemplateFile(9,file,metadata);expect(JSON.parse(request.mock.calls[2][1].body.get('metadata'))).toEqual(metadata);
    expect(api.itemBackupUrl('task 1',5)).toBe('/api/packaging/tasks/task%201/items/5/backup');
    await api.scanProduct(7);expect(request.mock.calls[3][0]).toBe('/api/packaging/scan-product');expect(JSON.parse(request.mock.calls[3][1].body)).toEqual({productId:7});
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
