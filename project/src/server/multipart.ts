import multipart from '@fastify/multipart';
import type { FastifyInstance } from 'fastify';

const registeredApps = new WeakSet<FastifyInstance>();

/** Register the shared parser once. Individual routes enforce their own lower limits. */
export function ensureMultipart(app: FastifyInstance): void {
  if (registeredApps.has(app)) return;
  registeredApps.add(app);
  app.register(multipart, { limits: { files: 1, fileSize: 20 * 1024 * 1024 } });
}
