import { cpSync, createReadStream, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const pdfjsRoot = resolve(dirname(createRequire(import.meta.url).resolve('pdfjs-dist')), '..');
const pdfjsDirectories = ['cmaps', 'standard_fonts', 'wasm'] as const;
function pdfjsResources(): Plugin {
  let output = '';
  return {
    name: 'pdfjs-resources',
    configResolved(config) { output = resolve(config.root, config.build.outDir, 'pdfjs'); },
    configureServer(server) {
      server.middlewares.use('/pdfjs', (request, response) => {
        const path = (request.url ?? '').split('?')[0];
        const match = /^\/(cmaps|standard_fonts|wasm)\/([a-zA-Z0-9_.-]+)$/.exec(path);
        if (!match || match[2] === '.' || match[2] === '..') { response.statusCode = 404; response.end(); return; }
        const file = join(pdfjsRoot, match[1], match[2]);
        try { if (!statSync(file).isFile()) throw new Error('Not a file'); }
        catch { response.statusCode = 404; response.end(); return; }
        response.setHeader('Content-Type', match[2].endsWith('.wasm') ? 'application/wasm' : match[2].endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
        createReadStream(file).pipe(response);
      });
    },
    writeBundle() { for (const directory of pdfjsDirectories) cpSync(join(pdfjsRoot, directory), join(output, directory), {recursive:true}); },
  };
}

export default defineConfig({
  plugins: [react(), pdfjsResources()],
  root: 'src/renderer',
  server: { proxy: { '/api': 'http://127.0.0.1:4317' } },
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
  },
});
