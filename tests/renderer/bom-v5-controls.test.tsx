import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { BomAttachmentControl } from '../../src/renderer/pages/bom/BomAttachmentControl';
import { BomEditComparison } from '../../src/renderer/pages/bom/BomEditComparison';

it('shows exclusive attachment sources and cancels reuse when a replacement is chosen',()=>{
 const onReuse=vi.fn(),onUpload=vi.fn();
 render(<BomAttachmentControl index={1} role="image" asset={null} canReuse reuse disabled={false} previewOnly={false} onReuse={onReuse} onUpload={onUpload} onPreviewChange={()=>{}}/>);
 expect(screen.queryByRole('checkbox')).toBeNull();
 expect(screen.getByRole('radio',{name:'使用上一版图片'})).toBeChecked();
 fireEvent.change(screen.getByLabelText('第 1 行图片'),{target:{files:[new File(['image'],'new.png',{type:'image/png'})]}});
 expect(onReuse).toHaveBeenCalledWith(false);expect(onUpload).toHaveBeenCalledTimes(1);
});
it('keeps original values in a closed readonly drawer independent of editable values',()=>{
 const original={bomItemId:1,projectItemId:7,projectItemName:'LOGO',origin:'planned',drawingId:1,fullCode:'001',assets:[],material:'原纸',dimensions:null,position:null,notes:null,changeDetails:null,effectiveBatchName:null} as any;
 render(<BomEditComparison index={1} original={original} mainCategories={[]} projects={[]}><label>材质<input defaultValue="原纸"/></label></BomEditComparison>);
 expect(screen.queryByText('原纸')).toBeNull();
 fireEvent.change(screen.getByRole('textbox'),{target:{value:'新纸'}});
 fireEvent.click(screen.getByRole('button',{name:'修改前数据'}));
 expect(within(screen.getByRole('dialog',{name:'项目 1 修改前数据'})).getByText('原纸')).toBeVisible();
 expect(screen.getByRole('textbox')).toHaveValue('新纸');
});
it('opens a BOM attachment gallery at the clicked asset and switches roles without filenames in content',async()=>{
 const {BomAssetPreview}=await import('../../src/renderer/pages/bom/BomAssetPreview');
 const first={id:1,assetId:1,role:'image',originalFileName:'a.png'},second={id:2,assetId:2,role:'diagram',originalFileName:'b.png'};
 render(<BomAssetPreview assetId={2} name="b.png" gallery={[first,second] as any}/>);
 fireEvent.click(screen.getByRole('button',{name:'放大图片'}));
 const dialog=screen.getByRole('dialog',{name:'图片预览'});
 expect(within(dialog).getByRole('img')).toHaveAttribute('src','/api/boms/assets/2/preview');
 fireEvent.click(within(dialog).getByRole('button',{name:'上一张'}));expect(within(dialog).getByRole('img')).toHaveAttribute('src','/api/boms/assets/1/preview');
 expect(screen.queryByText('a.png')).toBeNull();expect(screen.queryByText('b.png')).toBeNull();
 fireEvent.keyDown(window,{key:'Escape'});expect(screen.queryByRole('dialog')).toBeNull();
});
