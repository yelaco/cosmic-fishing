// ui/realmPanel.js — Realm selector UI for Cosmic Fishing (T21)
// FR-020..027, WOW#2 (Pond→Ocean), WOW#5 (Dream Sea glitch driver A-010 C6)
//
// C0 NODE-SAFETY: no top-level browser globals. All DOM/timer access is inside
// functions called at runtime in the browser. node --check passes on this file.

import { format } from './format.js';
import { GameState, Bus } from '../engine/state.js';
import { getRealms, canUnlock, transitionTo, realmCompletionPct, LORE_FLASH } from '../engine/realms.js';

// ── Dream Sea Glitch Driver (WOW#5, A-010, C6 — OWNED BY THIS MODULE) ────────
// Interval handle; null when not in dream_sea. Stored at module scope so
// clearGlitch() can always reach it.
let _glitchInterval = null;

function startGlitch() {
  if (typeof setInterval === 'undefined') return;
  clearGlitch(); // guard double-start

  function applyGlitch() {
    try {
      const root = typeof document !== 'undefined' ? document.getElementById('app') || document.body : null;
      if (!root) return;
      root.classList.add('dream-sea-glitch');
      setTimeout(() => {
        try { root.classList.remove('dream-sea-glitch'); } catch (_) { /* noop */ }
      }, 2000);
    } catch (_) { /* noop */ }
  }

  function scheduleNext() {
    if (_glitchInterval === null) return; // was cleared
    const delay = 15000 + Math.random() * 15000; // 15–30 s
    _glitchInterval = setTimeout(() => {
      applyGlitch();
      scheduleNext();
    }, delay);
  }

  // Use a sentinel truthy value before the first real timeout id
  _glitchInterval = true;
  scheduleNext();
}

function clearGlitch() {
  if (_glitchInterval !== null && _glitchInterval !== true) {
    if (typeof clearTimeout !== 'undefined') clearTimeout(_glitchInterval);
  }
  _glitchInterval = null;
  // Remove the class if it was stuck on
  try {
    if (typeof document !== 'undefined') {
      const root = document.getElementById('app') || document.body;
      if (root) root.classList.remove('dream-sea-glitch');
    }
  } catch (_) { /* noop */ }
}

// ── Lore flash ────────────────────────────────────────────────────────────────
function showLoreFlash(text) {
  try {
    if (typeof document === 'undefined') return;
    let el = document.getElementById('lore-flash');
    if (!el) {
      el = document.createElement('div');
      el.id = 'lore-flash';
      el.className = 'lore-flash';
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.classList.remove('lore-flash--visible');
    // Force reflow
    void el.offsetWidth;
    el.classList.add('lore-flash--visible');
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => {
      try { el.classList.remove('lore-flash--visible'); } catch (_) { /* noop */ }
    }, 3500);
  } catch (_) { /* noop */ }
}

// ── Realm body class ──────────────────────────────────────────────────────────
function applyRealmBodyClass(realmId) {
  try {
    if (typeof document === 'undefined') return;
    // Remove any previous realm-* class
    document.body.className = document.body.className
      .split(' ')
      .filter(c => !c.startsWith('realm-'))
      .concat(`realm-${realmId}`)
      .join(' ')
      .trim();
  } catch (_) { /* noop */ }
}

