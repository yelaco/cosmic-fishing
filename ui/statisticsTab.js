// ui/statisticsTab.js — Statistics tab UI for Cosmic Fishing.
// C0: No browser globals at module top-level. All DOM access inside functions.

import { format, formatTime, formatSize } from './format.js';
import { GameState, Bus, RarityTier } from '../engine/state.js';
import { speciesById } from '../data/species.js';
import { openCardDetail, bindCardGrid } from './cardDetail.js';

// ─── Module state ─────────────────────────────────────────────────────────────

let _dirty = false;
let _mounted = false;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _cap(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function _catchLabel(catchObj) {
  if (!catchObj) return '—';
  const species = speciesById(catchObj.speciesId);
  const name = species ? species.name : (catchObj.name || catchObj.speciesId || '?');
  return `${name} — ${formatSize(catchObj.size)} — ${format(catchObj.sellValue)} gold`;
}

function _rarityColor(tier) {
  return `var(--rarity-${tier}-color)`;
}

// ─── Detail resolver ──────────────────────────────────────────────────────────

function _resolveDetail(id, kind) {
  const s = GameState.statistics;

  if (kind === 'record') {
    const catchObj = id === 'largest' ? s.largestCatch : s.mostValuableCatch;
    if (!catchObj) return null;
    const species = speciesById(catchObj.speciesId);
    const name = species ? species.name : (catchObj.name || catchObj.speciesId || '?');
    const title = id === 'largest' ? 'Largest Catch' : 'Most Valuable Catch';
    const rarityClass = catchObj.rarity ? `rarity-${catchObj.rarity}` : '';
    const bodyHtml = `
      <div class="card-detail__row"><span class="card-detail__label">Species</span><span>${name}</span></div>
      <div class="card-detail__row"><span class="card-detail__label">Rarity</span><span class="${rarityClass}">${_cap(catchObj.rarity || '?')}</span></div>
      <div class="card-detail__row"><span class="card-detail__label">Size</span><span>${formatSize(catchObj.size)}</span></div>
      <div class="card-detail__row"><span class="card-detail__label">Value</span><span class="gold-value">${format(catchObj.sellValue)} gold</span></div>
    `;
    return { title, chipHtml: id === 'largest' ? '📏' : '💰', bodyHtml, rarityClass };
  }

  if (kind === 'catch') {
    const log = Array.isArray(s.catchLog) ? s.catchLog : [];
    const idx = parseInt(id, 10);
    // id is the index from the reversed last-50 slice; reconstruct original index
    const last50Start = Math.max(0, log.length - 50);
    const originalIdx = last50Start + (49 - idx);
    const catchObj = log[originalIdx];
    if (!catchObj) return null;
    const species = speciesById(catchObj.speciesId);
    const name = species ? species.name : (catchObj.name || catchObj.speciesId || '?');
    const rarityClass = catchObj.rarity ? `rarity-${catchObj.rarity}` : '';
    const bodyHtml = `
      <div class="card-detail__row"><span class="card-detail__label">Species</span><span>${name}</span></div>
      <div class="card-detail__row"><span class="card-detail__label">Rarity</span><span class="${rarityClass}">${_cap(catchObj.rarity || '?')}</span></div>
      <div class="card-detail__row"><span class="card-detail__label">Size</span><span>${formatSize(catchObj.size)}</span></div>
      <div class="card-detail__row"><span class="card-detail__label">Value</span><span class="gold-value">${format(catchObj.sellValue)} gold</span></div>
    `;
    return { title: name, chipHtml: '🐟', bodyHtml, rarityClass };
  }

  return null;
}

// ─── Section renderers ────────────────────────────────────────────────────────

function _renderStatTiles(s) {
  const tiles = [
    { icon: '🎯', label: 'Total Casts',      value: format(s.totalCasts || 0) },
    { icon: '🐟', label: 'Total Fish Caught', value: format(s.totalFishCaught || 0) },
    { icon: '🌟', label: 'Ascensions',         value: format(GameState.ascensionCount || 0) },
    { icon: '⏱️', label: 'Playtime',           value: formatTime(s.playtimeSeconds || 0) },
    { icon: '✨', label: 'Events Witnessed',   value: format(GameState.eventsWitnessed || 0) },
  ];

  const regularTiles = tiles.map(t => `
    <div class="stat-tile">
      <span class="stat-number">${t.icon} ${t.value}</span>
      <span class="stat-desc">${t.label}</span>
    </div>
  `).join('');

  const largestLabel  = s.largestCatch       ? _catchLabel(s.largestCatch)       : '—';
  const valuableLabel = s.mostValuableCatch   ? _catchLabel(s.mostValuableCatch)  : '—';

  const recordTiles = `
    <div class="stat-tile game-card" tabindex="0" role="button"
         data-detail-id="largest" data-detail-kind="record"
         aria-label="Largest Catch: ${largestLabel}">
      <span class="stat-number">📏</span>
      <span class="stat-desc">Largest Catch</span>
      <span class="stat-number" style="font-size:0.85rem;margin-top:0.25rem">${largestLabel}</span>
    </div>
    <div class="stat-tile game-card" tabindex="0" role="button"
         data-detail-id="mostValuable" data-detail-kind="record"
         aria-label="Most Valuable: ${valuableLabel}">
      <span class="stat-number">💰</span>
      <span class="stat-desc">Most Valuable</span>
      <span class="stat-number" style="font-size:0.85rem;margin-top:0.25rem">${valuableLabel}</span>
    </div>
  `;

  return `
    <section class="stat-section">
      <h3 class="stat-section-title">General &amp; Records</h3>
      <div class="game-grid" style="grid-template-columns: repeat(auto-fill, minmax(140px, 1fr))">
        ${regularTiles}
        ${recordTiles}
      </div>
    </section>
  `;
}

function _renderRarityBreakdown(s) {
  const counts = (s.rarityCounts && typeof s.rarityCounts === 'object') ? s.rarityCounts : {};
  const maxCount = Math.max(1, ...RarityTier.map(t => counts[t] || 0));

  const rows = RarityTier.map(tier => {
    const count = counts[tier] || 0;
    const pct = Math.round((count / maxCount) * 100);
    return `
      <div class="stat-bar-row">
        <span class="stat-bar-label rarity-${tier}">${_cap(tier)}</span>
        <div class="progress-bar-wrap stat-bar-track">
          <div class="progress-bar-fill"
               style="width:${pct}%; background:${_rarityColor(tier)}"></div>
        </div>
        <span class="stat-bar-count">${format(count)}</span>
      </div>
    `;
  }).join('');

  return `
    <section class="stat-section">
      <h3 class="stat-section-title">Rarity Breakdown</h3>
      <div class="stat-bar-list" id="stat-rarity-bars">
        ${rows}
      </div>
    </section>
  `;
}

function _renderRealmTime(s) {
  const realmTime = (s.realmTimeSeconds && typeof s.realmTimeSeconds === 'object')
    ? s.realmTimeSeconds
    : {};
  const entries = Object.entries(realmTime);
  if (entries.length === 0) return '';

  const maxSecs = Math.max(1, ...entries.map(([, v]) => v || 0));

  const rows = entries.map(([realm, secs]) => {
    const pct = Math.round(((secs || 0) / maxSecs) * 100);
    return `
      <div class="stat-bar-row">
        <span class="stat-bar-label">${_cap(realm.replace(/_/g, ' '))}</span>
        <div class="progress-bar-wrap stat-bar-track">
          <div class="progress-bar-fill" style="width:${pct}%"></div>
        </div>
        <span class="stat-bar-count">${formatTime(secs || 0)}</span>
      </div>
    `;
  }).join('');

  return `
    <section class="stat-section">
      <h3 class="stat-section-title">Time per Realm</h3>
      <div class="stat-bar-list" id="stat-realm-bars">
        ${rows}
      </div>
    </section>
  `;
}

function _renderCatchLog(s) {
  const log = Array.isArray(s.catchLog) ? s.catchLog : [];
  const last50 = log.slice(-50).reverse(); // most recent first

  if (last50.length === 0) {
    return `
      <section class="stat-section">
        <h3 class="stat-section-title">Catch Log <span class="stat-subtitle">(last 50)</span></h3>
        <p class="stat-empty">No catches recorded yet.</p>
      </section>
    `;
  }

  const cards = last50.map((c, i) => {
    const species = speciesById(c.speciesId);
    const name = species ? species.name : (c.name || c.speciesId || '?');
    const rarityClass = c.rarity ? `rarity-${c.rarity}` : '';
    return `
      <div class="game-card ${rarityClass}" tabindex="0" role="button"
           data-detail-id="${i}" data-detail-kind="catch"
           aria-label="${name}, ${_cap(c.rarity)}, ${formatSize(c.size)}, ${format(c.sellValue)} gold">
        <span class="game-card__chip">🐟</span>
        <strong class="game-card__name" style="font-size:0.82rem">${name}</strong>
        <span style="font-size:0.75rem;color:var(--text-muted)">${formatSize(c.size)} · ${format(c.sellValue)} g</span>
      </div>
    `;
  }).join('');

  return `
    <section class="stat-section">
      <h3 class="stat-section-title">Catch Log <span class="stat-subtitle">(last 50)</span></h3>
      <div class="game-grid catch-log-grid"
           style="max-height:24rem; overflow-y:auto; grid-template-columns:repeat(auto-fill,minmax(130px,1fr))">
        ${cards}
      </div>
    </section>
  `;
}

// ─── Render ───────────────────────────────────────────────────────────────────

function _render() {
  _dirty = false;
  const root = document.getElementById('tab-statistics');
  if (!root) return;

  const s = GameState.statistics;

  root.innerHTML = `
    <div class="statistics-tab">
      <h2 class="tab-title">Statistics</h2>
      ${_renderStatTiles(s)}
      ${_renderRarityBreakdown(s)}
      ${_renderRealmTime(s)}
      ${_renderCatchLog(s)}
    </div>
  `;

  bindCardGrid(root, _resolveDetail);
}

// ─── Dirty-flag scheduler ─────────────────────────────────────────────────────

function _scheduleRender() {
  if (_dirty) return;
  _dirty = true;
  requestAnimationFrame(_render);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * initStatisticsTab — mount the statistics tab into #tab-statistics and
 * subscribe to Bus events. Idempotent (safe to call more than once).
 */
export function initStatisticsTab() {
  if (_mounted) return;
  _mounted = true;

  Bus.on('catch:new', _scheduleRender);
  Bus.on('tick', _scheduleRender);
  Bus.on('resource:change', _scheduleRender);
  Bus.on('ascension:complete', _scheduleRender);

  _render();
}
