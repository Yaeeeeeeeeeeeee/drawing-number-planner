import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
const file = new URL('../progress.html', import.meta.url);
createServer((request, response) => {
  if (request.url !== '/' && request.url !== '/progress.html') { response.writeHead(404).end(); return; }
  try { response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).end(readFileSync(file)); }
  catch { response.writeHead(503).end('Progress snapshot unavailable'); }
}).listen(5186, '127.0.0.1', () => console.log('Progress only: http://127.0.0.1:5186/'));
