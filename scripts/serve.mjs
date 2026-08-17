/**
 * Minimal static server for local preview.
 *
 * Needed because the site fetches its JSON, and browsers block fetch() from
 * file:// URLs. Serves docs/ exactly as GitHub Pages will.
 *
 *   node scripts/serve.mjs
 *   node scripts/serve.mjs --port 8080
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { projectRoot } from './lib/espn.mjs';

const ROOT = path.join(projectRoot(), 'docs');
const args = process.argv.slice(2);
const portFlag = args.indexOf('--port');
const PORT = portFlag >= 0 ? Number(args[portFlag + 1]) : 4173;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

/**
 * Applies docs/_headers so local preview matches what Cloudflare will send.
 *
 * Without this, a Content-Security-Policy mistake only shows up after deploy,
 * on a site your league is already looking at. Supports the subset of the
 * _headers format this project uses: a path pattern line, then indented
 * "Name: value" lines, with `*` as a trailing wildcard.
 */
async function loadHeaderRules() {
  const file = path.join(ROOT, '_headers');
  const text = await readFile(file, 'utf8').catch(() => null);
  if (!text) return [];

  const rules = [];
  let current = null;
  for (const rawLine of text.split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(rawLine)) {
      current = { pattern: rawLine.trim(), headers: {} };
      rules.push(current);
      continue;
    }
    if (!current) continue;
    const idx = rawLine.indexOf(':');
    if (idx === -1) continue;
    current.headers[rawLine.slice(0, idx).trim()] = rawLine.slice(idx + 1).trim();
  }
  return rules;
}

const matches = (pattern, pathname) =>
  pattern.endsWith('*')
    ? pathname.startsWith(pattern.slice(0, -1))
    : pathname === pattern;

const headerRules = await loadHeaderRules();

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    let filePath = path.join(ROOT, decodeURIComponent(url.pathname));

    // Never serve outside docs/.
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    let info = await stat(filePath).catch(() => null);
    if (info?.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
      info = await stat(filePath).catch(() => null);
    }
    if (!info) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }

    const body = await readFile(filePath);
    const headers = {
      'Content-Type': TYPES[path.extname(filePath)] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    };
    for (const rule of headerRules) {
      if (matches(rule.pattern, url.pathname)) Object.assign(headers, rule.headers);
    }
    res.writeHead(200, headers);
    res.end(body);
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain' }).end(`Server error: ${error.message}`);
  }
});

server.listen(PORT, () => {
  console.log(`\nFantasy Football Hub running at:\n  http://localhost:${PORT}\n`);
  console.log('Press Ctrl+C to stop.\n');
});
