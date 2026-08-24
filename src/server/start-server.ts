import Fastify from 'fastify';

export interface ServerOptions {
  host?: '127.0.0.1';
  port?: number;
  token?: string;
}

export interface RunningServer {
  url: string;
  token: string;
  close(): Promise<void>;
}

export async function startServer(options: ServerOptions = {}): Promise<RunningServer> {
  const host = options.host ?? '127.0.0.1';
  const token = options.token ?? crypto.randomUUID();
  const server = Fastify({ logger: false });

  server.get('/api/health', async () => ({ status: 'ok' }));
  const address = await server.listen({ host, port: options.port ?? 4317 });

  return {
    url: address,
    token,
    close: () => server.close(),
  };
}
