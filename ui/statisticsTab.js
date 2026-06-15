// ui/statisticsTab.js — Statistics tab UI for Cosmic Fishing.
// C0: No browser globals at module top-level. All DOM access inside functions.

import { format, formatTime, formatSize } from './format.js';
import { GameState, Bus, RarityTier } from '../engine/state.js';
import { speciesById } from '../data/species.js';

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

// ─── Render ───────────────────────────────────────────────────────────────────

function _render() {
  _dirty = false;
  const root = document.getElementById('tab-statistics');
  if (!root) return;

  const s = GameState.statistics;
  const log = Array.isArray(s.catchLog) ? s.catchLog : [];
  const last50 = log.slice(-50).reverse(); // most recent first

  // Build rarity rows
  const rarityRows = RarityTier.map(tier => {
    const count = (s.rarityCounts && s.rarityCounts[tier]) || 0;
    return `<tr>
      <td class="stat-label rarity-${tier}">${_cap(tier)}</td>
      <td class="stat-value">${format(count)}</td>
    </tr>`;
  }).join('');

  // Build catch log rows (last 50, FR-007)
  const logRows = last50.length === 0
    ? '<tr><td colspan="4" class="stat-empty">No catches recorded yet.</td></tr>'
    : last50.map(c => {
        const species = speciesById(c.speciesId);
        const name = species ? species.name : (c.name || c.speciesId || '?');
        return `<tr class="log-row rarity-${c.rarity}">
          <td class="log-name">${name}</td>
          <td class="log-rarity">${_cap(c.rarity)}</td>
          <td class="log-size">${formatSize(c.size)}</td>
          <td class="log-value">${format(c.sellValue)} g</td>
        </tr>`;
      }).join('');

  // Realm time rows
  const realmTime = (s.realmTimeSeconds && typeof s.realmTimeSeconds === 'object')
    ? s.realmTimeSeconds
    : {};
  const realmRows = Object.entries(realmTime).map(([realm, secs]) =>
    `<tr>
      <td class="stat-label">${_cap(realm.replace(/_/g, ' '))}</td>
      <td class="stat-value">${formatTime(secs || 0)}</td>
    </tr>`
  ).join('');

  root.innerHTML = `
    <div class="statistics-tab">
      <h2 class="tab-title">Statistics</h2>

      <section class="stat-section">
        <h3 class="stat-section-title">General</h3>
        <table class="stat-table">
          <tbody>
            <tr>
              <td class="stat-label">Total Casts</td>
              <td class="stat-value">${format(s.totalCasts || 0)}</td>
            </tr>
            <tr>
              <td class="stat-label">Total Fish Caught</td>
              <td class="stat-value">${format(s.totalFishCaught || 0)}</td>
            </tr>
            <tr>
              <td class="stat-label">Ascensions</td>
              <td class="stat-value">${format(GameState.ascensionCount || 0)}</td>
            </tr>
            <tr>
              <td class="stat-label">Playtime</td>
              <td class="stat-value">${formatTime(s.playtimeSeconds || 0)}</td>
            </tr>
            <tr>
              <td class="stat-label">Events Witnessed</td>
              <td class="stat-value">${format(GameState.eventsWitnessed || 0)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="stat-section">
        <h3 class="stat-section-title">Rarity Breakdown</h3>
        <table class="stat-table">
          <tbody>
            ${rarityRows}
          </tbody>
        </table>
      </section>

      <section class="stat-section">
        <h3 class="stat-section-title">Records</h3>
        <table class="stat-table">
          <tbody>
            <tr>
              <td class="stat-label">Largest Catch</td>
              <td class="stat-value">${_catchLabel(s.largestCatch)}</td>
            </tr>
            <tr>
              <td class="stat-label">Most Valuable Catch</td>
              <td class="stat-value">${_catchLabel(s.mostValuableCatch)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      ${realmRows.length ? `
      <section class="stat-section">
        <h3 class="stat-section-title">Time per Realm</h3>
        <table class="stat-table">
          <tbody>
            ${realmRows}
          </tbody>
        </table>
      </section>` : ''}

      <section class="stat-section">
        <h3 class="stat-section-title">Catch Log <span class="stat-subtitle">(last 50)</span></h3>
        <table class="stat-table catch-log-table">
          <thead>
            <tr>
              <th>Species</th>
              <th>Rarity</th>
              <th>Size</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            ${logRows}
          </tbody>
        </table>
      </section>
    </div>
  `;
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
