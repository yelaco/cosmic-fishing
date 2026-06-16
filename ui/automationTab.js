// ui/automationTab.js — Automation tab: compact-card + detail-modal UI
// C0: no top-level browser globals. All DOM access is inside initAutomationTab().

import { format } from './format.js';
import { GameState, Bus } from '../engine/state.js';
import { purchaseAutomation, toggleAutomation } from '../engine/automation.js';
import UPGRADES from '../data/upgrades.js';
import {
  openCardDetail,
  closeCardDetail,
  getOpenDetail,
  bindCardGrid,
} from './cardDetail.js';

const AUTOMATION_UPGRADES = UPGRADES.filter(u => u.category === 'automation');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _isOwned(id) {
  return GameState.automationOwned.includes(id);
}

function _isEnabled(id) {
  return GameState.automationEnabled[id] !== false;
}

function _canAfford(upg) {
  return upg.cost.every(({ resource, amount }) => {
    const val = resource === 'gold'
      ? GameState.resources.gold
      : resource === 'rp'
        ? GameState.resources.rp
        : (GameState.resources[resource] ?? 0);
    return val >= amount;
  });
}

function _prereqsMet(upg) {
  return upg.prerequisites.every(id => GameState.ownedUpgrades.includes(id));
}

function _costLabel(upg) {
  return upg.cost.map(({ resource, amount }) => `${format(amount)} ${resource}`).join(', ');
}

// ─── Card builder ─────────────────────────────────────────────────────────────

function _buildCard(upg) {
  const owned     = _isOwned(upg.id);
  const enabled   = owned && _isEnabled(upg.id);
  const affordable = _canAfford(upg);
  const prereqOk  = _prereqsMet(upg);
  const locked    = !owned && !(prereqOk && affordable);

  const card = document.createElement('div');
  card.className = 'game-card' + (locked ? ' game-card--locked' : '');
  card.dataset.detailId   = upg.id;
  card.dataset.detailKind = 'automation';
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-haspopup', 'dialog');

  // Chip
  const chip = document.createElement('div');
  chip.className = 'game-card__chip';
  chip.textContent = '⚙️';
  card.appendChild(chip);

  // On/off pip
  const pip = document.createElement('span');
  pip.className = 'automation-active-indicator' + (enabled ? ' automation-active-indicator--on' : '');
  card.appendChild(pip);

  // Status badge
  const badge = document.createElement('span');
  let badgeClass = 'status-badge';
  let badgeText;
  if (owned && enabled) {
    badgeClass += ' status-badge--owned';
    badgeText = 'On';
  } else if (owned && !enabled) {
    badgeText = 'Off';
  } else if (!owned && prereqOk && affordable) {
    badgeClass += ' status-badge--affordable';
    badgeText = 'Buy';
  } else {
    badgeClass += ' status-badge--locked';
    badgeText = '🔒';
  }
  badge.className = badgeClass;
  badge.textContent = badgeText;
  card.appendChild(badge);

  // Name
  const name = document.createElement('div');
  name.className = 'game-card__name';
  name.textContent = upg.name;
  card.appendChild(name);

  // Stat line — show first effect or cost
  const stat = document.createElement('div');
  stat.className = 'game-card__stat';
  if (upg.effects && upg.effects.length) {
    const e = upg.effects[0];
    stat.textContent = `${e.type.replace(/_/g, ' ')}: ×${e.value}`;
  } else {
    stat.textContent = owned ? 'Owned' : _costLabel(upg);
  }
  card.appendChild(stat);

  return card;
}

// ─── Detail resolver ──────────────────────────────────────────────────────────

