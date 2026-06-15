// ui/automationTab.js — Automation tab renderer (FR-070..072, T25)
// C0: no top-level browser globals. All DOM access is inside initAutomationTab().

import { format } from './format.js';
import { GameState, Bus } from '../engine/state.js';
import { purchaseAutomation, toggleAutomation } from '../engine/automation.js';
import UPGRADES from '../data/upgrades.js';

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

// ─── Render ───────────────────────────────────────────────────────────────────

function _renderCard(upg) {
  const owned     = _isOwned(upg.id);
  const enabled   = owned && _isEnabled(upg.id);
  const affordable = _canAfford(upg);
  const prereqOk  = _prereqsMet(upg);
  const unlocked  = owned || (prereqOk && affordable);

  const card = document.createElement('div');
  card.className = 'automation-card' + (owned ? ' automation-card--owned' : '');
  card.dataset.id = upg.id;

  // Active indicator line (only shown when owned + enabled)
  const indicator = document.createElement('div');
  indicator.className = 'automation-active-indicator' + (enabled ? ' automation-active-indicator--on' : '');
  card.appendChild(indicator);

  // Name
  const title = document.createElement('h3');
  title.className = 'automation-card__name';
  title.textContent = upg.name;
  card.appendChild(title);

  // Description
  const desc = document.createElement('p');
  desc.className = 'automation-card__desc';
  desc.textContent = upg.description;
  card.appendChild(desc);

  // Unlock condition / prerequisites
  if (!prereqOk) {
    const cond = document.createElement('p');
    cond.className = 'automation-card__unlock';
    cond.textContent = 'Requires: ' + upg.prerequisites.join(', ');
    card.appendChild(cond);
  }

  // Cost
  const costEl = document.createElement('p');
  costEl.className = 'automation-card__cost';
  costEl.textContent = owned ? 'Owned' : ('Cost: ' + _costLabel(upg));
  card.appendChild(costEl);

  // Purchase button
  if (!owned) {
    const btn = document.createElement('button');
    btn.className = 'automation-card__buy-btn';
    btn.textContent = 'Purchase';
    btn.disabled = !(prereqOk && affordable);
    btn.addEventListener('click', () => {
      purchaseAutomation(upg.id);
      // re-render handled by upgrade:purchased Bus event subscription
    });
    card.appendChild(btn);
  }

  // Toggle button (only when owned)
  if (owned) {
    const toggle = document.createElement('button');
    toggle.className = 'automation-card__toggle-btn' + (enabled ? ' automation-card__toggle-btn--active' : '');
    toggle.textContent = enabled ? 'Enabled' : 'Disabled';
    toggle.setAttribute('aria-pressed', String(enabled));
    toggle.addEventListener('click', () => {
      toggleAutomation(upg.id);
      // re-render handled by caller or direct DOM patch below
      _patchToggle(card, upg.id);
    });
    card.appendChild(toggle);
  }

  return card;
}

/** Patch only the toggle button and indicator in-place after a toggle click. */
function _patchToggle(card, id) {
  const enabled = _isEnabled(id);

  const indicator = card.querySelector('.automation-active-indicator');
  if (indicator) {
    indicator.classList.toggle('automation-active-indicator--on', enabled);
  }

  const btn = card.querySelector('.automation-card__toggle-btn');
  if (btn) {
    btn.textContent = enabled ? 'Enabled' : 'Disabled';
    btn.setAttribute('aria-pressed', String(enabled));
    btn.classList.toggle('automation-card__toggle-btn--active', enabled);
  }
}

// ─── Mount ────────────────────────────────────────────────────────────────────

export function initAutomationTab() {
  const root = document.getElementById('tab-automation');
  if (!root) return;

  function render() {
    root.innerHTML = '';

    const heading = document.createElement('h2');
    heading.className = 'automation-tab__title';
    heading.textContent = 'Automation';
    root.appendChild(heading);

    const list = document.createElement('div');
    list.className = 'automation-tab__list';

    for (const upg of AUTOMATION_UPGRADES) {
      list.appendChild(_renderCard(upg));
    }

    root.appendChild(list);
  }

  render();

  // Re-render on resource or upgrade changes so owned/affordable states update.
  Bus.on('resource:change', render);
  Bus.on('upgrade:purchased', render);
}
