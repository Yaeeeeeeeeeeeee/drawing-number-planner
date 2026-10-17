import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppShell } from '../../src/renderer/layout/AppShell';
import { createOutboundMockStore, createOutboundReferenceMockApi, isOutboundMockEnabled, mockMaterials, mockProducts } from '../../src/renderer/pages/outbound/outbound-mock';

describe('outbound isolated UI mock',()=>{
  it('is opt-in and denies unimplemented real-service methods',async()=>{
    window.history.replaceState({},'', '/');expect(isOutboundMockEnabled()).toBe(false);
    const api=createOutboundReferenceMockApi();await expect(api.createOutboundPackage({} as never)).rejects.toThrow('禁止真实服务回退');
    await expect(api.listProducts()).rejects.toThrow('禁止真实服务回退');
  });
  it('preserves blockers, 50MB limits and independent historical snapshots',()=>{
    const store=createOutboundMockStore();const before=store.history();
    const bad=mockMaterials('current_complete','exceptions');
    expect(()=>store.generate(bad,bad.filter(row=>row.selectable).map(row=>row.id),mockProducts[0],'current_complete')).toThrow('处理后才能打包');
    const oversized=mockMaterials('change_only','oversize');
    expect(()=>store.generate(oversized,oversized.map(row=>row.id),mockProducts[0],'change_only')).toThrow('单个文件超过50MB');
    const good=mockMaterials('current_complete','normal');
    expect(good.some(row=>row.source==='历史沿用')).toBe(true);
    expect(mockMaterials('change_only','normal').every(row=>row.source==='当前批次')).toBe(true);
    const generated=store.generate(good,good.map(row=>row.id),mockProducts[0],'current_complete');
    expect(generated.parts).toHaveLength(3);expect(generated.parts.every(part=>part.sizeBytes<=50_000_000)).toBe(true);
    good[0].name='changed';generated.items[0].name='mutated';
    expect(store.history().at(-1)).toEqual(before[0]);expect(store.history()[0].items[0].name).not.toBe('mutated');
  });
  it('routes exclusively to Mock and performs package, mail, copy, history and maintenance without real calls',async()=>{
    window.history.replaceState({},'', '/?mock=outbound');
    const real=vi.fn(()=>{throw new Error('real forbidden');});const desktop=vi.fn(()=>{throw new Error('desktop forbidden');});
    window.plannerDesktop=new Proxy({} as never,{get:desktop});
    const fetchSpy=vi.spyOn(globalThis,'fetch');
    const clipboard=vi.fn().mockResolvedValue(undefined);Object.defineProperty(navigator,'clipboard',{value:{writeText:clipboard},configurable:true});
    try {
      render(<AppShell api={new Proxy({} as never,{get:()=>real})}/>);
      expect(screen.getByRole('heading',{name:'外发资料'})).toBeVisible();
      fireEvent.click(screen.getByLabelText('当前完整包材资料'));
      fireEvent.click(screen.getByRole('button',{name:'预览文件'}));
      expect(screen.getAllByText('历史沿用').length).toBeGreaterThan(0);
      fireEvent.click(screen.getByRole('button',{name:'生成压缩包'}));
      await waitFor(()=>expect((screen.getByLabelText('正文') as HTMLTextAreaElement).value).toContain('分包附件'));
      fireEvent.click(screen.getByRole('button',{name:'复制正文'}));await screen.findByText('已复制');expect(clipboard).toHaveBeenCalled();
      fireEvent.click(screen.getAllByRole('button',{name:'打开位置'})[0]);await screen.findByText('Mock：仅模拟打开位置，未调用桌面桥接。');
      fireEvent.click(screen.getByText(/外发历史 ·/));fireEvent.click(screen.getAllByRole('button',{name:'展开明细'})[0]);expect(screen.getByRole('table',{name:'历史文件快照'})).toBeVisible();
      fireEvent.change(screen.getByLabelText('正文'),{target:{value:'人工编辑保留'}});
      fireEvent.click(screen.getByRole('button',{name:'生成压缩包'}));await screen.findByRole('button',{name:'使用新压缩包资料'});expect(screen.getByLabelText('正文')).toHaveValue('人工编辑保留');
      const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);fireEvent.click(screen.getByRole('button',{name:'使用新压缩包资料'}));expect(confirm).toHaveBeenCalled();expect(screen.getByLabelText('正文')).toHaveValue('人工编辑保留');confirm.mockRestore();
      fireEvent.click(screen.getByRole('button',{name:'联系人维护'}));await screen.findAllByRole('cell',{name:'样例供应商'});expect(screen.getByRole('cell',{name:'张工'})).toBeVisible();fireEvent.click(screen.getByRole('button',{name:'停用 张工'}));await screen.findByRole('button',{name:'启用 张工'});
      fireEvent.click(screen.getByRole('button',{name:'返回外发工作'}));fireEvent.click(screen.getByRole('button',{name:'模板与签名'}));await screen.findByRole('button',{name:'编辑模板 包材更新通知'});
      expect(real).not.toHaveBeenCalled();expect(fetchSpy).not.toHaveBeenCalled();expect(desktop).not.toHaveBeenCalled();
    }finally{fetchSpy.mockRestore();delete window.plannerDesktop;window.history.replaceState({},'','/');}
  });
  it('disables exceptional selections and cannot bypass blockers by deselecting',async()=>{
    window.history.replaceState({},'', '/?mock=outbound');
    try{
      render(<AppShell api={{} as never}/>);fireEvent.change(screen.getByLabelText('Mock 场景'),{target:{value:'exceptions'}});fireEvent.click(screen.getByRole('button',{name:'预览文件'}));
      expect(screen.getAllByText('缺失')).toHaveLength(2);expect(screen.getByText('冲突')).toBeVisible();expect(screen.getByText('待确认')).toBeVisible();
      expect(screen.getAllByRole('checkbox',{name:/选择 02/}).every(el=>(el as HTMLInputElement).disabled)).toBe(true);
      fireEvent.click(screen.getByRole('button',{name:'取消全选'}));expect(screen.getByRole('button',{name:'生成压缩包'})).toBeDisabled();
    }finally{window.history.replaceState({},'','/');}
  });
});
