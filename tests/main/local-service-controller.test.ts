// @vitest-environment node
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { LocalServiceController, type ServiceChild } from '../../src/main/local-service-controller';

class FakeChild extends EventEmitter implements ServiceChild {
  connected = true;
  killed = false;
  readonly sent: unknown[] = [];
  readonly killedWith: NodeJS.Signals[] = [];
  send(message: unknown): boolean { this.sent.push(message); return true; }
  kill(signal: NodeJS.Signals = 'SIGTERM'): boolean {
    this.killed = true; this.killedWith.push(signal); return true;
  }
}

const config = { dataDir: 'C:\\planner-data', allowedOrigins: ['http://127.0.0.1:5173'], port: 4317 };

describe('LocalServiceController', () => {
  afterEach(() => vi.useRealTimers());

  it('starts through structured IPC and becomes healthy only after ready', async () => {
    const child = new FakeChild();
    const spawn = vi.fn(() => child);
    const controller = new LocalServiceController({ entryPath: 'service-entry.js', config, spawn });

    const starting = controller.start();
    expect(controller.health()).toEqual({ status: 'starting', restartAttempts: 0 });
    expect(spawn).toHaveBeenCalledWith('service-entry.js');
    expect(child.sent).toEqual([{ type: 'start', config }]);
    child.emit('message', { type: 'ready', url: 'http://127.0.0.1:4317', token: 'secret-one' });

    await expect(starting).resolves.toEqual({ url: 'http://127.0.0.1:4317', token: 'secret-one' });
    expect(controller.health()).toEqual({ status: 'running', url: 'http://127.0.0.1:4317', restartAttempts: 0 });
    expect(JSON.stringify(spawn.mock.calls)).not.toContain('secret-one');
  });

  it.each([
    ['port occupied', { type: 'startup-error', code: 'EADDRINUSE', message: '端口已占用' }],
    ['startup exit', null],
  ])('rejects a %s without reporting ready', async (_name, startupMessage) => {
    const child = new FakeChild();
    const controller = new LocalServiceController({ entryPath: 'entry.js', config, spawn: () => child });
    const starting = controller.start();
    if (startupMessage) child.emit('message', startupMessage);
    else child.emit('exit', 1, null);
    await expect(starting).rejects.toThrow(startupMessage ? '端口已占用' : '本地服务在启动完成前退出');
    expect(controller.health().status).toBe('failed');
  });

  it('times out startup and force-terminates a child that does not exit', async () => {
    vi.useFakeTimers();
    const child = new FakeChild();
    const controller = new LocalServiceController({ entryPath: 'entry.js', config, spawn: () => child,
      startupTimeoutMs: 50, stopTimeoutMs: 20 });
    const starting = controller.start();
    const rejected = expect(starting).rejects.toThrow('本地服务启动超时');
    await vi.advanceTimersByTimeAsync(50);
    await rejected;
    expect(child.killedWith).toContain('SIGTERM');
    await vi.advanceTimersByTimeAsync(20);
    expect(child.killedWith).toContain('SIGKILL');
  });

  it('limits automatic restarts after unexpected runtime exits', async () => {
    vi.useFakeTimers();
    const children = [new FakeChild(), new FakeChild(), new FakeChild(), new FakeChild()];
    const spawn = vi.fn(() => children[spawn.mock.calls.length - 1]);
    const controller = new LocalServiceController({ entryPath: 'entry.js', config, spawn,
      maxAutoRestarts: 2, restartBackoffMs: 10 });
    const started = controller.start(); children[0].emit('message', { type: 'ready', url: 'http://127.0.0.1:4317', token: 'a' });
    await started;

    children[0].emit('exit', 1, null); await vi.advanceTimersByTimeAsync(10);
    children[1].emit('message', { type: 'ready', url: 'http://127.0.0.1:4317', token: 'b' });
    children[1].emit('exit', 1, null); await vi.advanceTimersByTimeAsync(20);
    children[2].emit('message', { type: 'ready', url: 'http://127.0.0.1:4317', token: 'c' });
    children[2].emit('exit', 1, null); await vi.advanceTimersByTimeAsync(100);

    expect(spawn).toHaveBeenCalledTimes(3);
    expect(controller.health()).toEqual({ status: 'failed', restartAttempts: 2, error: '本地服务异常退出，自动恢复次数已用尽' });
  });

  it('shares one pending generation when start is called during automatic-restart backoff', async () => {
    vi.useFakeTimers();
    const first = new FakeChild(); const recovered = new FakeChild();
    const spawn = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(recovered);
    const controller = new LocalServiceController({ entryPath: 'entry.js', config, spawn,
      maxAutoRestarts: 2, restartBackoffMs: 50 });
    const initial = controller.start(); first.emit('message', { type: 'ready', url: 'http://127.0.0.1:4317', token: 'a' }); await initial;

    first.emit('exit', 1, null);
    const waitingOne = controller.start(); const waitingTwo = controller.start();
    expect(waitingOne).toBe(waitingTwo);
    await vi.advanceTimersByTimeAsync(49); expect(spawn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); expect(spawn).toHaveBeenCalledTimes(2);
    recovered.emit('message', { type: 'ready', url: 'http://127.0.0.1:4317', token: 'b' });
    await expect(waitingOne).resolves.toMatchObject({ token: 'b' });
    await vi.advanceTimersByTimeAsync(500);
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(controller.health()).toMatchObject({ status: 'running', restartAttempts: 1 });
  });

  it('does not turn a failed startup into an automatic restart loop when the child exits', async () => {
    vi.useFakeTimers();
    const child = new FakeChild(); const spawn = vi.fn(() => child);
    const controller = new LocalServiceController({ entryPath: 'entry.js', config, spawn, restartBackoffMs: 10 });
    const starting = controller.start(); const rejected = expect(starting).rejects.toThrow('端口已占用');
    child.emit('message', { type: 'startup-error', code: 'EADDRINUSE', message: '端口已占用' });
    await rejected; child.emit('exit', 1, null); await vi.advanceTimersByTimeAsync(100);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(controller.health()).toMatchObject({ status: 'failed', restartAttempts: 0 });
  });

  it('does not auto-restart after the process itself reports a startup error', async () => {
    vi.useFakeTimers();
    const child = new FakeChild(); const spawn = vi.fn(() => child);
    const controller = new LocalServiceController({ entryPath: 'entry.js', config, spawn, restartBackoffMs: 10 });
    const starting = controller.start(); const rejected = expect(starting).rejects.toThrow('spawn failed');
    child.emit('error', new Error('spawn failed')); await rejected;
    child.emit('exit', 1, null); await vi.advanceTimersByTimeAsync(100);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(controller.health()).toMatchObject({ status: 'failed', restartAttempts: 0, error: 'spawn failed' });
  });

  it('round-trips private service requests and preserves structured errors', async () => {
    const child = new FakeChild();
    const controller = new LocalServiceController({ entryPath: 'entry.js', config, spawn: () => child });
    const started = controller.start(); child.emit('message', { type: 'ready', url: 'http://127.0.0.1:4317', token: 'x' }); await started;

    const resolved = controller.resolvePdfFilePath(42);
    expect(child.sent.at(-1)).toEqual({ type: 'request', id: 1, method: 'resolvePdfFilePath', args: [42] });
    child.emit('message', { type: 'response', id: 1, ok: true, value: 'C:\\library\\drawing.pdf' });
    await expect(resolved).resolves.toBe('C:\\library\\drawing.pdf');

    const missing = controller.resolveOutboundPackagePath(9);
    child.emit('message', { type: 'response', id: 2, ok: false,
      error: { code: 'PACKAGE_MISSING', message: '压缩包当前不可用' } });
    await expect(missing).rejects.toMatchObject({ code: 'PACKAGE_MISSING', message: '压缩包当前不可用' });
  });

  it('manual restart stops gracefully and returns a fresh token', async () => {
    vi.useFakeTimers();
    const first = new FakeChild(); const second = new FakeChild();
    const spawn = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    const controller = new LocalServiceController({ entryPath: 'entry.js', config, spawn, stopTimeoutMs: 50 });
    const initial = controller.start(); first.emit('message', { type: 'ready', url: 'http://127.0.0.1:4317', token: 'old' });
    await initial;
    const restarting = controller.restart();
    expect(first.sent.at(-1)).toEqual({ type: 'stop' });
    first.emit('message', { type: 'stopped' }); first.emit('exit', 0, null);
    await vi.advanceTimersByTimeAsync(0);
    second.emit('message', { type: 'ready', url: 'http://127.0.0.1:4317', token: 'new' });
    await expect(restarting).resolves.toEqual({ url: 'http://127.0.0.1:4317', token: 'new' });
    expect(controller.health()).toMatchObject({ status: 'running', restartAttempts: 0 });
  });

  it('allows a manual restart while a failed-start child is still exiting', async () => {
    vi.useFakeTimers();
    const first = new FakeChild(); const second = new FakeChild();
    const spawn = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    const controller = new LocalServiceController({ entryPath: 'entry.js', config, spawn, stopTimeoutMs: 20 });
    const starting = controller.start(); const rejected = expect(starting).rejects.toThrow('端口已占用');
    first.emit('message', { type: 'startup-error', code: 'EADDRINUSE', message: '端口已占用' }); await rejected;

    const restarted = controller.restart(); first.emit('exit', 1, null); await vi.advanceTimersByTimeAsync(0);
    expect(spawn).toHaveBeenCalledTimes(2);
    second.emit('message', { type: 'ready', url: 'http://127.0.0.1:4317', token: 'fresh' });
    await expect(restarted).resolves.toMatchObject({ token: 'fresh' });
  });

  it('uses a forceful fallback only when graceful stop does not finish', async () => {
    vi.useFakeTimers();
    const child = new FakeChild();
    const controller = new LocalServiceController({ entryPath: 'entry.js', config, spawn: () => child, stopTimeoutMs: 25 });
    const started = controller.start(); child.emit('message', { type: 'ready', url: 'http://127.0.0.1:4317', token: 'x' }); await started;
    const stopping = controller.stop();
    expect(child.sent.at(-1)).toEqual({ type: 'stop' });
    await vi.advanceTimersByTimeAsync(25);
    expect(child.killedWith).toContain('SIGTERM');
    await vi.advanceTimersByTimeAsync(25);
    expect(child.killedWith).toContain('SIGKILL');
    child.emit('exit', null, 'SIGKILL');
    await stopping;
    expect(controller.health()).toEqual({ status: 'stopped', restartAttempts: 0 });
  });

  it('allows database validation to finish beyond the old fifteen-second deadline', async () => {
    vi.useFakeTimers();
    const child = new FakeChild();
    const controller = new LocalServiceController({entryPath:'entry.js',config,spawn:()=>child});
    let failure: unknown;
    const starting = controller.start().catch(error=>{failure=error;});
    child.emit('message',{type:'startup-progress',phase:'database-validation'});
    await vi.advanceTimersByTimeAsync(25_000);
    expect(failure).toBeUndefined();
    expect(child.killedWith).toEqual([]);
    child.emit('message',{type:'ready',url:'http://127.0.0.1:4317',token:'secret'});
    await starting;
    expect(controller.health().status).toBe('running');
  });

  it('renews the phase wait on progress but enforces the overall startup deadline', async () => {
    vi.useFakeTimers();
    const child = new FakeChild();
    const controller = new LocalServiceController({entryPath:'entry.js',config,spawn:()=>child,
      startupTimeoutMs:50,startupDeadlineMs:120});
    let failure: Error | undefined;
    const starting=controller.start().catch(error=>{failure=error;});
    for(const phase of ['database-validation','daily-backup']) {
      await vi.advanceTimersByTimeAsync(40);
      child.emit('message',{type:'startup-progress',phase});
    }
    expect(failure).toBeUndefined();
    await vi.advanceTimersByTimeAsync(40); await starting;
    expect(failure?.message).toContain('总时限');
    expect(child.killedWith).toContain('SIGTERM');
    child.emit('exit',null,'SIGTERM');
  });

  it('reports the stalled phase and selected database instead of silently timing out', async () => {
    vi.useFakeTimers();
    const child = new FakeChild();
    const controller = new LocalServiceController({entryPath:'entry.js',config,spawn:()=>child,startupTimeoutMs:50});
    let failure:Error|undefined;
    const starting=controller.start().catch(error=>{failure=error;});
    await vi.advanceTimersByTimeAsync(40);
    child.emit('message',{type:'startup-progress',phase:'daily-backup'});
    await vi.advanceTimersByTimeAsync(49);
    expect(child.killedWith).toEqual([]);
    await vi.advanceTimersByTimeAsync(1); await starting;
    expect(failure?.message).toMatch(/每日备份[\s\S]*planner\.db/u);
    child.emit('exit',null,'SIGTERM');
  });

  it.each(['timeout','stop'] as const)('ignores late readiness after %s',async(reason)=>{
    vi.useFakeTimers();
    const child=new FakeChild();
    const controller=new LocalServiceController({entryPath:'entry.js',config,spawn:()=>child,startupTimeoutMs:50});
    const starting=controller.start().catch(()=>{});
    let stopping:Promise<void>|undefined;
    if(reason==='timeout') await vi.advanceTimersByTimeAsync(50);
    else stopping=controller.stop();
    child.emit('message',{type:'ready',url:'http://127.0.0.1:4317',token:'too-late'});
    expect(controller.health().status).not.toBe('running');
    child.emit('exit',null,'SIGTERM'); await starting; await stopping;
  });

  it('persists startup phases and exit details without recording the private token',async()=>{
    const root=mkdtempSync(join(tmpdir(),'planner-startup-log-'));
    try {
      const diagnosticsPath=join(root,'logs','service-startup.jsonl');
      const child=Object.assign(new FakeChild(),{pid:12345});
      const controller=new LocalServiceController({entryPath:'entry.js',config:{...config,dataDir:root},spawn:()=>child,diagnosticsPath});
      const starting=controller.start();
      child.emit('message',{type:'startup-progress',phase:'database-validation'});
      child.emit('message',{type:'ready',url:'http://127.0.0.1:4317',token:'never-write-this-token'});
      await starting;
      const stopping=controller.stop(); child.emit('exit',17,null); await stopping;
      const contents=readFileSync(diagnosticsPath,'utf8');
      const records=contents.trim().split('\n').map(line=>JSON.parse(line));
      expect(records).toEqual(expect.arrayContaining([
        expect.objectContaining({event:'phase',phase:'database-validation',databasePath:join(root,'planner.db'),pid:12345}),
        expect.objectContaining({event:'exit',exitCode:17,signal:null}),
      ]));
      expect(contents).not.toContain('never-write-this-token');
    } finally {rmSync(root,{recursive:true,force:true});}
  });

  it('does not block readiness when the diagnostic directory is unwritable',async()=>{
    const root=mkdtempSync(join(tmpdir(),'planner-startup-log-error-'));
    try {
      const blocked=join(root,'not-a-directory');writeFileSync(blocked,'keep');
      const child=new FakeChild();
      const controller=new LocalServiceController({entryPath:'entry.js',config,spawn:()=>child,diagnosticsPath:join(blocked,'startup.jsonl')});
      const starting=controller.start();
      child.emit('message',{type:'ready',url:'http://127.0.0.1:4317',token:'private'});
      await expect(starting).resolves.toMatchObject({token:'private'});
      const stopping=controller.stop();child.emit('exit',0,null);await stopping;
      expect(readFileSync(blocked,'utf8')).toBe('keep');
    } finally {rmSync(root,{recursive:true,force:true});}
  });

  it('waits for the stopping child to exit before coalescing a new start and restart',async()=>{
    vi.useFakeTimers();
    const old=new FakeChild(),fresh=new FakeChild();
    const spawn=vi.fn().mockReturnValueOnce(old).mockReturnValueOnce(fresh);
    const controller=new LocalServiceController({entryPath:'entry.js',config,spawn});
    const original=controller.start().catch(()=>{});
    const stopping=controller.stop();
    const starting=controller.start(),restarting=controller.restart();
    const waiting=Promise.all([starting,restarting]);waiting.catch(()=>{});
    expect(spawn).toHaveBeenCalledTimes(1);
    old.emit('exit',0,null);
    await vi.advanceTimersByTimeAsync(0);
    expect(spawn).toHaveBeenCalledTimes(2);
    fresh.emit('message',{type:'ready',url:'http://127.0.0.1:4317',token:'new-child'});
    await expect(waiting).resolves.toEqual([
      {url:'http://127.0.0.1:4317',token:'new-child'},
      {url:'http://127.0.0.1:4317',token:'new-child'},
    ]);
    await original;await stopping;
    const done=controller.stop();fresh.emit('exit',0,null);await done;
  });

  it('does not postpone a stalled phase when identical progress is repeated',async()=>{
    vi.useFakeTimers();const child=new FakeChild();
    const controller=new LocalServiceController({entryPath:'entry.js',config,spawn:()=>child,startupTimeoutMs:50});
    let failure:Error|undefined;const starting=controller.start().catch(error=>{failure=error;});
    child.emit('message',{type:'startup-progress',phase:'database-validation'});
    await vi.advanceTimersByTimeAsync(40);
    child.emit('message',{type:'startup-progress',phase:'database-validation'});
    await vi.advanceTimersByTimeAsync(10);await starting;
    expect(failure?.message).toContain('数据库完整性校验');
    expect(child.killedWith).toContain('SIGTERM');child.emit('exit',null,'SIGTERM');
  });
});
