import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {DrawingReusePanel} from '../../src/renderer/pages/DrawingReusePanel';
import type {PlannerApi,DrawingDetailView,ProductView} from '../../src/renderer/data/client';
import type {AppearanceVersion} from '../../src/renderer/data/appearance-client';
it('previews the explicit target and reason, then sends only the approved contract on confirmation',async()=>{
 const preview={signedId:7,productId:1,appearanceVersionId:12,reason:'沿用已核验包装',fingerprint:'verified',fullCode:'02.0404.010.0401001',versionLabel:'第二外观'};
 const api={previewDrawingReuse:vi.fn().mockResolvedValue(preview),confirmDrawingReuse:vi.fn().mockResolvedValue({updated:1})} as unknown as PlannerApi;
 const onSaved=vi.fn().mockResolvedValue(undefined);
 render(<DrawingReusePanel api={api} drawing={{id:7,productId:1,appearanceVersionId:11} as DrawingDetailView} products={[{id:1,model:'ZC100'},{id:2,model:'Other'}] as ProductView[]} versions={[{id:11,productId:1,label:'原始外观',appearanceId:1},{id:12,productId:1,label:'第二外观',appearanceId:2}] as AppearanceVersion[]} onSaved={onSaved}/>);
 fireEvent.change(screen.getByLabelText('沿用目标产品'),{target:{value:'1'}});fireEvent.change(screen.getByLabelText('沿用目标外观版本'),{target:{value:'12'}});fireEvent.change(screen.getByLabelText('沿用原因'),{target:{value:preview.reason}});
 fireEvent.click(screen.getByRole('button',{name:'预览沿用'}));await screen.findByRole('button',{name:'确认沿用到外观版本'});
 expect(api.previewDrawingReuse).toHaveBeenCalledWith({signedId:7,productId:1,appearanceVersionId:12,reason:preview.reason});expect(api.confirmDrawingReuse).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'确认沿用到外观版本'}));await waitFor(()=>expect(onSaved).toHaveBeenCalledOnce());
 expect(api.confirmDrawingReuse).toHaveBeenCalledWith({signedId:7,productId:1,appearanceVersionId:12,reason:preview.reason,fingerprint:'verified',confirmed:true});
});
