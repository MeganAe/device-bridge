import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const uiRoot = path.join(projectRoot, 'ui');
const port = Number(process.env.PORT || 1420);
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

const server = http.createServer((request, response) => {
  let requestPath;
  try {
    requestPath = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname);
  } catch {
    response.writeHead(400).end('Bad request');
    return;
  }

  const requestedFile = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
  const fullPath = path.resolve(uiRoot, requestedFile);
  if (!fullPath.startsWith(`${uiRoot}${path.sep}`) && fullPath !== path.join(uiRoot, 'index.html')) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(fullPath, (error, content) => {
    if (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500).end('Not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(fullPath)] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store'
    });
    response.end(content);
  });
});

const host = process.env.HOST || '0.0.0.0';
server.listen(port, host, () => {
  console.log(`Device Bridge UI prête sur http://${host}:${port}`);
});