function _resolveDetail(id, _kind, _cardEl) {
  const upg = AUTOMATION_UPGRADES.find(u => u.id === id);
  if (!upg) return null;

  const owned     = _isOwned(upg.id);
  const enabled   = owned && _isEnabled(upg.id);
  const affordable = _canAfford(upg);
  const prereqOk  = _prereqsMet(upg);

  // Body
  const prereqLine = !prereqOk
    ? `<p class="card-detail__prereq">Requires: ${upg.prerequisites.join(', ')}</p>`
    : '';
  const costLine = owned
    ? '<p class="card-detail__cost">Owned</p>'
    : `<p class="card-detail__cost">Cost: ${_costLabel(upg)}</p>`;

  const bodyHtml =
    `<p>${upg.description}</p>` +
    prereqLine +
    costLine;

  // Actions
  let actionsHtml;
  if (!owned) {
    const dis = (prereqOk && affordable) ? '' : ' disabled';
    actionsHtml = `<button data-card-action="purchase"${dis}>Purchase</button>`;
  } else {
    actionsHtml =
      `<button data-card-action="toggle" aria-pressed="${enabled}">` +
      (enabled ? 'Enabled' : 'Disabled') +
      `</button>`;
  }

  return {
    title:      upg.name,
    chipHtml:   '<span class="game-card__chip" style="display:inline-flex;vertical-align:middle;margin-right:.35em">⚙️</span>',
    bodyHtml,
    actionsHtml,
    onAction(actionEl, detailEl) {
      const action = actionEl.dataset.cardAction;
      if (action === 'purchase') {
        purchaseAutomation(upg.id);
        closeCardDetail();
        // Bus re-renders grid via upgrade:purchased / resource:change
      } else if (action === 'toggle') {
        toggleAutomation(upg.id);
        _patchToggleInPlace(upg.id, detailEl, actionEl);
      }
    },
  };
}

// ─── In-place toggle patch (modal + card) ────────────────────────────────────

function _patchToggleInPlace(id, detailEl, toggleBtn) {
  const enabled = _isEnabled(id);

  // Patch modal toggle button
  if (toggleBtn) {
    toggleBtn.textContent = enabled ? 'Enabled' : 'Disabled';
    toggleBtn.setAttribute('aria-pressed', String(enabled));
  }

  // Patch card pip and badge in the grid
  const card = document.querySelector(
    `[data-detail-id="${CSS.escape(id)}"][data-detail-kind="automation"]`
  );
  if (!card) return;

  const pip = card.querySelector('.automation-active-indicator');
  if (pip) {
    pip.classList.toggle('automation-active-indicator--on', enabled);
  }

  const badge = card.querySelector('.status-badge');
  if (badge) {
    badge.classList.remove('status-badge--owned', 'status-badge--affordable', 'status-badge--locked');
    if (enabled) {
      badge.classList.add('status-badge--owned');
      badge.textContent = 'On';
    } else {
      badge.textContent = 'Off';
    }
  }
}

// ─── Render ───────────────────────────────────────────────────────────────────

function _render(root) {
  // Preserve the binding flag on root by only replacing inner content.
  // Clear everything except the dataset flag (handled by bindCardGrid itself).
  root.innerHTML = '';

  const heading = document.createElement('h2');
  heading.className = 'automation-tab__title';
  heading.textContent = 'Automation';
  root.appendChild(heading);

  const grid = document.createElement('div');
  grid.className = 'game-grid';

  for (const upg of AUTOMATION_UPGRADES) {
    grid.appendChild(_buildCard(upg));
  }

  root.appendChild(grid);
}

// ─── Mount ────────────────────────────────────────────────────────────────────

export function initAutomationTab() {
  const root = document.getElementById('tab-automation');
  if (!root) return;

  // Bind card grid ONCE on the persistent container (delegation, never stacks).
  bindCardGrid(root, _resolveDetail);

  function render() {
    _render(root);

    // If a detail modal is open for an automation card, refresh it in-place.
    const open = getOpenDetail();
    if (open && open.kind === 'automation') {
      const upg = AUTOMATION_UPGRADES.find(u => u.id === open.id);
      if (upg) {
        const args = _resolveDetail(open.id, 'automation', null);
        if (args) {
          // Patch body and actions without closing (keeps focus).
          const body = open.el.querySelector('.card-detail__body');
          if (body) body.innerHTML = args.bodyHtml;
          const actions = open.el.querySelector('.card-detail__actions');
          if (actions) actions.innerHTML = args.actionsHtml;
        }
      }
    }
  }

  render();

  Bus.on('resource:change',   render);
  Bus.on('upgrade:purchased', render);
}
