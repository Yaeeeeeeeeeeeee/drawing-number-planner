import type { FastifyInstance } from 'fastify';

export class LocalAccessError extends Error {
  constructor(public readonly code: 'NON_LOOPBACK_BINDING', message: string) { super(message); }
}

export function assertLoopbackHost(host: string): void {
  if (host !== '127.0.0.1') {
    throw new LocalAccessError('NON_LOOPBACK_BINDING', '本机服务只能绑定 127.0.0.1');
  }
}

export function registerLocalAccess(app: FastifyInstance, options: {
  token: string;
  allowedOrigins: string[];
}): { allowOrigin(origin: string): void } {
  const allowedOrigins = new Set(options.allowedOrigins);
  const writeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin;
    const isSessionBootstrap = request.method === 'POST' && request.url.split('?')[0] === '/api/session';
    if (isSessionBootstrap) {
      if (!origin || !allowedOrigins.has(origin)) {
        return reply.code(403).send({ error: { code: 'ORIGIN_NOT_ALLOWED', message: '请求来源不受信任' } });
      }
      return;
    }
    if (origin && !allowedOrigins.has(origin)) {
      return reply.code(403).send({ error: { code: 'ORIGIN_NOT_ALLOWED', message: '请求来源不受信任' } });
    }
    if (writeMethods.has(request.method)) {
      if (!origin) {
        return reply.code(403).send({ error: { code: 'ORIGIN_NOT_ALLOWED', message: '请求来源不受信任' } });
      }
      const supplied = request.headers['x-planner-token'];
      if (supplied !== options.token) {
        return reply.code(401).send({ error: { code: 'INVALID_TOKEN', message: '写操作令牌无效' } });
      }
    }
  });

  return { allowOrigin: (origin) => allowedOrigins.add(origin) };
}
