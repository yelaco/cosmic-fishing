// ui/upgradesTab.js — Upgrades Tab (T23, FR-050..053)
// C0: no top-level browser globals. All DOM access inside initUpgradesTab().

import { format } from './format.js';
import { GameState, Bus } from '../engine/state.js';
import { purchaseUpgrade } from '../engine/economy.js';
import UPGRADES, { upgradeById, upgradesByCategory } from '../data/upgrades.js';
import {
  openCardDetail,
  closeCardDetail,
  getOpenDetail,
  bindCardGrid,
} from './cardDetail.js';

// Derive ordered category list from UPGRADES data (preserves definition order).
const CATEGORIES = [...new Set(UPGRADES.map(u => u.category))];

const CATEGORY_LABELS = {
  rod:         'Rod',
  bait:        'Bait & Lure',
  reel:        'Reel',
  boat:        'Boat',
  dimensional: 'Dimensional',
  lure:        'Lure',
  automation:  'Automation',
  special:     'Special',
};

const CATEGORY_GLYPHS = {
  rod:         '🎣',
  bait:        '🪱',
  lure:        '🪝',
  reel:        '🔁',
  boat:        '⛵',
  dimensional: '🌀',
  automation:  '⚙️',
  special:     '✨',
};

function categoryGlyph(cat) {
  return CATEGORY_GLYPHS[cat] ?? '✨';
}

const ROD_GLYPHS = { better_rod: '🎣', fine_rod: '🪝', deep_probe: '🛰️', void_tendril: '🌌' };

function chipFor(upg) {
  if (upg.category === 'rod' && ROD_GLYPHS[upg.id]) {
    return { glyph: ROD_GLYPHS[upg.id], chipMod: ` game-card__chip--${upg.id}` };
  }
  return { glyph: categoryGlyph(upg.category), chipMod: '' };
}

function resourceLabel(resource) {
  const MAP = {
    gold:              'Gold',
    rp:                'RP',
    collectionEssence: 'CE',
    voidShards:        'Void Shards',
    temporalCrystals:  'TC',
  };
  return MAP[resource] ?? resource;
}

function formatCost(costEntry) {
  return `${format(costEntry.amount)} ${resourceLabel(costEntry.resource)}`;
}

function upgradeState(upg) {
  if (GameState.ownedUpgrades.includes(upg.id)) return 'purchased';

  const prereqsMet = (upg.prerequisites || []).every(pid =>
    GameState.ownedUpgrades.includes(pid)
  );
  if (!prereqsMet) return 'locked';

  const canAfford = (upg.cost || []).every(({ resource, amount }) =>
    (GameState.resources[resource] ?? 0) >= amount
  );
  return canAfford ? 'affordable' : 'locked';
}

// Returns a short one-line summary of the first effect for the compact card stat line.
function effectSummary(upg) {
  if (!upg.effects || !upg.effects.length) {
    if (upg.cost && upg.cost.length) return formatCost(upg.cost[0]);
    return '';
  }
  const e = upg.effects[0];
  const type = e.type || '';
  const val  = e.value;

  if (type.endsWith('_multiplier')) {
    const pct = Math.round(Math.abs(val - 1) * 100);
    const dir = val >= 1 ? '+' : '-';
    const label = type.replace(/_multiplier$/, '').replace(/_/g, ' ');
    return `${dir}${pct}% ${label}`;
  }
  if (type.endsWith('_bonus') || type.endsWith('_add')) {
    const label = type.replace(/_(bonus|add)$/, '').replace(/_/g, ' ');
    return `+${val} ${label}`;
  }
  return `${type.replace(/_/g, ' ')}: ${val}`;
}

// Formats ALL effects for the detail modal body.
function allEffectsHtml(upg) {
  if (!upg.effects || !upg.effects.length) return '';
  const items = upg.effects.map(e => {
    const type = e.type || '';
    const val  = e.value;
    let label;
    if (type.endsWith('_multiplier')) {
      const pct = Math.round(Math.abs(val - 1) * 100);
      const dir = val >= 1 ? '+' : '-';
      label = `${dir}${pct}% ${type.replace(/_multiplier$/, '').replace(/_/g, ' ')}`;
    } else {
      label = `${type.replace(/_/g, ' ')}: ${val}`;
    }
    return `<li>${label}</li>`;
  }).join('');
  return `<ul class="card-detail__effects">${items}</ul>`;
}

// Formats the cost breakdown for the detail modal, coloring by affordability.
function costBreakdownHtml(upg) {
  if (!upg.cost || !upg.cost.length) return '';
  const rows = upg.cost.map(({ resource, amount }) => {
    const have     = GameState.resources[resource] ?? 0;
    const canAfford = have >= amount;
    const cls = canAfford ? 'cost-entry--affordable' : 'cost-entry--locked';
    return `<span class="cost-entry ${cls}">${format(amount)} ${resourceLabel(resource)}</span>`;
  }).join(' + ');
  return `<div class="card-detail__cost">${rows}</div>`;
}

