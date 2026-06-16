/**
 * verify-polish.mjs — Extended verification harness for the Cosmic Fishing UI
 * polish run (tab nav fix, cosmic redesign, research aliveness).
 *
 * Machine-checks the cross-cutting contracts that the smoke test cannot:
 *   V1  Tab navigation actually switches visible panel (computed display).
 *   V2  Exactly ONE panel is visibly displayed at a time (no double-show).
 *   V3  #cosmic-bg contract: exists, direct child of <body>, aria-hidden=true.
 *   V4  Research tab has no hardcoded injected <style id="rt-styles"> dark theme;
 *       node colors come from CSS variables (background is not the old #0a0f1e).
 *   V5  Research no-flicker: scrolling .rt-wrap then firing a resource:change /
 *       research tick preserves scrollTop AND a node element's identity (same
 *       DOM node reference — proves patch, not full re-render).
 *   V6  reduce-animations kill-switch: with body.reduce-animations, ambient
 *       motion elements report animation-play-state:paused OR ~0 duration.
 *   V7  Class contract coverage: every rt-* / cosmic class the JS emits has a
 *       matching rule somewhere in the loaded stylesheets (no unstyled classes).
 *   V8  Per-realm screenshots (6 realms + reduce-animations) saved as artifacts.
 *
 * Mirrors run-smoke.mjs conventions: self-hosted static server, dynamic
 * playwright import, SMOKE_SKIP on missing playwright/chromium, and
 * VERIFY_PASS / VERIFY_FAIL / VERIFY_SKIP terminal output + exit codes.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const ARTIFACT_DIR = path.join(__dirname, 'artifacts');
const PORT = 8124;

const REALMS = ['pond', 'ocean', 'abyss', 'dream_sea', 'time_ocean', 'cosmic_void'];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let urlPath = req.url.split('?')[0];
      try { urlPath = decodeURIComponent(urlPath); } catch (_) {}
      if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
      const filePath = path.join(PROJECT_ROOT, urlPath);
      if (!filePath.startsWith(PROJECT_ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found: ' + urlPath); return; }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(data);
      });
    });
    server.listen(PORT, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

const failures = [];
function check(name, cond, detail) {
  if (cond) { console.log('  PASS ' + name); }
  else { console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); failures.push(name); }
}

async function dismissOverlay(page) {
  await page.evaluate(() => {
    const closeBtn = document.getElementById('welcome-back-close');
    if (closeBtn) closeBtn.click();
    const el = document.getElementById('welcome-back');
    if (el) { el.style.display = 'none'; el.style.visibility = 'hidden'; el.style.pointerEvents = 'none'; }
  });
}

async function main() {
  let server = null, browser = null;
  try {
    server = await startServer();
    let chromium;
    try { ({ chromium } = await import('playwright')); }
    catch (e) { console.log('VERIFY_SKIP: playwright not installed — ' + e.message); process.exit(0); }
    try { browser = await chromium.launch({ headless: true }); }
    catch (e) { console.log('VERIFY_SKIP: chromium failed to launch — ' + e.message); process.exit(0); }

    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const consoleErrors = [];
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', e => consoleErrors.push(e.message || String(e)));

    const url = `http://127.0.0.1:${PORT}/index.html`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 5000 });
    await dismissOverlay(page);

    // ── V3 #cosmic-bg contract ───────────────────────────────────────────────
    const bg = await page.evaluate(() => {
      const el = document.getElementById('cosmic-bg');
      if (!el) return { exists: false };
      return {
        exists: true,
        isBodyChild: el.parentElement === document.body,
        ariaHidden: el.getAttribute('aria-hidden'),
      };
    });
    check('V3 #cosmic-bg exists', bg.exists);
    check('V3 #cosmic-bg is direct body child', bg.exists && bg.isBodyChild);
    check('V3 #cosmic-bg aria-hidden=true', bg.exists && bg.ariaHidden === 'true');

    // ── V1/V2 tab navigation switches + single visible panel ─────────────────
    const tabs = ['encyclopedia', 'upgrades', 'research', 'automation', 'events', 'ascension', 'statistics', 'settings'];
    for (const t of tabs) {
      await page.click(`[data-tab="tab-${t}"]`);
      const r = await page.evaluate((tab) => {
        const panels = Array.from(document.querySelectorAll('.tab-panel'));
        const visible = panels.filter(p => getComputedStyle(p).display !== 'none');
        const active = document.getElementById('tab-' + tab);
        return {
          visibleCount: visible.length,
          activeVisible: active && getComputedStyle(active).display !== 'none',
          visibleIds: visible.map(p => p.id),
        };
      }, t);
      check(`V1 tab "${t}" shows its panel`, r.activeVisible, 'visible=' + JSON.stringify(r.visibleIds));
      check(`V2 tab "${t}" exactly one panel visible`, r.visibleCount === 1, 'count=' + r.visibleCount);
    }

    // ── V4 research has no hardcoded dark stylesheet ─────────────────────────
    await page.click('[data-tab="tab-research"]');
    const research = await page.evaluate(() => {
      const injected = document.getElementById('rt-styles');
      const panel = document.getElementById('tab-research');
      const bgColor = panel ? getComputedStyle(panel).backgroundColor : '';
      const node = document.querySelector('.rt-node');
      return { hasInjectedStyle: !!injected, panelBg: bgColor, hasNode: !!node };
    });
    check('V4 research drops hardcoded <style id=rt-styles>', !research.hasInjectedStyle, 'injected style still present');
    check('V4 research panel bg not legacy #0a0f1e', research.panelBg !== 'rgb(10, 15, 30)', 'bg=' + research.panelBg);
    check('V4 research nodes render', research.hasNode);

    // ── V5 no-flicker: scroll + tick preserves scrollTop and node identity ───
    const flicker = await page.evaluate(async () => {
      // The scroll container is the #tab-research panel (overflow:auto); .rt-wrap
      // is the sized inner content (position:relative, not itself scrollable).
      const scroller = document.getElementById('tab-research');
      if (!scroller) return { ok: false, reason: 'no #tab-research' };
      // Set a non-zero scroll then clamp to whatever the element actually allows,
      // so the assertion compares against the real (clamped) target, not a guess.
      scroller.scrollTop = 40; scroller.scrollLeft = 30;
      const targetTop = scroller.scrollTop;
      const targetLeft = scroller.scrollLeft;
      const firstNode = document.querySelector('.rt-node');
      firstNode.setAttribute('data-verify-tag', 'sentinel');
      // Fire a resource:change tick via the Bus with a realistic payload,
      // matching what every real emitter sends ({ resource, newValue, delta }).
      const mod = await import('../engine/state.js');
      mod.Bus.emit('resource:change', { resource: 'rp', newValue: 1, delta: 1 });
      await new Promise(r => setTimeout(r, 60));
      const stillTagged = document.querySelector('.rt-node[data-verify-tag="sentinel"]');
      return {
        ok: true,
        scrollPreserved: scroller.scrollTop === targetTop && scroller.scrollLeft === targetLeft,
        identityStable: stillTagged === firstNode,
      };
    });
    check('V5 research scroll preserved across tick', flicker.ok && flicker.scrollPreserved, flicker.reason || '');
    check('V5 research node identity stable (patch not re-render)', flicker.ok && flicker.identityStable, flicker.reason || '');

    // ── V7 class contract coverage ───────────────────────────────────────────
    const contract = await page.evaluate(() => {
      // Collect class names actually used in the live DOM under research + nav.
      const used = new Set();
      document.querySelectorAll('[class]').forEach(el => {
        el.classList.forEach(c => { if (/^(rt-|cosmic-|resource-)/.test(c)) used.add(c); });
      });
      // Collect all selectors text from loaded stylesheets.
      let cssText = '';
      for (const sheet of document.styleSheets) {
        try { for (const rule of sheet.cssRules) cssText += rule.cssText + '\n'; } catch (_) {}
      }
      // Match each class as a whole token: ".class" not followed by a class-name
      // char (letter/digit/_/-), so e.g. "rt-node" can't falsely match ".rt-node__name".
      const missing = [];
      const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      for (const c of used) {
        const re = new RegExp('\\.' + esc(c) + '(?![\\w-])');
        if (!re.test(cssText)) missing.push(c);
      }
      return { used: [...used], missing };
    });
    check('V7 every rt-/cosmic-/resource- class has a CSS rule', contract.missing.length === 0,
      'missing: ' + JSON.stringify(contract.missing));

    // ── V6 reduce-animations kill-switch ─────────────────────────────────────
    const reduce = await page.evaluate(() => {
      document.body.classList.add('reduce-animations');
      const targets = ['#cosmic-bg', '.rt-node--available', '.rt-connector--impossible'];
      const out = {};
      for (const sel of targets) {
        const el = document.querySelector(sel);
        if (!el) { out[sel] = 'absent'; continue; }
        const cs = getComputedStyle(el);
        const paused = cs.animationPlayState === 'paused';
        const durZero = cs.animationDuration === '0s' || cs.animationName === 'none';
        out[sel] = paused || durZero ? 'stopped' : 'animating(' + cs.animationName + '/' + cs.animationDuration + '/' + cs.animationPlayState + ')';
      }
      return out;
    });
    for (const [sel, state] of Object.entries(reduce)) {
      // 'absent' is acceptable (element may not exist on current realm/state);
      // only an actively-animating element is a failure.
      check(`V6 reduce-animations stops ${sel}`, state === 'stopped' || state === 'absent', state);
    }

    // ── V8 per-realm screenshots ─────────────────────────────────────────────
    await page.evaluate(() => document.body.classList.remove('reduce-animations'));
    for (const realm of REALMS) {
      await page.evaluate((r) => {
        for (const c of Array.from(document.body.classList)) if (c.startsWith('realm-')) document.body.classList.remove(c);
        document.body.classList.add('realm-' + r);
      }, realm);
      await page.click('[data-tab="tab-research"]').catch(() => {});
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(ARTIFACT_DIR, `realm-${realm}.png`), fullPage: false });
    }
    await page.evaluate(() => document.body.classList.add('reduce-animations'));
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'reduce-animations.png'), fullPage: false });
    console.log('  INFO screenshots written to tests/artifacts/');

    // ── console errors (ignore intentional dream warnings, like smoke) ───────
    const unexpected = consoleErrors.filter(t => !t.toLowerCase().includes('dream'));
    check('console clean (no unexpected errors)', unexpected.length === 0, unexpected.join(' | '));

    if (failures.length > 0) {
      console.log(`VERIFY_FAIL: ${failures.length} check(s) failed: ${failures.join(', ')}`);
      process.exit(1);
    }
    console.log('VERIFY_PASS');
    process.exit(0);
  } catch (err) {
    console.log('VERIFY_FAIL: unexpected error — ' + (err && err.stack ? err.stack : err));
    process.exit(1);
  } finally {
    if (browser) { try { await browser.close(); } catch (_) {} }
    if (server) server.close();
  }
}

main();
