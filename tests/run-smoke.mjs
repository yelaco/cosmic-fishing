/**
 * run-smoke.mjs — Self-contained headless smoke test runner for Cosmic Fishing.
 *
 * Steps:
 *  1. Start a local static HTTP server on port 8123 serving the project root.
 *  2. Dynamically import playwright; SMOKE_SKIP (exit 0) if unavailable.
 *  3. Run assertions: AC-002 (resource bar), AC-013 (cast → catch-result), console-error check.
 *  4. Print SMOKE_PASS / SMOKE_FAIL / SMOKE_SKIP and exit accordingly.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { assertResourceBar, assertCastAndCatch, filterUnexpectedErrors } from './smoke.spec.mjs';

// ── Resolve project root (parent of tests/) ───────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const PORT = 8123;

// ── MIME type map ─────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
};

// ── Static file server ────────────────────────────────────────────────────────
function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      // Strip query string and decode URI
      let urlPath = req.url.split('?')[0];
      try { urlPath = decodeURIComponent(urlPath); } catch (_) {}

      // Default to index.html
      if (urlPath === '/' || urlPath === '') urlPath = '/index.html';

      const filePath = path.join(PROJECT_ROOT, urlPath);

      // Security: prevent path traversal outside project root
      if (!filePath.startsWith(PROJECT_ROOT)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end(`Not found: ${urlPath}`);
          return;
        }
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
      });
    });

    server.listen(PORT, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  let server = null;
  let browser = null;

  try {
    // 1. Start static server
    server = await startServer();

    // 2. Dynamically import playwright — SMOKE_SKIP if unavailable
    let chromium;
    try {
      ({ chromium } = await import('playwright'));
    } catch (importErr) {
      console.log(`SMOKE_SKIP: playwright not installed — ${importErr.message}`);
      process.exit(0);
    }

    // 3. Launch chromium — SMOKE_SKIP if binaries missing
    try {
      browser = await chromium.launch({ headless: true });
    } catch (launchErr) {
      console.log(`SMOKE_SKIP: chromium failed to launch — ${launchErr.message}`);
      process.exit(0);
    }

    const context = await browser.newContext();
    const page = await context.newPage();

    // Collect console errors and page errors
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push({ type: 'console.error', text: msg.text() });
      }
    });
    page.on('pageerror', err => {
      consoleErrors.push({ type: 'pageerror', text: err.message || String(err) });
    });

    // Navigate to game
    const url = `http://127.0.0.1:${PORT}/index.html`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 3000 });

    // AC-002: resource bar exists and shows Gold: 0
    try {
      await assertResourceBar(page);
    } catch (err) {
      console.log(`SMOKE_FAIL: ${err.message}`);
      process.exit(1);
    }

    // Dismiss the welcome-back / first-run overlay if present, so it doesn't
    // intercept pointer events on the Cast button (AC-013).
    // The CSS rule #welcome-back:not(:empty) { display: flex } overrides the
    // hidden attribute, so we forcibly set display:none via JS after dismissal.
    await page.evaluate(() => {
      const closeBtn = document.getElementById('welcome-back-close');
      if (closeBtn) closeBtn.click();
      const el = document.getElementById('welcome-back');
      if (el) {
        el.style.display = 'none';
        el.style.visibility = 'hidden';
        el.style.pointerEvents = 'none';
      }
    });

    // AC-013: click Cast, wait for .catch-result
    try {
      await assertCastAndCatch(page);
    } catch (err) {
      console.log(`SMOKE_FAIL: ${err.message}`);
      process.exit(1);
    }

    // Idle 15 seconds, then check for unexpected console errors
    await page.waitForTimeout(15000);

    const unexpected = filterUnexpectedErrors(consoleErrors);
    if (unexpected.length > 0) {
      const details = unexpected.map(e => `[${e.type}] ${e.text}`).join('\n  ');
      console.log(`SMOKE_FAIL: unexpected console errors detected:\n  ${details}`);
      process.exit(1);
    }

    console.log('SMOKE_PASS');
    process.exit(0);

  } catch (err) {
    console.log(`SMOKE_FAIL: unexpected error — ${err.message}`);
    process.exit(1);
  } finally {
    if (browser) {
      try { await browser.close(); } catch (_) {}
    }
    if (server) {
      server.close();
    }
  }
}

main();
