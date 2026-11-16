// A minimal static server for game/ (Node 22, standard library only), so the game can
// be played locally with no build step: `node serve.ts` serves game/ on
// http://localhost:8080 (or `--port <n>`). It answers with the MIME types a browser
// game needs, refuses any path that climbs out of game/, and otherwise does nothing
// clever. A development convenience, not a web server for the internet.
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const GAME_DIR = resolve(fileURLToPath(new URL('./game', import.meta.url)));

function pickPort() {
  const args = process.argv.slice(2);
  const at = args.indexOf('--port');
  const value = at === -1 ? 8080 : Number(args[at + 1]);
  return Number.isInteger(value) && value > 0 && value < 65536 ? value : 8080;
}

function mimeFor(file) {
  const table = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.glb': 'model/gltf-binary',
    '.gltf': 'model/gltf+json',
    '.bin': 'application/octet-stream',
    '.wasm': 'application/wasm',
    '.wav': 'audio/wav',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.txt': 'text/plain; charset=utf-8',
  };
  return table[extname(file).toLowerCase()] ?? 'application/octet-stream';
}

function resolveInside(requestPath) {
  let path = requestPath;
  if (path.endsWith('/')) path += 'index.html';
  const file = resolve(join(GAME_DIR, normalize(path)));
  if (file !== GAME_DIR && !file.startsWith(GAME_DIR + sep)) return null;
  return file;
}

const server = createServer((request, response) => {
  let pathname = '/';
  try {
    pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  } catch {
    response.writeHead(400).end('bad request');
    return;
  }
  const file = resolveInside(pathname);
  if (file === null) {
    response.writeHead(403).end('forbidden');
    return;
  }
  let size = 0;
  try {
    const info = statSync(file);
    if (!info.isFile()) throw new Error('not a file');
    size = info.size;
  } catch {
    response.writeHead(404).end('not found');
    return;
  }
  response.writeHead(200, { 'content-type': mimeFor(file), 'content-length': size, 'cache-control': 'no-store' });
  createReadStream(file).pipe(response);
});

server.listen(pickPort(), '127.0.0.1', () => {
  console.log(`game/ is on http://localhost:${pickPort()}`);
});
