import {fireEvent,render,screen} from '@testing-library/react';
import {describe,it,expect} from 'vitest';
import {ProductExitWorksheet} from '../../src/renderer/components/ProductExitWorksheet';
const preview={productId:1,model:'F100',sku:'TEST',owned:{drawings:4,historicalDrawings:8,bomRecords:2,qrCodes:3,batches:3},preservedSnapshots:2,classification:{alreadyDeleted:1,presentPdfIndexes:6,missingPdfIndexes:1,preservedDrafts:2},blockers:[]};
describe('real exit worksheet',()=>{
 it('does not turn owned BOM counts into blockers or offer historical deletion',()=>{
  render(<ProductExitWorksheet preview={preview}/>);
  expect(screen.getByText('可退出')).toBeVisible();
  expect(screen.queryByRole('button',{name:/删除/})).toBeNull();
  fireEvent.click(screen.getAllByRole('button',{name:'查看规则'})[2]);
  expect(screen.getByText(/所属数量不是必须手动删除的阻塞数量/)).toBeVisible();
 });
 it('uses real blocker result independently of summary counts',()=>{
  render(<ProductExitWorksheet preview={{...preview,blockers:['其他产品仍引用资料']}}/>);
  expect(screen.getByText('需先处理')).toBeVisible();
 });
});
