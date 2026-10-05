#!/usr/bin/env node
/**
 * Tiny static server for demo-site/ - lets you try the kit with no application
 * and no third-party account:
 *
 *   npm run demo:serve                      # http://localhost:4173
 *   BASE_URL=http://localhost:4173 npm test
 *
 * Or in one go: npm run test:demo (starts the server through Playwright's webServer).
 * Port: DEMO_PORT (default 4173). Zero dependencies.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'demo-site');
const PORT = parseInt(process.env.DEMO_PORT || '4173', 10);
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png' };

http
  .createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.normalize(path.join(ROOT, urlPath));
    if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  })
  .listen(PORT, () => console.log(`Demo app on http://localhost:${PORT}`));
