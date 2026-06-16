// ui/castPanel.js — Cast/catch UI module for Cosmic Fishing.
// C0: No browser globals at module top-level. All DOM access inside functions.

import { format, formatSize } from './format.js';
import { GameState, Bus } from '../engine/state.js';
import { initiateCast, spendCrystalRewind, spendCrystalFastForward } from '../engine/gameLoop.js';
import { sellCatch, researchCatch, donateCatch } from '../engine/economy.js';
import { speciesById } from '../data/species.js';

// ─── Module state (no DOM refs here) ──────────────────────────────────────────

let _castTime = 0;          // total cast duration (set on cast:start)
let _castRemaining = 0;     // updated on cast:progress / tick
let _castActive = false;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Return the #cast-area element. */
function _castArea() {
  return document.getElementById('cast-area');
}

/** Return the #overlay-root element. */
function _overlayRoot() {
  return document.getElementById('overlay-root');
}

/** Build rarity display label (capitalise first letter). */
function _rarityLabel(rarity) {
  if (!rarity) return '';
  return rarity.charAt(0).toUpperCase() + rarity.slice(1);
}

/** Render species artwork into an element. artworkType: 'emoji' | 'css-class'. */
function _renderArtwork(artworkType, artworkRef) {
  const el = document.createElement('span');
  el.className = 'catch-artwork';
  if (artworkType === 'emoji') {
    el.textContent = artworkRef || '🐟';
  } else {
    // css-class: use an inner span with the class applied
    const inner = document.createElement('span');
    inner.className = artworkRef || '';
    el.appendChild(inner);
  }
  return el;
}

// ─── Cast progress UI ─────────────────────────────────────────────────────────

function _updateCastProgress() {
  const area = _castArea();
  if (!area) return;
  const castBtn = area.querySelector('.cast-btn');
  const progressBar = area.querySelector('.cast-progress-fill');
  const castTimeText = area.querySelector('.cast-time-text');

  if (_castActive) {
    if (castBtn) castBtn.disabled = true;
    if (progressBar) {
      const pct = _castTime > 0
        ? Math.min(100, (((_castTime - _castRemaining) / _castTime) * 100))
        : 0;
      progressBar.style.width = pct + '%';
    }
    if (castTimeText) {
      castTimeText.textContent = _castRemaining > 0
        ? `Reeling in… ${_castRemaining.toFixed(1)}s`
        : 'Catching…';
    }
  } else {
    if (castBtn) castBtn.disabled = false;
    if (progressBar) progressBar.style.width = '0%';
    if (castTimeText) castTimeText.textContent = '';
  }

  // Update time-ocean crystal buttons affordability
  _updateCrystalButtons();
}

function _updateCrystalButtons() {
  const area = _castArea();
  if (!area) return;
  const tc = (GameState.resources && GameState.resources.temporalCrystals) || 0;
  const rewindBtns = area.querySelectorAll('.btn-rewind');
  const ffBtns = area.querySelectorAll('.btn-fastforward');
  rewindBtns.forEach(b => { b.disabled = tc < 1; });
  ffBtns.forEach(b => { b.disabled = !_castActive || tc < 3; });
}

// ─── Impossible catch FX ──────────────────────────────────────────────────────

function _triggerImpossibleFX(catchObj) {
  const overlay = _overlayRoot();
  if (!overlay) return;

  // 1.5s screen freeze via a full-screen overlay
  const freeze = document.createElement('div');
  freeze.className = 'impossible-freeze-overlay';
  freeze.setAttribute('aria-live', 'assertive');
  freeze.setAttribute('role', 'alert');

  const text = document.createElement('div');
  text.className = 'impossible-freeze-text';
  text.textContent = `IMPOSSIBLE CATCH: ${catchObj.name}`;
  freeze.appendChild(text);

  overlay.appendChild(freeze);

  setTimeout(() => {
    if (freeze.parentNode) freeze.parentNode.removeChild(freeze);
  }, 1500);
}

// ─── Catch card rendering ─────────────────────────────────────────────────────

/**
 * Render a .catch-result card into #cast-area.
 * AC-013 requires the class name .catch-result.
 */
