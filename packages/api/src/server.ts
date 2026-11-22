import { createServer } from 'node:http';
import { PACKAGE_DESCRIPTION, PACKAGE_NAME } from './index.js';

const port = Number.parseInt(process.env.PORT ?? '3001', 10);

const server = createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'ok', service: PACKAGE_NAME }));
    return;
  }

  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ name: PACKAGE_NAME, description: PACKAGE_DESCRIPTION }));
});

server.listen(port, () => {
  console.log(`[${PACKAGE_NAME}] listening on http://localhost:${port}`);
});
