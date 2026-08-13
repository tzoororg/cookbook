#!/usr/bin/env node
// Local preview of dist/ under a subpath, to prove the relative URLs hold up.
//   node scripts/serve.mjs            -> http://localhost:8080/cookbook/
//   node scripts/serve.mjs 3000 /x/   -> http://localhost:3000/x/
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const port = Number(process.argv[2]) || 8080;
const base = (process.argv[3] || '/cookbook/').replace(/\/*$/, '/');
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml',
};

createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (!url.startsWith(base)) { res.writeHead(302, { Location: base }); return res.end(); }
  let rel = url.slice(base.length) || 'index.html';
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(dist, rel);
  if (!file.startsWith(dist)) { res.writeHead(403); return res.end('nope'); }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404');
  }
}).listen(port, () => console.log(`serving dist/ at http://localhost:${port}${base}`));