function _renderCatchCard(catchObj) {
  const area = _castArea();
  if (!area) return;

  // Remove any existing catch card(s)
  area.querySelectorAll('.catch-result').forEach(el => el.remove());

  const card = document.createElement('div');
  card.className = `catch-result rarity-${catchObj.rarity || 'common'}`;
  if (catchObj.isImpossible) card.classList.add('catch-impossible');
  if (catchObj.isNewDiscovery) card.classList.add('catch-new-discovery');
  card.classList.add(`catch-result--${catchObj.rarity || 'common'}`);

  // ── Scrollable upper content (artwork → lore) ────────────────────────────
  const scrollEl = document.createElement('div');
  scrollEl.className = 'catch-scroll';

  // ── Artwork ──────────────────────────────────────────────────────────────
  const species = speciesById(catchObj.speciesId);
  const artType = species ? species.artworkType : 'emoji';
  const artRef  = species ? species.artworkRef  : '🐟';
  scrollEl.appendChild(_renderArtwork(artType, artRef));

  // ── Name + rarity badge ───────────────────────────────────────────────────
  const nameRow = document.createElement('div');
  nameRow.className = 'catch-name-row';

  const nameEl = document.createElement('span');
  nameEl.className = 'catch-name';
  nameEl.textContent = catchObj.name || 'Unknown';

  const rarityBadge = document.createElement('span');
  rarityBadge.className = `catch-rarity-badge rarity-${catchObj.rarity || 'common'}`;
  rarityBadge.textContent = _rarityLabel(catchObj.rarity);

  nameRow.appendChild(nameEl);
  nameRow.appendChild(rarityBadge);
  scrollEl.appendChild(nameRow);

  // ── Stats row: size + value ───────────────────────────────────────────────
  const statsRow = document.createElement('div');
  statsRow.className = 'catch-stats-row';

  const sizeEl = document.createElement('span');
  sizeEl.className = 'catch-size';
  sizeEl.textContent = `Size: ${formatSize(catchObj.size)}`;

  const valueEl = document.createElement('span');
  valueEl.className = 'catch-value';
  // AC-003: display === catch.sellValue exactly
  valueEl.textContent = `Value: ${format(catchObj.sellValue)} gold`;

  statsRow.appendChild(sizeEl);
  statsRow.appendChild(valueEl);
  scrollEl.appendChild(statsRow);

  // ── Trait ─────────────────────────────────────────────────────────────────
  if (catchObj.trait) {
    const traitEl = document.createElement('div');
    traitEl.className = 'catch-trait';
    traitEl.textContent = `Trait: ${catchObj.trait}`;
    scrollEl.appendChild(traitEl);
  }

  // ── New discovery label ───────────────────────────────────────────────────
  if (catchObj.isNewDiscovery) {
    const newEl = document.createElement('div');
    newEl.className = 'catch-new-label';
    newEl.textContent = 'New Discovery!';
    scrollEl.appendChild(newEl);
  }

  // ── Action buttons ────────────────────────────────────────────────────────
  const btnRow = document.createElement('div');
  btnRow.className = 'catch-btn-row';

  // Sell
  const sellBtn = document.createElement('button');
  sellBtn.className = 'catch-action-btn btn-sell';
  sellBtn.textContent = `Sell (${format(catchObj.sellValue)} g)`;
  sellBtn.addEventListener('click', () => _handleSell(catchObj, card, dismissTimer));

  // Research
  const researchBtn = document.createElement('button');
  researchBtn.className = 'catch-action-btn btn-research';
  researchBtn.textContent = 'Research';
  researchBtn.addEventListener('click', () => _handleResearch(catchObj, card, dismissTimer));

  btnRow.appendChild(sellBtn);
  btnRow.appendChild(researchBtn);

  // Donate — only after Ocean unlocked (A-013)
  const oceanUnlocked = GameState.unlockedRealms &&
    GameState.unlockedRealms.includes('ocean');
  if (oceanUnlocked) {
    const donateBtn = document.createElement('button');
    donateBtn.className = 'catch-action-btn btn-donate';
    donateBtn.textContent = 'Donate';
    donateBtn.addEventListener('click', () => _handleDonate(catchObj, card, dismissTimer));
    btnRow.appendChild(donateBtn);
  }

  // Time Ocean crystal buttons (FR-026)
  const isTimeOcean = GameState.currentRealm === 'time_ocean';
  if (isTimeOcean) {
    const rewindBtn = document.createElement('button');
    rewindBtn.className = 'catch-action-btn btn-rewind';
    rewindBtn.title = 'Rewind: spend 1 Temporal Crystal to re-roll this catch';
    rewindBtn.textContent = 'Rewind (1 TC)';
    const tc = (GameState.resources && GameState.resources.temporalCrystals) || 0;
    rewindBtn.disabled = tc < 1;
    rewindBtn.addEventListener('click', () => {
      clearTimeout(dismissTimer.id);
      spendCrystalRewind(catchObj);
      // catch:new will be emitted by the engine; card is replaced there
    });

    const ffBtn = document.createElement('button');
    ffBtn.className = 'catch-action-btn btn-fastforward';
    ffBtn.title = 'Fast-forward: spend 3 Temporal Crystals to complete the cast timer';
    ffBtn.textContent = 'Fast-Forward (3 TC)';
    ffBtn.disabled = tc < 3;
    ffBtn.addEventListener('click', () => {
      spendCrystalFastForward();
    });

    btnRow.appendChild(rewindBtn);
    btnRow.appendChild(ffBtn);
  }

  // ── Lore ──────────────────────────────────────────────────────────────────
  if (species && species.lore) {
    const loreEl = document.createElement('div');
    loreEl.className = 'catch-lore';
    loreEl.textContent = species.lore;
    scrollEl.appendChild(loreEl);
  }

  card.appendChild(scrollEl);
  card.appendChild(btnRow);

  // ── 15s auto-dismiss → auto-Sell (A-003) ─────────────────────────────────
  const dismissTimer = { id: null };
  const AUTO_DISMISS_MS = 15000;

  const timerBar = document.createElement('div');
  timerBar.className = 'catch-dismiss-bar';
  const timerFill = document.createElement('div');
  timerFill.className = 'catch-dismiss-fill';
  timerFill.style.width = '100%';
  timerBar.appendChild(timerFill);
  card.appendChild(timerBar);

  // Animate the shrink
  const startTime = Date.now();
  function _animateDismiss() {
    if (!card.parentNode) return;
    const elapsed = Date.now() - startTime;
    const remaining = Math.max(0, AUTO_DISMISS_MS - elapsed);
    timerFill.style.width = ((remaining / AUTO_DISMISS_MS) * 100) + '%';
    if (remaining > 0) {
      requestAnimationFrame(_animateDismiss);
    }
  }
  requestAnimationFrame(_animateDismiss);

  dismissTimer.id = setTimeout(() => {
    if (card.parentNode) {
      sellCatch(catchObj);
      card.remove();
    }
  }, AUTO_DISMISS_MS);

  area.appendChild(card);
}

