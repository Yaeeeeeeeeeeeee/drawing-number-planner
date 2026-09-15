import type { ServerOptions } from '../server/start-server.js';

export type LocalServiceConfig = Pick<ServerOptions, 'dataDir' | 'allowedOrigins' | 'rendererDir' | 'port'>;

export type ParentToServiceMessage =
  | { type: 'start'; config: LocalServiceConfig }
  | { type: 'stop' }
  | { type: 'request'; id: number; method: ServiceRequestMethod; args: unknown[] };

export type ServiceRequestMethod =
  | 'resolvePdfFilePath'
  | 'resolveBomAssetPath'
  | 'resolveQrFilePath'
  | 'setOutboundOutputRoot'
  | 'resolveOutboundPackagePath';

export type ServiceToParentMessage =
  | { type: 'ready'; url: string; token: string }
  | { type: 'startup-error'; code?: string; message: string }
  | { type: 'stopped' }
  | { type: 'response'; id: number; ok: true; value: unknown }
  | { type: 'response'; id: number; ok: false; error: { code?: string; message: string } };