// ── Card rendering ────────────────────────────────────────────────────────────
function realmCardHTML(realm) {
  const completionPct = realmCompletionPct(realm.id, GameState);
  const pctDisplay = completionPct.toFixed(1);

  // Special teaser card for cosmic_void when locked (FR-027)
  if (realm.id === 'cosmic_void' && !realm.unlocked) {
    return `
      <div class="realm-card realm-card--locked realm-card--teaser" data-realm="${realm.id}">
        <div class="realm-card__header">
          <span class="realm-card__name">${escHtml(realm.name)}</span>
          <span class="realm-card__badge realm-card__badge--teaser">Multiverse Teaser</span>
        </div>
        <p class="realm-card__teaser-text">
          Beyond the Cosmic Void lies the Multiverse — infinite realities, each with their own fish,
          their own physics, their own impossible species. This expansion is not yet charted.
          Reach the Cosmic Void to glimpse what lies beyond.
        </p>
        <div class="realm-card__unmet">
          ${realm.unmet.map(u => `<div class="realm-card__unmet-item">${escHtml(u)}</div>`).join('')}
        </div>
      </div>`;
  }

  const statusClass = realm.active
    ? 'realm-card--active'
    : realm.unlocked
      ? 'realm-card--unlocked'
      : 'realm-card--locked';

  const statusBadge = realm.active
    ? '<span class="realm-card__badge realm-card__badge--active">Current Realm</span>'
    : realm.unlocked
      ? '<span class="realm-card__badge realm-card__badge--unlocked">Unlocked</span>'
      : '<span class="realm-card__badge realm-card__badge--locked">Locked</span>';

  const canSail = !realm.active && realm.canUnlock;
  const sailBtn = !realm.active
    ? `<button
        class="realm-card__sail-btn${canSail ? '' : ' realm-card__sail-btn--disabled'}"
        data-realm-sail="${escHtml(realm.id)}"
        ${canSail ? '' : 'disabled'}
        title="${canSail ? `Set sail to ${escHtml(realm.name)}` : 'Requirements not met'}"
      >Set Sail</button>`
    : '';

  // Dream Sea reality instability indicator (FR-025)
  const instability = realm.id === 'dream_sea'
    ? '<div class="realm-card__instability" title="Reality Instability Active"><span class="realm-card__instability-icon">~</span> Reality unstable</div>'
    : '';

  const completionBar = realm.unlocked
    ? `<div class="realm-card__completion">
        <div class="realm-card__completion-label">Discovered: ${pctDisplay}%</div>
        <div class="realm-card__completion-bar">
          <div class="realm-card__completion-fill" style="width:${pctDisplay}%"></div>
        </div>
      </div>`
    : '';

  const unmetList = !realm.unlocked && realm.unmet.length > 0
    ? `<div class="realm-card__unmet">
        ${realm.unmet.map(u => `<div class="realm-card__unmet-item">${escHtml(u)}</div>`).join('')}
      </div>`
    : '';

  return `
    <div class="realm-card ${statusClass}" data-realm="${realm.id}">
      <div class="realm-card__header">
        <span class="realm-card__name">${escHtml(realm.name)}</span>
        ${statusBadge}
      </div>
      ${instability}
      ${completionBar}
      ${unmetList}
      ${sailBtn}
    </div>`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderCards(container) {
  try {
    const realms = getRealms(GameState);
    container.innerHTML = realms.map(realmCardHTML).join('');
  } catch (_) { /* noop */ }
}

// ── Event delegation ──────────────────────────────────────────────────────────
function handleSailClick(e) {
  try {
    const btn = e.target.closest('[data-realm-sail]');
    if (!btn || btn.disabled) return;
    const realmId = btn.dataset.realmSail;
    if (!realmId) return;
    const check = canUnlock(realmId, GameState);
    if (!check.ok) return;
    transitionTo(realmId); // emits realm:change → our Bus handler re-renders
  } catch (_) { /* noop */ }
}

// ── Bus: realm:change ─────────────────────────────────────────────────────────
function onRealmChange(payload, container) {
  try {
    const to = (payload && payload.to) || (payload && payload.realm) || GameState.currentRealm;

    // Body class
    applyRealmBodyClass(to);

    // WOW#2: narrative lore flash on every realm transition (esp. Pond→Ocean)
    const from = payload && payload.from;
    if (from && from !== to) {
      const loreText = LORE_FLASH[to] || `You enter the ${to}.`;
      showLoreFlash(loreText);
    }

    // Glitch driver (C6): start on dream_sea, clear on any other realm
    if (to === 'dream_sea') {
      startGlitch();
    } else {
      clearGlitch();
    }

    // Transition animation on container
    container.classList.add('realm-panel--transitioning');
    setTimeout(() => {
      try { container.classList.remove('realm-panel--transitioning'); } catch (_) { /* noop */ }
    }, 600);

    // Re-render cards
    renderCards(container);
  } catch (_) { /* noop */ }
}

// ── Public API ────────────────────────────────────────────────────────────────
/**
 * initRealmPanel() — mount the realm selector into #realm-panel.
 * Must be called once the DOM is ready. Engine calls only; never mutates GameState.
 */
export function initRealmPanel() {
  if (typeof document === 'undefined') return;

  const panel = document.getElementById('realm-panel');
  if (!panel) return;

  // Initial body class
  applyRealmBodyClass(GameState.currentRealm);

  // If we're already in dream_sea on init, start glitch driver
  if (GameState.currentRealm === 'dream_sea') {
    startGlitch();
  }

  // Initial render
  renderCards(panel);

  // Delegation for Set Sail buttons
  panel.addEventListener('click', handleSailClick);

  // Subscribe to realm:change
  Bus.on('realm:change', payload => onRealmChange(payload, panel));
}
