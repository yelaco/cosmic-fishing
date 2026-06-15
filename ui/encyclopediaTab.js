// ui/encyclopediaTab.js — Encyclopedia tab (T22, FR-040..045, AC-006)
// C0 NODE-SAFETY: no top-level browser globals. All DOM access is inside
// functions invoked at runtime. `node --check` safe.

import { format } from './format.js';
import { GameState, Bus } from '../engine/state.js';
import SPECIES, { speciesByRealm } from '../data/species.js';
import { realmCompletionPct } from '../engine/realms.js';

// ── Constants ────────────────────────────────────────────────────────────────

const REALM_ORDER = ['pond', 'ocean', 'abyss', 'dream_sea', 'time_ocean', 'cosmic_void'];
const REALM_NAMES = {
  pond:        'Pond',
  ocean:       'Ocean',
  abyss:       'Abyss',
  dream_sea:   'Dream Sea',
  time_ocean:  'Time Ocean',
  cosmic_void: 'Cosmic Void',
};

const RARITY_LABELS = {
  common:     'Common',
  uncommon:   'Uncommon',
  rare:       'Rare',
  epic:       'Epic',
  legendary:  'Legendary',
  mythic:     'Mythic',
  impossible: 'Impossible',
};

const RARITY_HINTS = {
  common:     'A common catch — patient casters find these often.',
  uncommon:   'Somewhat elusive — keep casting.',
  rare:       'Rarely seen — something special lurks here.',
  epic:       'Exceptional rarity — a true prize.',
  legendary:  'Legendary — spoken of in hushed tones.',
  mythic:     'Mythic — barely believed to exist.',
  impossible: 'Impossible — some say it cannot be caught at all.',
};

// ── Module state ─────────────────────────────────────────────────────────────

let _root = null;          // #tab-encyclopedia element
let _busHandler = null;    // encyclopedia:discover subscription

// ── Helpers ──────────────────────────────────────────────────────────────────

function isDiscovered(speciesId) {
  const d = GameState.encyclopediaDiscoveries;
  return d && Boolean(d[speciesId]);
}

function getCatchCount(speciesId) {
  const d = GameState.encyclopediaDiscoveries;
  if (!d || !d[speciesId]) return 0;
  return d[speciesId].catchCount || 0;
}

function overallCompletion() {
  const total = SPECIES.length;
  if (total === 0) return 0;
  const discovered = SPECIES.filter(s => isDiscovered(s.id)).length;
  return Math.round((discovered / total) * 100);
}

// ── Rendering ────────────────────────────────────────────────────────────────

function renderSilhouette() {
  return `<div class="enc-silhouette" aria-label="Undiscovered species silhouette">?</div>`;
}

function renderArtwork(species) {
  if (species.artworkType === 'emoji' && species.artworkRef) {
    return `<div class="enc-artwork enc-artwork-emoji" aria-label="${species.name} artwork">${species.artworkRef}</div>`;
  }
  return `<div class="enc-artwork" aria-label="${species.name} artwork">&#9724;</div>`;
}

function renderUndiscoveredEntry(species) {
  const isImpossible = species.rarity === 'impossible' || species.isImpossible;
  const rarityClass = `rarity-${species.rarity}`;
  const impossibleClass = isImpossible ? ' rarity-impossible' : '';
  return `
    <div class="enc-entry enc-entry--undiscovered ${rarityClass}${impossibleClass}"
         id="enc-entry-${species.id}"
         data-species-id="${species.id}"
         data-rarity="${species.rarity}">
      ${renderSilhouette()}
      <div class="enc-entry-body">
        <div class="enc-name">???</div>
        <div class="enc-rarity enc-rarity--hint">${RARITY_LABELS[species.rarity] || species.rarity}</div>
        <div class="enc-hint">${RARITY_HINTS[species.rarity] || ''}</div>
      </div>
    </div>`.trim();
}

function renderDiscoveredEntry(species) {
  const isImpossible = species.rarity === 'impossible' || species.isImpossible;
  const rarityClass = `rarity-${species.rarity}`;
  const impossibleClass = isImpossible ? ' rarity-impossible' : '';
  const catchCount = getCatchCount(species.id);
  const sizeMin = species.sizeRange ? species.sizeRange[0] : '?';
  const sizeMax = species.sizeRange ? species.sizeRange[1] : '?';
  const traits = Array.isArray(species.traits) ? species.traits.join(', ') : '';
  return `
    <div class="enc-entry enc-entry--discovered ${rarityClass}${impossibleClass}"
         id="enc-entry-${species.id}"
         data-species-id="${species.id}"
         data-rarity="${species.rarity}">
      ${renderArtwork(species)}
      <div class="enc-entry-body">
        <div class="enc-name">${species.name}</div>
        <div class="enc-rarity">${RARITY_LABELS[species.rarity] || species.rarity}</div>
        ${traits ? `<div class="enc-traits"><span class="enc-label">Traits:</span> ${traits}</div>` : ''}
        <div class="enc-size"><span class="enc-label">Size:</span> ${sizeMin}–${sizeMax} cm</div>
        <div class="enc-catches"><span class="enc-label">Caught:</span> ${format(catchCount)} time${catchCount !== 1 ? 's' : ''}</div>
        ${species.lore ? `<div class="enc-lore">${species.lore}</div>` : ''}
      </div>
    </div>`.trim();
}

