// ui/ascensionTab.js — Ascension Tab (T27, FR-090..095, WOW#3)
// C0: no top-level browser globals. All DOM access inside initAscensionTab().

import { format, formatTime } from './format.js';
import { GameState, Bus } from '../engine/state.js';
import { canAscend, executeAscension, getMemoryChoices } from '../engine/ascension.js';
import cosmicMemoriesData from '../data/cosmicMemories.js';

// Build a lookup map for memory records (id → record) from the 8 canonical entries.
const MEMORY_MAP = new Map(cosmicMemoriesData.map(m => [m.id, m]));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveMemories(ids) {
  return (ids ?? []).map(id => MEMORY_MAP.get(id)).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Section renderers — return DOM nodes
// ---------------------------------------------------------------------------

function renderCountSection(count) {
  const el = document.createElement('section');
  el.className = 'ascension-section ascension-count-section';
  el.innerHTML = `
    <h2 class="ascension-section-title">Ascension</h2>
    <p class="ascension-count">
      Times Ascended: <strong>${count}</strong>
    </p>
  `;
  return el;
}

function renderRequirementsSection(unmet) {
  const el = document.createElement('section');
  el.className = 'ascension-section ascension-requirements-section';

  if (unmet.length === 0) {
    el.innerHTML = `
      <h3 class="ascension-section-title">Requirements</h3>
      <p class="ascension-req ascension-req--met">All requirements met.</p>
    `;
  } else {
    const items = unmet
      .map(u => `<li class="ascension-req ascension-req--unmet">${u}</li>`)
      .join('');
    el.innerHTML = `
      <h3 class="ascension-section-title">Requirements</h3>
      <ul class="ascension-req-list">${items}</ul>
    `;
  }
  return el;
}

function renderMemoriesSection(ownedIds) {
  const el = document.createElement('section');
  el.className = 'ascension-section ascension-memories-section';

  const records = resolveMemories(ownedIds);

  let body;
  if (records.length === 0) {
    body = '<p class="ascension-empty">No Cosmic Memories yet.</p>';
  } else {
    // Count duplicates for display.
    const counts = {};
    for (const id of ownedIds) counts[id] = (counts[id] ?? 0) + 1;
    const seen = new Set();
    const cards = records
      .filter(m => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      })
      .map(m => {
        const qty = counts[m.id] > 1 ? ` <span class="memory-qty">×${counts[m.id]}</span>` : '';
        return `
          <div class="memory-card" title="${m.loreText}" data-tip="${m.loreText}">
            <span class="memory-name">${m.name}${qty}</span>
            <span class="memory-effect">${m.effectDescription}</span>
          </div>`;
      })
      .join('');
    body = `<div class="memory-grid">${cards}</div>`;
  }

  el.innerHTML = `<h3 class="ascension-section-title">Cosmic Memories</h3>${body}`;
  return el;
}

function renderLoreSection(fragments) {
  const el = document.createElement('section');
  el.className = 'ascension-section ascension-lore-section';

  let body;
  if (!fragments || fragments.length === 0) {
    body = '<p class="ascension-empty">No lore unlocked yet.</p>';
  } else {
    const items = fragments
      .map((f, i) => `<li class="lore-fragment"><span class="lore-index">${i + 1}.</span> ${f}</li>`)
      .join('');
    body = `<ul class="lore-list">${items}</ul>`;
  }

  el.innerHTML = `<h3 class="ascension-section-title">Lore Fragments</h3>${body}`;
  return el;
}

function renderStatsSection(state) {
  const s = state.statistics ?? {};
  const playtime = formatTime(s.playtimeSeconds ?? 0);
  const totalCasts = format(s.totalCasts ?? 0);
  const totalFish = format(s.totalFishCaught ?? 0);
  const lifetimeGold = format(state.lifetimeGoldEarned ?? 0);
  const lifetimeCasts = format(state.lifetimeCastCount ?? 0);

  const el = document.createElement('section');
  el.className = 'ascension-section ascension-stats-section';
  el.innerHTML = `
    <h3 class="ascension-section-title">Lifetime Stats</h3>
    <ul class="ascension-stats-list">
      <li>Lifetime Gold Earned: <strong>${lifetimeGold}</strong></li>
      <li>Lifetime Casts: <strong>${lifetimeCasts}</strong></li>
      <li>Total Fish Caught: <strong>${totalFish}</strong></li>
      <li>Total Casts (this run): <strong>${totalCasts}</strong></li>
      <li>Playtime: <strong>${playtime}</strong></li>
    </ul>
  `;
  return el;
}

// ---------------------------------------------------------------------------
// Cinematic implosion overlay
// ---------------------------------------------------------------------------

