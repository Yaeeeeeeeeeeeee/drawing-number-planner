import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { EmailComposer } from '../../src/renderer/pages/outbound/EmailComposer';
const base={key:'mail',name:'模板一',manufacturer:'厂家甲',scenario:'完整',materialType:'initial',subjectTemplate:'主题',bodyTemplate:'正文',status:'active',blocks:[]};
const contacts=[{id:1,company:'厂家甲',contactName:'旧默认',email:'old@example.test',defaultRecipientType:'to',status:'active'},{id:2,company:'共享',contactName:'共享二',email:'second@example.test',defaultRecipientType:'to',status:'active'},{id:3,company:'共享',contactName:'共享三',email:'third@example.test',defaultRecipientType:'cc',status:'active'},{id:4,company:'共享',contactName:'已停用',email:'inactive@example.test',defaultRecipientType:'cc',status:'inactive'}];
function fixture(){return {listOutboundContacts:vi.fn().mockResolvedValue(contacts),listOutboundTemplates:vi.fn().mockResolvedValue([{...base,id:1,contactLinksConfigured:true,contactLinks:[{contactId:3,recipientType:'to',displayOrder:1},{contactId:2,recipientType:'to',displayOrder:0},{contactId:2,recipientType:'cc',displayOrder:0},{contactId:4,recipientType:'cc',displayOrder:1}]},{...base,id:2,name:'模板二',contactLinksConfigured:true,contactLinks:[]},{...base,id:3,name:'旧模板',scenario:'旧场景'},{...base,id:4,name:'更新模板',scenario:'更新',materialType:'update',contactLinksConfigured:true,contactLinks:[{contactId:3,recipientType:'cc',displayOrder:0}]}]),listOutboundSignatures:vi.fn().mockResolvedValue([]),renderOutboundTemplate:vi.fn().mockResolvedValue({subject:'主题',body:'正文'})};}
async function chooseFirst(){await within(screen.getByLabelText('适用厂家')).findByRole('option',{name:'厂家甲'});fireEvent.change(screen.getByLabelText('适用厂家'),{target:{value:'厂家甲'}});fireEvent.change(screen.getByLabelText('邮件资料类型'),{target:{value:'initial'}});fireEvent.change(screen.getByLabelText('邮件场景'),{target:{value:'完整'}});fireEvent.change(screen.getByLabelText('邮件模板'),{target:{value:'1'}});}
it('uses selected template role order, active linked picker union and explicit empty links, preserving legacy fallback',async()=>{
 const api=fixture();render(<EmailComposer api={api as never} mailContext={null}/>);await chooseFirst();
 await waitFor(()=>expect(screen.getByLabelText('收件人文本')).toHaveValue('second@example.test; third@example.test'));
 expect(screen.getByLabelText('抄送文本')).toHaveValue('second@example.test');expect(screen.getByLabelText('收件人 共享二')).toBeChecked();expect(screen.getByLabelText('抄送 共享二')).toBeChecked();expect(screen.getByLabelText('收件人 旧默认')).not.toBeChecked();expect(screen.queryByLabelText('抄送 已停用')).not.toBeInTheDocument();
 fireEvent.change(screen.getByLabelText('邮件模板'),{target:{value:'2'}});expect(screen.getByLabelText('收件人文本')).toHaveValue('');expect(screen.getByLabelText('抄送文本')).toHaveValue('');
 fireEvent.change(screen.getByLabelText('邮件场景'),{target:{value:'旧场景'}});await waitFor(()=>expect(screen.getByLabelText('收件人文本')).toHaveValue('old@example.test'));
 fireEvent.change(screen.getByLabelText('邮件资料类型'),{target:{value:'update'}});fireEvent.change(screen.getByLabelText('邮件场景'),{target:{value:'更新'}});await waitFor(()=>expect(screen.getByLabelText('抄送文本')).toHaveValue('third@example.test'));expect(screen.getByLabelText('收件人文本')).toHaveValue('');
});
it('keeps manual selection, free-text recipients and body across template, scenario and manufacturer changes',async()=>{
 const api=fixture();render(<EmailComposer api={api as never} mailContext={null}/>);await chooseFirst();
 await waitFor(()=>expect(screen.getByLabelText('抄送文本')).toHaveValue('second@example.test'));
 fireEvent.click(screen.getByLabelText('收件人 旧默认'));fireEvent.change(screen.getByLabelText('抄送文本'),{target:{value:'manual@example.test'}});fireEvent.change(screen.getByLabelText('正文'),{target:{value:'人工正文'}});
 const selected=(screen.getByLabelText('收件人文本') as HTMLInputElement).value;
 fireEvent.change(screen.getByLabelText('邮件模板'),{target:{value:'2'}});expect(screen.getByLabelText('收件人文本')).toHaveValue(selected);expect(screen.getByLabelText('抄送文本')).toHaveValue('manual@example.test');expect(screen.getByLabelText('正文')).toHaveValue('人工正文');
 fireEvent.change(screen.getByLabelText('邮件场景'),{target:{value:'旧场景'}});fireEvent.change(screen.getByLabelText('适用厂家'),{target:{value:'共享'}});expect(screen.getByLabelText('收件人文本')).toHaveValue(selected);expect(screen.getByLabelText('抄送文本')).toHaveValue('manual@example.test');
});
it('updates the untouched CC role while retaining manual To text in the filtered recipient picker',async()=>{
 const api=fixture();render(<EmailComposer api={api as never} mailContext={null} filterRecipients/>);await chooseFirst();
 await waitFor(()=>expect(screen.getByLabelText('抄送文本')).toHaveValue('second@example.test'));
 expect(screen.getByLabelText('收件人筛选公司')).toBeInTheDocument();expect(screen.getByLabelText('收件人 共享三')).toBeChecked();
 fireEvent.change(screen.getByLabelText('收件人文本'),{target:{value:'typed@example.test'}});
 fireEvent.change(screen.getByLabelText('邮件模板'),{target:{value:'2'}});
 expect(screen.getByLabelText('收件人文本')).toHaveValue('typed@example.test');expect(screen.getByLabelText('抄送文本')).toHaveValue('');
});
it('renders the first ordered linked To contact salutation on automatic initial generation',async()=>{
 const api=fixture();api.listOutboundTemplates.mockResolvedValue([ (await api.listOutboundTemplates())[0] ]);
 render(<EmailComposer api={api as never} mailContext={{packageName:'资料',manufacturer:'厂家甲',scenario:'完整',materialType:'initial',product:{id:1,model:'型号',brandName:'品牌',productCategory:'类别'},items:[]} as never}/>);
 await waitFor(()=>expect(api.renderOutboundTemplate).toHaveBeenCalled());
 expect(api.renderOutboundTemplate.mock.calls[0]?.[1]).toMatchObject({contact_salutation:'共享二'});
});