// Builds the bodyHtml for openCardDetail.
function buildBodyHtml(upg) {
  const parts = [];

  parts.push(`<p class="card-detail__desc">${upg.description}</p>`);

  const fx = allEffectsHtml(upg);
  if (fx) parts.push(fx);

  const costHtml = costBreakdownHtml(upg);
  if (costHtml) parts.push(`<div class="card-detail__section"><span class="card-detail__label">Cost</span>${costHtml}</div>`);

  // Unmet prerequisites
  const unmet = (upg.prerequisites || [])
    .filter(pid => !GameState.ownedUpgrades.includes(pid))
    .map(pid => { const p = upgradeById(pid); return p ? p.name : pid; });
  if (unmet.length) {
    parts.push(`<div class="card-detail__section"><span class="card-detail__label">Requires</span> ${unmet.join(', ')}</div>`);
  }

  if (upg.unlockCondition) {
    parts.push(`<div class="card-detail__section"><span class="card-detail__label">Unlock</span> ${upg.unlockCondition}</div>`);
  }

  return parts.join('');
}

// Builds the actionsHtml for openCardDetail.
function buildActionsHtml(upg) {
  const state = upgradeState(upg);
  if (state === 'purchased') {
    return `<button class="btn btn--muted" disabled>Owned</button>`;
  }
  const disabled = state !== 'affordable' ? ' disabled' : '';
  return `<button class="btn btn--primary" data-card-action="buy"${disabled}>Buy</button>`;
}

// Returns the full resolveDetail args object for a given upgrade id.
function resolveUpgrade(id) {
  const upg = upgradeById(id);
  if (!upg) return null;

  const { glyph, chipMod } = chipFor(upg);
  return {
    title:       upg.name,
    chipHtml:    `<span class="game-card__chip${chipMod}">${glyph}</span>`,
    rarityClass: upg.rarity ? `rarity-${upg.rarity}` : '',
    bodyHtml:    buildBodyHtml(upg),
    actionsHtml: buildActionsHtml(upg),
    onAction:    (actionEl) => {
      if (actionEl.dataset.cardAction === 'buy') {
        purchaseUpgrade(upg.id);
        closeCardDetail();
      }
    },
  };
}

// Renders compact card HTML string for one upgrade.
function renderCardHtml(upg) {
  const state    = upgradeState(upg);
  const { glyph, chipMod } = chipFor(upg);
  const stat     = effectSummary(upg);
  const rarityClass = upg.rarity ? ` rarity-${upg.rarity}` : '';
  const lockedClass = state === 'locked' ? ' game-card--locked' : '';

  let badgeMod, badgeText;
  if (state === 'purchased') {
    badgeMod  = '--owned';
    badgeText = 'Owned';
  } else if (state === 'affordable') {
    badgeMod  = '--affordable';
    badgeText = 'Buy';
  } else {
    badgeMod  = '--locked';
    badgeText = '🔒';
  }

  return `<div class="game-card${rarityClass}${lockedClass}"
    data-detail-id="${upg.id}"
    data-detail-kind="upgrade"
    role="button"
    tabindex="0"
    aria-haspopup="dialog">
  <span class="game-card__chip${chipMod}">${glyph}</span>
  <span class="status-badge status-badge${badgeMod}">${badgeText}</span>
  <div class="game-card__name">${upg.name}</div>
  ${stat ? `<div class="game-card__stat">${stat}</div>` : ''}
</div>`;
}

function renderAll(container) {
  let html = '';

  for (const cat of CATEGORIES) {
    const upgrades = upgradesByCategory(cat);
    if (!upgrades.length) continue;

    const label = CATEGORY_LABELS[cat] ?? cat;
    const cards = upgrades.map(renderCardHtml).join('');
    html += `<section class="upgrade-category">
  <h3 class="upgrade-category-title">${label}</h3>
  <div class="game-grid">${cards}</div>
</section>`;
  }

  container.innerHTML = html;
}

export function initUpgradesTab() {
  const container = document.getElementById('tab-upgrades');
  if (!container) return;

  renderAll(container);

  // Bind card grid ONCE on the persistent container (delegation survives re-renders).
  bindCardGrid(container, (id, kind) => {
    if (kind !== 'upgrade') return null;
    return resolveUpgrade(id);
  });

  // Re-render grid on state changes; patch open modal if its upgrade was purchased.
  const rerender = () => {
    renderAll(container);

    // After re-render, patch the open modal if it belongs to an upgrade.
    const open = getOpenDetail();
    if (open && open.kind === 'upgrade') {
      const upg = upgradeById(open.id);
      if (!upg) return;
      // Patch actions area: disable Buy if no longer affordable, or close if purchased.
      const actionsEl = open.el.querySelector('.card-detail__actions');
      if (actionsEl) {
        // Replace only the inner HTML; the delegated onAction handler on the
        // panel (wired by openCardDetail) still handles [data-card-action="buy"].
        actionsEl.innerHTML = buildActionsHtml(upg);
      }
    }
  };

  Bus.on('resource:change', rerender);
  Bus.on('upgrade:purchased', rerender);
}