function showImplosionOverlay(onComplete) {
  const root = document.getElementById('overlay-root');
  if (!root) { onComplete(); return; }

  const overlay = document.createElement('div');
  overlay.id = 'ascension-implosion-overlay';
  overlay.className = 'ascension-implosion-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Ascension ritual');
  overlay.innerHTML = `
    <div class="implosion-core">
      <div class="implosion-ring implosion-ring--1"></div>
      <div class="implosion-ring implosion-ring--2"></div>
      <div class="implosion-ring implosion-ring--3"></div>
      <p class="implosion-text">The universe folds inward...</p>
    </div>
  `;

  root.appendChild(overlay);

  // After 1.8 s cinematic, remove overlay and proceed.
  const timer = setTimeout(() => {
    overlay.remove();
    onComplete();
  }, 1800);

  // Allow early skip via click.
  overlay.addEventListener('click', () => {
    clearTimeout(timer);
    overlay.remove();
    onComplete();
  }, { once: true });
}

// ---------------------------------------------------------------------------
// Memory selector overlay
// ---------------------------------------------------------------------------

function showMemorySelector(onPick) {
  const root = document.getElementById('overlay-root');
  if (!root) { onPick(null); return; }

  const choices = getMemoryChoices();

  const overlay = document.createElement('div');
  overlay.id = 'ascension-memory-overlay';
  overlay.className = 'ascension-memory-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Choose a Cosmic Memory');

  const cards = choices.map(m => `
    <button class="memory-choice-card" data-memory-id="${m.id}"
            title="${m.loreText}" data-tip="${m.loreText}">
      <span class="memory-choice-name">${m.name}</span>
      <span class="memory-choice-effect">${m.effectDescription}</span>
      <span class="memory-choice-lore">${m.loreText}</span>
    </button>
  `).join('');

  overlay.innerHTML = `
    <div class="memory-selector-panel">
      <h2 class="memory-selector-title">Choose Your Cosmic Memory</h2>
      <p class="memory-selector-hint">This memory carries across all future runs.</p>
      <div class="memory-choice-grid">${cards}</div>
    </div>
  `;

  root.appendChild(overlay);

  overlay.addEventListener('click', e => {
    const btn = e.target.closest('button.memory-choice-card');
    if (!btn) return;
    const memoryId = btn.dataset.memoryId;
    overlay.remove();
    onPick(memoryId);
  });
}

// ---------------------------------------------------------------------------
// Ascend button
// ---------------------------------------------------------------------------

function renderAscendButton(ok) {
  const btn = document.createElement('button');
  btn.className = 'ascend-btn';
  btn.dataset.action = 'ascend';
  btn.textContent = 'ASCEND';
  btn.disabled = !ok;
  if (!ok) {
    btn.title = 'Requirements not yet met';
    btn.setAttribute('data-tip', 'Requirements not yet met');
  }
  return btn;
}

// ---------------------------------------------------------------------------
// Full render
// ---------------------------------------------------------------------------

function renderTab(container) {
  container.innerHTML = '';

  const check = canAscend(GameState);
  const count = GameState.ascensionCount ?? 0;
  const ownedIds = GameState.resources.cosmicMemories ?? [];
  const lore = GameState.ascensionLoreUnlocked ?? [];

  container.appendChild(renderCountSection(count));
  container.appendChild(renderRequirementsSection(check.unmet));
  container.appendChild(renderAscendButton(check.ok));
  container.appendChild(renderMemoriesSection(ownedIds));
  container.appendChild(renderLoreSection(lore));
  container.appendChild(renderStatsSection(GameState));
}

// ---------------------------------------------------------------------------
// Ascension flow triggered by button click
// ---------------------------------------------------------------------------

function handleAscendClick(container) {
  // Re-check at click time — state may have changed since last render.
  const check = canAscend(GameState);
  if (!check.ok) return;

  // Disable button immediately to prevent double-click.
  const btn = container.querySelector('button.ascend-btn[data-action="ascend"]');
  if (btn) btn.disabled = true;

  showImplosionOverlay(() => {
    showMemorySelector(memoryId => {
      if (!memoryId) {
        // User somehow closed without picking — re-render to restore button state.
        renderTab(container);
        return;
      }
      // executeAscension emits ascension:begin and ascension:complete internally.
      // Our Bus subscriptions will re-render the tab once those fire.
      executeAscension(memoryId);
    });
  });
}

// ---------------------------------------------------------------------------
// Public export (C3 / C5)
// ---------------------------------------------------------------------------

export function initAscensionTab() {
  const container = document.getElementById('tab-ascension');
  if (!container) return;

  renderTab(container);

  // Delegate ascend button clicks (never mutates GameState directly — C3).
  container.addEventListener('click', e => {
    const btn = e.target.closest('button.ascend-btn[data-action="ascend"]');
    if (!btn || btn.disabled) return;
    handleAscendClick(container);
  });

  // Re-render on ascension lifecycle events.
  const rerender = () => renderTab(container);
  Bus.on('ascension:begin', rerender);
  Bus.on('ascension:complete', rerender);

  // Also re-render when underlying resources change (requirements may flip).
  Bus.on('resource:change', rerender);
  Bus.on('upgrade:purchased', rerender);
  Bus.on('research:complete', rerender);
  Bus.on('realm:change', rerender);
}
