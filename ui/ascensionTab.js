// ui/ascensionTab.js — Ascension Tab (T27, FR-090..095, WOW#3)
// C0: no top-level browser globals. All DOM access inside initAscensionTab().

import { format, formatTime } from './format.js';
import { GameState, Bus } from '../engine/state.js';
import { canAscend, executeAscension, getMemoryChoices } from '../engine/ascension.js';
import { openCardDetail, bindCardGrid } from './cardDetail.js';
import cosmicMemoriesData from '../data/cosmicMemories.js';

// Build a lookup map for memory records (id → record) from the 8 canonical entries.
const MEMORY_MAP = new Map(cosmicMemoriesData.map(m => [m.id, m]));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveMemories(ids) {
  return (ids ?? []).map(id => MEMORY_MAP.get(id)).filter(Boolean);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// resolveDetail — called by bindCardGrid for both memory and lore cards.
function resolveDetail(id, kind) {
  if (kind === 'memory') {
    const m = MEMORY_MAP.get(id);
    if (!m) return null;
    return {
      title: m.name,
      chipHtml: '<span aria-hidden="true">🧠</span>',
      bodyHtml:
        `<p class="card-detail__effect">${escHtml(m.effectDescription)}</p>` +
        `<p class="card-detail__lore">${escHtml(m.loreText)}</p>`,
      rarityClass: '',
    };
  }
  if (kind === 'lore') {
    // id is the fragment index (0-based string)
    const idx = parseInt(id, 10);
    const lore = GameState.ascensionLoreUnlocked ?? [];
    const fragment = lore[idx];
    if (fragment == null) return null;
    return {
      title: `Lore Fragment ${idx + 1}`,
      chipHtml: '<span aria-hidden="true">📜</span>',
      bodyHtml: `<p class="card-detail__lore">${escHtml(fragment)}</p>`,
      rarityClass: '',
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Section renderers — return DOM nodes
// ---------------------------------------------------------------------------

function renderCountSection(count) {
  const el = document.createElement('section');
  el.className = 'ascension-section ascension-count-section';

  const tile = document.createElement('div');
  tile.className = 'stat-tile';
  tile.innerHTML =
    `<span class="stat-number">${escHtml(String(count))}</span>` +
    `<span class="stat-desc">Times Ascended</span>`;

  el.appendChild(tile);
  return el;
}

function renderRequirementsSection(unmet) {
  const el = document.createElement('section');
  el.className = 'ascension-section ascension-requirements-section';

  const heading = document.createElement('h3');
  heading.className = 'ascension-section-title';
  heading.textContent = 'Requirements';
  el.appendChild(heading);

  const row = document.createElement('div');
  row.className = 'ascension-req-chips';

  if (unmet.length === 0) {
    const chip = document.createElement('span');
    chip.className = 'ascension-req-chip ascension-req-chip--met';
    chip.textContent = '✓ All requirements met';
    row.appendChild(chip);
  } else {
    for (const u of unmet) {
      const chip = document.createElement('span');
      chip.className = 'ascension-req-chip ascension-req-chip--unmet';
      chip.textContent = u;
      row.appendChild(chip);
    }
  }

  el.appendChild(row);
  return el;
}

function renderMemoriesSection(ownedIds) {
  const el = document.createElement('section');
  el.className = 'ascension-section ascension-memories-section';

  const heading = document.createElement('h3');
  heading.className = 'ascension-section-title';
  heading.textContent = 'Cosmic Memories';
  el.appendChild(heading);

  const records = resolveMemories(ownedIds);

  if (records.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'ascension-empty';
    empty.textContent = 'No Cosmic Memories yet.';
    el.appendChild(empty);
    return el;
  }

  // Count duplicates for display.
  const counts = {};
  for (const id of ownedIds) counts[id] = (counts[id] ?? 0) + 1;

  const seen = new Set();
  const grid = document.createElement('div');
  grid.className = 'game-grid';

  for (const m of records) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);

    const card = document.createElement('div');
    card.className = 'game-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.dataset.detailId = m.id;
    card.dataset.detailKind = 'memory';

    const qty = counts[m.id] > 1
      ? `<span class="status-badge status-badge--owned">×${counts[m.id]}</span>`
      : '';

    card.innerHTML =
      `<div class="game-card__chip" aria-hidden="true">🧠</div>` +
      `<div class="game-card__name">${escHtml(m.name)}${qty}</div>` +
      `<div class="game-card__stat">${escHtml(m.effectDescription)}</div>`;

    grid.appendChild(card);
  }

  el.appendChild(grid);
  return el;
}

function renderLoreSection(fragments) {
  const el = document.createElement('section');
  el.className = 'ascension-section ascension-lore-section';

  const heading = document.createElement('h3');
  heading.className = 'ascension-section-title';
  heading.textContent = 'Lore Fragments';
  el.appendChild(heading);

  if (!fragments || fragments.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'ascension-empty';
    empty.textContent = 'No lore unlocked yet.';
    el.appendChild(empty);
    return el;
  }

  const grid = document.createElement('div');
  grid.className = 'game-grid';

  fragments.forEach((f, i) => {
    const card = document.createElement('div');
    card.className = 'game-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.dataset.detailId = String(i);
    card.dataset.detailKind = 'lore';

    // Truncate for stat line: show up to ~80 chars + ellipsis
    const preview = f.length > 80 ? f.slice(0, 77) + '…' : f;

    card.innerHTML =
      `<div class="game-card__chip" aria-hidden="true">📜</div>` +
      `<div class="game-card__name">Fragment ${i + 1}</div>` +
      `<div class="game-card__stat">${escHtml(preview)}</div>`;

    grid.appendChild(card);
  });

  el.appendChild(grid);
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

  const heading = document.createElement('h3');
  heading.className = 'ascension-section-title';
  heading.textContent = 'Lifetime Stats';
  el.appendChild(heading);

  const grid = document.createElement('div');
  grid.className = 'ascension-stats-grid';

  const stats = [
    { icon: '💰', label: 'Lifetime Gold', value: lifetimeGold },
    { icon: '🎯', label: 'Lifetime Casts', value: lifetimeCasts },
    { icon: '🐟', label: 'Total Fish', value: totalFish },
    { icon: '⟳', label: 'Total Casts', value: totalCasts },
    { icon: '⏱️', label: 'Playtime', value: playtime },
  ];

  for (const { icon, label, value } of stats) {
    const tile = document.createElement('div');
    tile.className = 'stat-tile';
    tile.innerHTML =
      `<span class="stat-number">${icon} ${escHtml(value)}</span>` +
      `<span class="stat-desc">${escHtml(label)}</span>`;
    grid.appendChild(tile);
  }

  el.appendChild(grid);
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

  // Bind card-grid detail handler once (idempotent via dataset flag).
  bindCardGrid(container, resolveDetail);

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
