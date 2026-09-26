// Minimal static file server for testing public/
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = 7433;
const HOST = '127.0.0.1';

const MIME = {
  '.css': 'text/css',
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json',
  '.md':   'text/plain',
  '.mjs':  'text/javascript',
  '.js':   'text/javascript',
  '.txt':  'text/plain',
};

createServer((req, res) => {
  let urlPath = decodeURIComponent(new URL(req.url, `http://${HOST}`).pathname);
  if (urlPath === '/') urlPath = '/index.html';
  const safePath = urlPath.replace(/\.\./g, '');
  const filePath = join(__dirname, safePath);
  if (!existsSync(filePath)) {
    res.writeHead(404); res.end('Not found: ' + safePath); return;
  }
  try {
    const data = readFileSync(filePath);
    const ext  = extname(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': 'no-cache',
    });
    res.end(data);
    process.stdout.write(`200 ${urlPath}\n`);
  } catch (e) {
    res.writeHead(500); res.end(e.message);
  }
}).listen(PORT, HOST, () => {
  process.stdout.write(`Static server: http://${HOST}:${PORT}/\n`);
});
