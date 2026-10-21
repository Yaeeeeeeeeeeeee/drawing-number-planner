import type { QrManualInput } from '../core/qr/qr-manual-service.js';
interface Dependencies {
  isTrustedEvent?(event: unknown): boolean;
  choosePdf(): Promise<string | null>;
  execute(action: string, input: unknown): Promise<unknown>;
  openPath(path: string): Promise<string>;
  showItemInFolder(path: string): void;
}
/** Renderer receives a capability, never supplies a filesystem path to the service. */
export function createQrManualHandlers(deps: Dependencies) {
  return {
    async select(event?: unknown) { if(deps.isTrustedEvent&&!deps.isTrustedEvent(event))throw new Error('UNTRUSTED_QR_SENDER'); const path = await deps.choosePdf(); return path ? deps.execute('select', { path }) : null; },
    async action(_event: unknown, action: unknown, input: unknown) {
      if(deps.isTrustedEvent&&!deps.isTrustedEvent(_event))throw new Error('UNTRUSTED_QR_SENDER');
      if (!['preview','commit','history','unlink','open','show'].includes(String(action)) || !input || typeof input !== 'object') throw new Error('INVALID_QR_MANUAL_ACTION');
      const data = input as Record<string, unknown>;
      if (action === 'open' || action === 'show') {
        if (typeof data.fileId !== 'string' || !/^[0-9a-f-]{36}$/i.test(data.fileId)) throw new Error('INVALID_QR_FILE_ID');
        const file = await deps.execute('resolve', { fileId: data.fileId }) as { path: string };
        if (action === 'show') deps.showItemInFolder(file.path);
        else { const error = await deps.openPath(file.path); if (error) throw new Error(error); }
        return { ok: true };
      }
      if (action === 'preview' && ('path' in data || 'absolutePath' in data || typeof (data as unknown as QrManualInput).token !== 'string')) throw new Error('INVALID_QR_SELECTION');
      return deps.execute(String(action), input);
    },
  };
}
