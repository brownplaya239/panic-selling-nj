// Local development server that mirrors production:
//  - serves only the published files (same list as scripts/build.mjs)
//  - runs the real Netlify function at /api/comps with variables from .env
// Usage: node dev-server.mjs   (http://localhost:8788)
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, createReadStream } from 'node:fs';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PUBLIC_ENTRIES } from './scripts/build.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8788;

// Load .env without overriding variables already set in the shell.
const envFile = join(root, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

const FUNCTIONS = {
  '/api/comps': () => import('./netlify/functions/comps.mjs'),
  '/.netlify/functions/comps': () => import('./netlify/functions/comps.mjs'),
};

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

function publicFile(pathname) {
  const rel = normalize(decodeURIComponent(pathname === '/' ? '/index.html' : pathname)).replace(/^[\\/]+/, '');
  if (!rel || rel.startsWith('..')) return null;
  const top = rel.split(sep)[0].split('/')[0];
  if (!PUBLIC_ENTRIES.includes(top)) return null;
  const abs = join(root, rel);
  if (!abs.startsWith(root + sep)) return null;
  return existsSync(abs) && statSync(abs).isFile() ? abs : null;
}

createServer(async (req, res) => {
  const t0 = Date.now();
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let status = 200;
  try {
    const fn = FUNCTIONS[url.pathname];
    if (fn) {
      const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await new Promise((ok) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => ok(Buffer.concat(c))); });
      const handler = (await fn()).default;
      const response = await handler(new Request(url, { method: req.method, body }));
      status = response.status;
      res.writeHead(status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } else {
      const file = publicFile(url.pathname);
      if (!file) {
        status = 404;
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<!doctype html><title>Not found</title><h1>404 — Not found</h1>');
      } else {
        res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        createReadStream(file).pipe(res);
      }
    }
  } catch (e) {
    status = 500;
    console.error(e);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Dev server error: ' + e.message }));
  }
  console.log(`${req.method} ${url.pathname} ${status} ${Date.now() - t0}ms`);
}).listen(PORT, '127.0.0.1', () => {
  console.log(`NJREindex dev server on http://localhost:${PORT}`);
  console.log(`/api/comps ${process.env.SPARK_ACCESS_TOKEN ? 'enabled' : 'DISABLED (no SPARK_ACCESS_TOKEN in .env)'}`);
});
