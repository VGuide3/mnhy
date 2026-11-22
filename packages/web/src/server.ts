import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { PACKAGE_NAME } from './index.js';

const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const page = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

const server = createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'ok', service: PACKAGE_NAME }));
    return;
  }

  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(page);
});

server.listen(port, () => {
  console.log(`[${PACKAGE_NAME}] listening on http://localhost:${port}`);
});
