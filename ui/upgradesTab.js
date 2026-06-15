// ui/upgradesTab.js — Upgrades Tab (T23, FR-050..053)
// C0: no top-level browser globals. All DOM access inside initUpgradesTab().

import { format } from './format.js';
import { GameState, Bus } from '../engine/state.js';
import { purchaseUpgrade } from '../engine/economy.js';
import UPGRADES, { upgradeById, upgradesByCategory } from '../data/upgrades.js';

// Derive ordered category list from UPGRADES data (preserves definition order).
const CATEGORIES = [...new Set(UPGRADES.map(u => u.category))];

const CATEGORY_LABELS = {
  rod: 'Rod',
  bait: 'Bait & Lure',
  reel: 'Reel',
  boat: 'Boat',
  dimensional: 'Dimensional',
  lure: 'Lure',
  automation: 'Automation',
  special: 'Special',
};

function resourceLabel(resource) {
  const MAP = {
    gold: 'Gold',
    rp: 'RP',
    collectionEssence: 'CE',
    voidShards: 'Void Shards',
    temporalCrystals: 'TC',
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

function effectsTooltip(upg) {
  if (!upg.effects || !upg.effects.length) return upg.description;
  const lines = upg.effects.map(e => `${e.type}: ${e.value}`).join('; ');
  return `${upg.description} [${lines}]`;
}

function renderUpgradeCard(upg) {
  const state = upgradeState(upg);
  const tooltip = effectsTooltip(upg);

  const card = document.createElement('div');
  card.className = `upgrade-card upgrade-card--${state}`;
  card.dataset.upgradeId = upg.id;

  const costHtml = (upg.cost || [])
    .map(c => `<span class="upgrade-cost-entry">${formatCost(c)}</span>`)
    .join(' + ');

  let statusHtml = '';
  if (state === 'purchased') {
    statusHtml = '<span class="upgrade-status upgrade-status--owned">Owned</span>';
  } else if (state === 'locked') {
    const unmetPrereqs = (upg.prerequisites || [])
      .filter(pid => !GameState.ownedUpgrades.includes(pid))
      .map(pid => {
        const prereq = upgradeById(pid);
        return prereq ? prereq.name : pid;
      });

    const parts = [];
    if (unmetPrereqs.length) {
      parts.push(`Requires: ${unmetPrereqs.join(', ')}`);
    }
    if (upg.unlockCondition) {
      parts.push(upg.unlockCondition);
    }
    statusHtml = `<span class="upgrade-status upgrade-status--locked">${parts.join(' | ') || 'Locked'}</span>`;
  }

  const btnDisabled = state !== 'affordable' ? 'disabled' : '';

  card.innerHTML = `
    <div class="upgrade-header">
      <span class="upgrade-name" title="${tooltip}" data-tip="${tooltip}">${upg.name}</span>
      ${upg.realm ? `<span class="upgrade-realm">${upg.realm}</span>` : ''}
    </div>
    <p class="upgrade-desc">${upg.description}</p>
    <div class="upgrade-footer">
      <span class="upgrade-cost">${costHtml}</span>
      ${statusHtml}
      ${state !== 'purchased'
        ? `<button class="upgrade-btn" data-upgrade-id="${upg.id}" ${btnDisabled}>Buy</button>`
        : ''}
    </div>
  `;

  return card;
}

function renderAll(container) {
  container.innerHTML = '';

  for (const cat of CATEGORIES) {
    const upgrades = upgradesByCategory(cat);
    if (!upgrades.length) continue;

    const section = document.createElement('section');
    section.className = 'upgrade-category';

    const heading = document.createElement('h3');
    heading.className = 'upgrade-category-title';
    heading.textContent = CATEGORY_LABELS[cat] ?? cat;
    section.appendChild(heading);

    const grid = document.createElement('div');
    grid.className = 'upgrade-grid';

    for (const upg of upgrades) {
      grid.appendChild(renderUpgradeCard(upg));
    }

    section.appendChild(grid);
    container.appendChild(section);
  }
}

export function initUpgradesTab() {
  const container = document.getElementById('tab-upgrades');
  if (!container) return;

  renderAll(container);

  // Delegate purchase clicks — never mutates GameState directly (C3).
  container.addEventListener('click', e => {
    const btn = e.target.closest('button.upgrade-btn');
    if (!btn || btn.disabled) return;
    const id = btn.dataset.upgradeId;
    if (!id) return;
    purchaseUpgrade(id);
    // Re-render triggered by upgrade:purchased → resource:change Bus events below.
  });

  // Subscribe to state-changing events and re-render affordability.
  const rerender = () => renderAll(container);
  Bus.on('resource:change', rerender);
  Bus.on('upgrade:purchased', rerender);
}
