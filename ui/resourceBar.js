// ui/resourceBar.js — FR-101 resource header + FR-094 ascension marker (T34)
// C0: no top-level browser globals; all DOM access is inside initResourceBar().

import { format } from './format.js';
import { GameState, Bus } from '../engine/state.js';

// ── resource descriptor table ────────────────────────────────────────────────
// visible(state) returns true when the resource should be displayed.
// Gold is always visible (AC-002 requires it on first paint).
const RESOURCES = [
  {
    key: 'gold',
    label: 'Gold',
    icon: '🪙',
    getValue: s => s.resources.gold,
    visible: () => true,
  },
  {
    key: 'rp',
    label: 'Research',
    icon: '🔬',
    getValue: s => s.resources.rp,
    visible: s => s.resources.rp > 0 || s.completedResearch.length > 0,
  },
  {
    key: 'collectionEssence',
    label: 'Essence',
    icon: '✨',
    getValue: s => s.resources.collectionEssence,
    visible: s => s.resources.collectionEssence > 0 || s.unlockedRealms.includes('ocean'),
  },
  {
    key: 'voidShards',
    label: 'Void Shards',
    icon: '🌀',
    getValue: s => s.resources.voidShards,
    visible: s => s.resources.voidShards > 0 || s.unlockedRealms.includes('abyss'),
  },
  {
    key: 'temporalCrystals',
    label: 'Crystals',
    icon: '💎',
    getValue: s => s.resources.temporalCrystals,
    visible: s => s.resources.temporalCrystals > 0 || s.unlockedRealms.includes('time_ocean'),
  },
  {
    key: 'cosmicMemories',
    label: 'Memories',
    icon: '🌌',
    getValue: s => s.resources.cosmicMemories.length,
    visible: s => s.ascensionCount > 0,
  },
];

// ── internal state ───────────────────────────────────────────────────────────
// Keyed element refs for fast in-place updates (no full re-render on each tick).
let _items = {};   // key → { root, valueEl }
let _barEl = null;
let _markerEl = null;

// ── helpers ──────────────────────────────────────────────────────────────────

function buildItem(res, state) {
  const root = document.createElement('span');
  root.className = 'resource-item';
  root.dataset.resource = res.key;

  const iconEl = document.createElement('span');
  iconEl.className = 'resource-icon';
  iconEl.textContent = res.icon;

  const labelEl = document.createElement('span');
  labelEl.className = 'resource-label';
  labelEl.textContent = res.label + ':';

  const valueEl = document.createElement('span');
  valueEl.className = 'resource-value';
  valueEl.textContent = format(res.getValue(state));

  root.appendChild(iconEl);
  root.appendChild(labelEl);
  root.appendChild(valueEl);

  return { root, valueEl };
}

function renderBar(state) {
  if (!_barEl) return;

  for (const res of RESOURCES) {
    const show = res.visible(state);
    let item = _items[res.key];

    if (!item) {
      // Build and insert in declared order.
      item = buildItem(res, state);
      _items[res.key] = item;
      // Insert before the first existing item that comes after this one.
      let inserted = false;
      const keys = RESOURCES.map(r => r.key);
      const myIdx = keys.indexOf(res.key);
      for (let i = myIdx + 1; i < keys.length; i++) {
        const sibling = _items[keys[i]];
        if (sibling && sibling.root.parentNode === _barEl) {
          _barEl.insertBefore(item.root, sibling.root);
          inserted = true;
          break;
        }
      }
      if (!inserted) _barEl.appendChild(item.root);
    } else {
      // Update value.
      item.valueEl.textContent = format(res.getValue(state));
    }

    item.root.style.display = show ? '' : 'none';
  }
}

function renderMarker(state) {
  if (!_markerEl) return;
  const count = state.ascensionCount || 0;
  if (count === 0) {
    _markerEl.textContent = '';
    _markerEl.style.display = 'none';
  } else {
    _markerEl.style.display = '';
    _markerEl.textContent = `Ascension ${count}`;
    _markerEl.setAttribute('aria-label', `Ascension level ${count}`);
  }
}

// ── public API ───────────────────────────────────────────────────────────────

export function initResourceBar() {
  _barEl = document.getElementById('resource-bar');
  _markerEl = document.getElementById('ascension-marker');

  // AC-002: render immediately with current state so Gold shows "0" on first paint.
  renderBar(GameState);
  renderMarker(GameState);

  Bus.on('resource:change', () => {
    renderBar(GameState);
  });

  Bus.on('ascension:complete', () => {
    renderBar(GameState);
    renderMarker(GameState);
  });
}