function renderEntry(species) {
  return isDiscovered(species.id)
    ? renderDiscoveredEntry(species)
    : renderUndiscoveredEntry(species);
}

function renderRealmSection(realmId) {
  const species = speciesByRealm(realmId);
  const pct = Math.round(realmCompletionPct(realmId, GameState));
  const discoveredCount = species.filter(s => isDiscovered(s.id)).length;
  const entries = species.map(renderEntry).join('\n');
  return `
    <section class="enc-realm" id="enc-realm-${realmId}" data-realm="${realmId}">
      <div class="enc-realm-header">
        <h3 class="enc-realm-name">${REALM_NAMES[realmId] || realmId}</h3>
        <div class="enc-realm-progress">
          <span class="enc-realm-count">${discoveredCount}/${species.length}</span>
          <div class="enc-progress-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
            <div class="enc-progress-fill" style="width:${pct}%"></div>
          </div>
          <span class="enc-realm-pct">${pct}%</span>
        </div>
      </div>
      <div class="enc-realm-entries">
        ${entries}
      </div>
    </section>`.trim();
}

function renderHeader() {
  const pct = overallCompletion();
  const total = SPECIES.length;
  const discovered = SPECIES.filter(s => isDiscovered(s.id)).length;
  return `
    <div class="enc-header">
      <h2 class="enc-title">Encyclopedia of Cosmic Catches</h2>
      <div class="enc-overall-progress">
        <span class="enc-overall-label">Overall completion:</span>
        <span class="enc-overall-count">${discovered}/${total}</span>
        <div class="enc-progress-bar enc-progress-bar--overall" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
          <div class="enc-progress-fill" style="width:${pct}%"></div>
        </div>
        <span class="enc-overall-pct">${pct}%</span>
      </div>
    </div>`.trim();
}

function renderFull() {
  const sections = REALM_ORDER.map(renderRealmSection).join('\n');
  return `
    <div class="enc-container">
      ${renderHeader()}
      ${sections}
    </div>`.trim();
}

// ── Targeted update on discovery ─────────────────────────────────────────────

function updateEntry(speciesId) {
  if (!_root) return;
  const species = SPECIES.find(s => s.id === speciesId);
  if (!species) return;

  const el = _root.querySelector(`#enc-entry-${CSS.escape(speciesId)}`);
  if (!el) return;

  const newHtml = renderDiscoveredEntry(species);
  const tmp = document.createElement('div');
  tmp.innerHTML = newHtml;
  const newEl = tmp.firstElementChild;
  if (!newEl) return;

  newEl.classList.add('enc-entry--slide-in');
  el.replaceWith(newEl);

  // Also refresh the realm progress bar and overall header
  _updateRealmProgress(species.realm);
  _updateOverallProgress();
}

function _updateRealmProgress(realmId) {
  if (!_root) return;
  const section = _root.querySelector(`#enc-realm-${CSS.escape(realmId)}`);
  if (!section) return;

  const allInRealm = speciesByRealm(realmId);
  const discoveredCount = allInRealm.filter(s => isDiscovered(s.id)).length;
  const pct = Math.round(realmCompletionPct(realmId, GameState));

  const countEl = section.querySelector('.enc-realm-count');
  if (countEl) countEl.textContent = `${discoveredCount}/${allInRealm.length}`;

  const fillEl = section.querySelector('.enc-progress-fill');
  if (fillEl) fillEl.style.width = `${pct}%`;

  const pctEl = section.querySelector('.enc-realm-pct');
  if (pctEl) pctEl.textContent = `${pct}%`;

  const barEl = section.querySelector('.enc-progress-bar');
  if (barEl) barEl.setAttribute('aria-valuenow', pct);
}

function _updateOverallProgress() {
  if (!_root) return;
  const total = SPECIES.length;
  const discovered = SPECIES.filter(s => isDiscovered(s.id)).length;
  const pct = Math.round((discovered / total) * 100);

  const countEl = _root.querySelector('.enc-overall-count');
  if (countEl) countEl.textContent = `${discovered}/${total}`;

  const fillEl = _root.querySelector('.enc-progress-bar--overall .enc-progress-fill');
  if (fillEl) fillEl.style.width = `${pct}%`;

  const pctEl = _root.querySelector('.enc-overall-pct');
  if (pctEl) pctEl.textContent = `${pct}%`;

  const barEl = _root.querySelector('.enc-progress-bar--overall');
  if (barEl) barEl.setAttribute('aria-valuenow', pct);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * initEncyclopediaTab()
 *
 * Mounts the encyclopedia tab into #tab-encyclopedia (C5).
 * Subscribes Bus `encyclopedia:discover` to update entries with slide-in
 * animation. Read-only: never mutates GameState.
 */
export function initEncyclopediaTab() {
  _root = document.getElementById('tab-encyclopedia');
  if (!_root) return;

  _root.innerHTML = renderFull();

  // Clean up any previous subscription to avoid duplicates on re-init
  if (_busHandler) {
    Bus.off('encyclopedia:discover', _busHandler);
  }

  _busHandler = function ({ speciesId } = {}) {
    if (!speciesId) return;
    updateEntry(speciesId);
  };

  Bus.on('encyclopedia:discover', _busHandler);
}
