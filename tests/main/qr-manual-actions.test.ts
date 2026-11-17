import { describe, expect, it, vi } from 'vitest';
import { createQrManualHandlers } from '../../src/main/qr-manual-actions';
describe('trusted manual QR desktop boundary',()=>{
 it('comparison accepts only a preview capability, never a renderer path, token or arbitrary file ID',async()=>{
  const execute=vi.fn().mockResolvedValue({status:'not-compared'}),handlers=createQrManualHandlers({choosePdf:vi.fn(),execute,openPath:vi.fn(),showItemInFolder:vi.fn()});
  const previewId='b66ac16d-4fd8-4ae6-9c28-974b67179dcb';
  for(const input of [{path:'/secret.pdf'},{previewId,path:'/secret.pdf'},{previewId,token:'other'},{previewId,fileId:'other'}])await expect(handlers.action({},'comparison',input)).rejects.toThrow();
  expect(execute).not.toHaveBeenCalled();await expect(handlers.action({},'comparison',{previewId})).resolves.toEqual({status:'not-compared'});expect(execute).toHaveBeenCalledWith('comparison',{previewId});
 });
 it('passes only a native picker authorized path to registration and cancel performs no registration',async()=>{
  const execute=vi.fn().mockResolvedValue({token:'trusted'}); const choosePdf=vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce('C:\\Users\\manual.pdf');
  const handlers=createQrManualHandlers({choosePdf,execute,openPath:vi.fn(),showItemInFolder:vi.fn()});
  expect(await handlers.select()).toBeNull();expect(execute).not.toHaveBeenCalled();expect(await handlers.select()).toEqual({token:'trusted'});expect(execute).toHaveBeenCalledWith('select',{path:'C:\\Users\\manual.pdf'});
 });
 it('rejects renderer path registration, traversal IDs and arbitrary actions',async()=>{
  const execute=vi.fn();const handlers=createQrManualHandlers({choosePdf:vi.fn(),execute,openPath:vi.fn(),showItemInFolder:vi.fn()});
  await expect(handlers.action({},'select',{path:'C:\\secret'})).rejects.toThrow();
  await expect(handlers.action({},'preview',{token:'trusted',path:'C:\\secret'})).rejects.toThrow();
  await expect(handlers.action({},'open',{fileId:'../../secret'})).rejects.toThrow();expect(execute).not.toHaveBeenCalled();
 });
 it('resolves authorized file ID before opening and never accepts a renderer path',async()=>{
  const fileId='b66ac16d-4fd8-4ae6-9c28-974b67179dcb';const execute=vi.fn().mockResolvedValue({path:'C:\\authorized.pdf'}),openPath=vi.fn().mockResolvedValue(''),showItemInFolder=vi.fn();
  const handlers=createQrManualHandlers({choosePdf:vi.fn(),execute,openPath,showItemInFolder});
  await handlers.action({},'open',{fileId});expect(execute).toHaveBeenCalledWith('resolve',{fileId});expect(openPath).toHaveBeenCalledWith('C:\\authorized.pdf');await handlers.action({},'show',{fileId});expect(showItemInFolder).toHaveBeenCalledWith('C:\\authorized.pdf');
 });
});
