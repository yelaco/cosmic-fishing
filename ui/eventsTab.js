// ui/eventsTab.js — Events tab + #event-banner owner (T26, FR-083..084)
// C0: no browser globals at top level. All DOM access inside functions.
// OWNS: #event-banner + body event CSS class (C6). T31 does NOT duplicate.

import { formatTime } from './format.js';
import { GameState, Bus } from '../engine/state.js';
import { getActiveEvent, getActiveEventEffects } from '../engine/events_engine.js';
import EVENTS from '../data/events.js';

// Pre-index event definitions by id for fast lookup.
const EVENT_BY_ID = Object.fromEntries(EVENTS.map(e => [e.id, e]));

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------
let _tickHandle = null;
let _currentBodyClass = null; // tracks the class we applied so we can remove it

// ---------------------------------------------------------------------------
// Banner helpers (owned here — C6)
// ---------------------------------------------------------------------------

function _showBanner(eventId) {
  const banner = document.getElementById('event-banner');
  if (!banner) return;
  const def = EVENT_BY_ID[eventId];
  banner.textContent = def ? def.name : eventId;
  banner.hidden = false;

  // Apply body event CSS class.
  if (_currentBodyClass) {
    document.body.classList.remove(_currentBodyClass);
  }
  _currentBodyClass = def ? def.cssClass : null;
  if (_currentBodyClass) {
    document.body.classList.add(_currentBodyClass);
  }
}

function _hideBanner() {
  const banner = document.getElementById('event-banner');
  if (banner) banner.hidden = true;
  if (_currentBodyClass) {
    document.body.classList.remove(_currentBodyClass);
    _currentBodyClass = null;
  }
}

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

function _effectDescription(effects) {
  if (!effects || effects.length === 0) return 'No active effects.';
  return effects.map(ef => {
    switch (ef.type) {
      case 'gold_multiplier':           return `Gold x${ef.value}`;
      case 'rarity_weight_bonus':       return `+${ef.value} rarity weight`;
      case 'cast_time_multiplier':      return `Cast time x${ef.value}`;
      case 'void_shard_rate_bonus':     return `+${ef.value * 100}% void shard chance`;
      case 'temporal_crystal_rate_bonus': return `+${ef.value * 100}% temporal crystal chance`;
      default:                          return `${ef.type}: ${ef.value}`;
    }
  }).join(' · ');
}

function _renderActive(container) {
  const active = getActiveEvent();
  if (!active) return false;

  const def = EVENT_BY_ID[active.id];
  const effects = getActiveEventEffects();
  const exclusive = def && def.exclusiveSpecies && def.exclusiveSpecies.length > 0
    ? def.exclusiveSpecies.join(', ')
    : null;

  container.innerHTML = `
    <div class="event-active">
      <h3 class="event-name">${def ? def.name : active.id}</h3>
      <p class="event-description">${def ? def.description : ''}</p>
      <div class="event-effects">${_effectDescription(effects)}</div>
      <div class="event-remaining">Time remaining: <strong>${formatTime(active.remaining)}</strong></div>
      ${exclusive ? `<div class="event-exclusive">Exclusive species: ${exclusive}</div>` : ''}
    </div>
  `;
  return true;
}

function _renderCooldown(container) {
  container.innerHTML = `
    <div class="event-inactive">
      <p class="event-none-label">No active event.</p>
      <p class="event-cooldown-hint">Events appear periodically during active play.</p>
    </div>
  `;
}

function _renderHistory(historyEl) {
  const history = Array.isArray(GameState.eventHistory) ? GameState.eventHistory : [];
  if (history.length === 0) {
    historyEl.innerHTML = '<li class="event-history-empty">No events witnessed yet.</li>';
    return;
  }
  historyEl.innerHTML = history.slice(0, 5).map(id => {
    const def = EVENT_BY_ID[id];
    return `<li class="event-history-item">${def ? def.name : id}</li>`;
  }).join('');
}

function _render() {
  const tab = document.getElementById('tab-events');
  if (!tab) return;

  const activeArea = tab.querySelector('.events-active-area');
  const historyEl  = tab.querySelector('.events-history-list');
  if (!activeArea || !historyEl) return;

  const hasActive = _renderActive(activeArea);
  if (!hasActive) _renderCooldown(activeArea);
  _renderHistory(historyEl);
}

// ---------------------------------------------------------------------------
// Tick (countdown refresh ~1 s)
// ---------------------------------------------------------------------------

function _startTick() {
  if (_tickHandle !== null) return;
  _tickHandle = setInterval(_render, 1000);
}

function _stopTick() {
  if (_tickHandle === null) return;
  clearInterval(_tickHandle);
  _tickHandle = null;
}

// ---------------------------------------------------------------------------
// Bus subscriptions
// ---------------------------------------------------------------------------

function _onEventStart({ eventId }) {
  _showBanner(eventId);
  _render();
}

function _onEventEnd() {
  _hideBanner();
  _render();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * initEventsTab() — mount into #tab-events, wire banner, subscribe Bus + tick.
 * Safe to call multiple times (idempotent via guard).
 */
export function initEventsTab() {
  const tab = document.getElementById('tab-events');
  if (!tab) return;

  // Inject static structure once.
  if (!tab.querySelector('.events-active-area')) {
    tab.innerHTML = `
      <section class="events-panel">
        <h2 class="events-title">World Events</h2>
        <div class="events-active-area"></div>
        <section class="events-history-section">
          <h3 class="events-history-title">Recent Events</h3>
          <ul class="events-history-list"></ul>
        </section>
      </section>
    `;
  }

  // Ensure banner is hidden at mount (engine drives show/hide via Bus).
  _hideBanner();

  // If an event is already active at mount (e.g. page reload mid-event), restore banner.
  const active = getActiveEvent();
  if (active) _showBanner(active.id);

  // Subscribe Bus (unsubscribe previous handles first to stay idempotent).
  Bus.off('event:start', _onEventStart);
  Bus.off('event:end',   _onEventEnd);
  Bus.on('event:start',  _onEventStart);
  Bus.on('event:end',    _onEventEnd);

  // Start 1-second tick for countdown updates.
  _startTick();

  // Initial render.
  _render();
}