// ─── Action handlers ──────────────────────────────────────────────────────────

function _handleSell(catchObj, card, dismissTimer) {
  clearTimeout(dismissTimer.id);
  sellCatch(catchObj);
  if (card.parentNode) card.remove();
}

function _handleResearch(catchObj, card, dismissTimer) {
  clearTimeout(dismissTimer.id);
  researchCatch(catchObj);
  if (card.parentNode) card.remove();
}

function _handleDonate(catchObj, card, dismissTimer) {
  clearTimeout(dismissTimer.id);
  donateCatch(catchObj);
  if (card.parentNode) card.remove();
}

// ─── Main init ────────────────────────────────────────────────────────────────

/**
 * initCastPanel() — mount the cast/catch UI into #cast-area.
 * Called once by main.js after DOM is ready. (C5 / FR-001..008, AC-013)
 */
export function initCastPanel() {
  const area = _castArea();
  if (!area) return;

  // ── Build cast controls ───────────────────────────────────────────────────
  const castControls = document.createElement('div');
  castControls.className = 'cast-controls';

  const castBtn = document.createElement('button');
  castBtn.className = 'cast-btn';
  castBtn.textContent = 'Cast Line';
  castBtn.addEventListener('click', () => {
    if (!_castActive) initiateCast();
  });

  const progressWrap = document.createElement('div');
  progressWrap.className = 'cast-progress-bar';
  const progressFill = document.createElement('div');
  progressFill.className = 'cast-progress-fill';
  progressFill.style.width = '0%';
  progressWrap.appendChild(progressFill);

  const castTimeText = document.createElement('div');
  castTimeText.className = 'cast-time-text';

  castControls.appendChild(castBtn);
  castControls.appendChild(progressWrap);
  castControls.appendChild(castTimeText);
  area.appendChild(castControls);

  // ── Bus subscriptions ─────────────────────────────────────────────────────

  // cast:start — record total cast time, activate UI
  Bus.on('cast:start', ({ castTime }) => {
    _castTime = castTime || 3;
    _castRemaining = _castTime;
    _castActive = true;
    _updateCastProgress();
  });

  // cast:progress — update remaining time
  Bus.on('cast:progress', ({ remaining }) => {
    _castRemaining = remaining;
    if (_castActive) _updateCastProgress();
  });

  // tick — keep progress smooth + reset active flag when cast ends
  Bus.on('tick', ({ castActive, castRemaining }) => {
    _castActive = castActive;
    if (_castActive) {
      _castRemaining = castRemaining;
    } else if (_castRemaining !== 0) {
      _castRemaining = 0;
    }
    _updateCastProgress();
  });

  // resource:change — keep TC button affordability live
  Bus.on('resource:change', (payload) => {
    if (payload && payload.resource === 'temporalCrystals') _updateCrystalButtons();
  });

  // catch:new — render catch card (C1)
  Bus.on('catch:new', (catchObj) => {
    _castActive = false;
    _castRemaining = 0;
    _updateCastProgress();

    // WOW#4: Impossible catch FX (FR-052)
    if (catchObj.isImpossible) {
      _triggerImpossibleFX(catchObj);
    }

    _renderCatchCard(catchObj);

    // WOW#1 / FR-008: first-ever catch → auto-open encyclopedia + new-discovery animation
    if (catchObj.isNewDiscovery) {
      Bus.emit('ui:open-tab', { tab: 'encyclopedia' });
    }
  });
}
