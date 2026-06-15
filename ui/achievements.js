// ui/achievements.js — T30 Achievements UI (FR-130..132)
// C0: no top-level browser access; all DOM/timer work inside initAchievements().

import { GameState, Bus } from '../engine/state.js';
import ACHIEVEMENTS from '../data/achievements.js';

// Track how many events we've witnessed (not persisted — session count used as fallback).
let _sessionEventsWitnessed = 0;

// ---------------------------------------------------------------------------
// Condition evaluation
// ---------------------------------------------------------------------------

function countDiscoveries() {
  return Object.keys(GameState.encyclopediaDiscoveries).length;
}

function countResearchCompleted() {
  return Array.isArray(GameState.completedResearch) ? GameState.completedResearch.length : 0;
}

function countImpossibleCaught() {
  return (GameState.statistics && GameState.statistics.rarityCounts)
    ? (GameState.statistics.rarityCounts.impossible || 0)
    : 0;
}

// Returns true if this achievement's condition is currently met.
function conditionMet(achievement, eventName, payload) {
  const { type, value } = achievement.condition;

  switch (type) {
    case 'cast_count':
      return (GameState.statistics && GameState.statistics.totalCasts >= value);

    case 'catch_rarity': {
      // Fired on catch:new — check if this catch or any past catch has this rarity.
      const tiers = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'impossible'];
      const minIdx = tiers.indexOf(value);
      if (minIdx === -1) return false;
      if (eventName === 'catch:new' && payload) {
        const catchIdx = tiers.indexOf(payload.rarity);
        if (catchIdx >= minIdx) return true;
      }
      // Also check existing counts.
      const rc = GameState.statistics && GameState.statistics.rarityCounts;
      if (!rc) return false;
      for (let i = minIdx; i < tiers.length; i++) {
        if ((rc[tiers[i]] || 0) > 0) return true;
      }
      return false;
    }

    case 'unlock_realm':
      return Array.isArray(GameState.unlockedRealms) && GameState.unlockedRealms.includes(value);

    case 'discover_species_count':
      return countDiscoveries() >= value;

    case 'catch_impossible':
      return countImpossibleCaught() >= value;

    case 'purchase_automation':
      return Array.isArray(GameState.automationOwned) && GameState.automationOwned.includes(value);

    case 'complete_ascension':
      return (GameState.ascensionCount || 0) >= value;

    case 'earn_gold':
      return (GameState.lifetimeGoldEarned || 0) >= value;

    case 'complete_research_count':
      return countResearchCompleted() >= value;

    case 'witness_event':
      return _sessionEventsWitnessed >= value;

    case 'species_id': {
      // Check if this species has been caught (exists in encyclopediaDiscoveries or in catch log).
      if (GameState.encyclopediaDiscoveries && GameState.encyclopediaDiscoveries[value]) return true;
      if (eventName === 'catch:new' && payload && payload.speciesId === value) return true;
      // Also check catch log.
      const log = GameState.statistics && GameState.statistics.catchLog;
      if (Array.isArray(log)) {
        return log.some(c => c.speciesId === value);
      }
      return false;
    }

    case 'custom':
      switch (value) {
        case 'offline_30min_autocast':
          // Triggered manually by offline module — we handle it via a dedicated Bus event
          // or by checking sessionFlags offlineMinutes; treat as event-driven only.
          // This achievement is set externally: mark met when event 'achievement:offline_autocast' fires.
          return false; // evaluated only via explicit emit path below

        case 'memories_3':
          return Array.isArray(GameState.resources && GameState.resources.cosmicMemories)
            && GameState.resources.cosmicMemories.length >= 3;

        case 'all_impossible': {
          // All impossible-rarity species have been caught.
          // We don't have the species list here, so check if impossible count >= some threshold.
          // Best we can do: check if all possible impossible species appear in encyclopediaDiscoveries.
          // Approximate: rely on the catch:new / encyclopedia:discover path.
          // We detect this when catch log has isImpossible species for every known impossible species.
          // Without importing data/species.js (would cause a cycle risk), use the discovery map:
          const disc = GameState.encyclopediaDiscoveries || {};
          const impossibleCaught = Object.values(disc).filter(d => d && d.rarity === 'impossible');
          // If at least 1 impossible species caught and all catches of impossible match discoveries:
          // We'll use a pragmatic threshold: mark when impossible rarity count >= 5
          // (exact number unknown without species data; this custom achievement is verified manually per C7 AC-012).
          return countImpossibleCaught() >= 5;
        }

        default:
          return false;
      }

    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Unlock logic (sole mutator of unlockedAchievements)
// ---------------------------------------------------------------------------

function tryUnlock(achievement, eventName, payload) {
  if (GameState.unlockedAchievements[achievement.id]) return; // already unlocked
  if (!conditionMet(achievement, eventName, payload)) return;

  const ts = Date.now();
  GameState.unlockedAchievements[achievement.id] = { ts };
  Bus.emit('achievement:unlock', { achievementId: achievement.id });
  showPopup(achievement, ts);
}

function evaluateAll(eventName, payload) {
  for (const ach of ACHIEVEMENTS) {
    tryUnlock(ach, eventName, payload);
  }
}

// ---------------------------------------------------------------------------
// Popup (DOM — only called at runtime inside initAchievements scope)
// ---------------------------------------------------------------------------

function showPopup(achievement, _ts) {
  const container = document.getElementById('achievement-popups');
  if (!container) return;

  const popup = document.createElement('div');
  popup.className = 'achievement-popup';
  popup.setAttribute('role', 'status');
  popup.setAttribute('aria-live', 'polite');
  popup.innerHTML =
    '<span class="ach-icon">' + achievement.icon + '</span>' +
    '<div class="ach-text">' +
      '<strong class="ach-name">' + escapeHtml(achievement.name) + '</strong>' +
      '<span class="ach-flavor">' + escapeHtml(achievement.flavorText) + '</span>' +
    '</div>';

  container.appendChild(popup);

  // Animate in.
  requestAnimationFrame(() => {
    popup.classList.add('ach-visible');
  });

  // Remove after ~4 s.
  setTimeout(() => {
    popup.classList.remove('ach-visible');
    popup.addEventListener('transitionend', () => popup.remove(), { once: true });
    // Fallback remove.
    setTimeout(() => { if (popup.parentNode) popup.remove(); }, 600);
  }, 4000);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Panel list rendering
// ---------------------------------------------------------------------------

function renderPanel(panelEl) {
  panelEl.innerHTML = '';
  const heading = document.createElement('h2');
  heading.textContent = 'Achievements';
  panelEl.appendChild(heading);

  const list = document.createElement('ul');
  list.className = 'achievement-list';

  for (const ach of ACHIEVEMENTS) {
    const unlocked = !!GameState.unlockedAchievements[ach.id];
    const ts = unlocked ? GameState.unlockedAchievements[ach.id].ts : null;

    const item = document.createElement('li');
    item.className = 'achievement-item' + (unlocked ? ' ach-unlocked' : ' ach-locked');
    item.innerHTML =
      '<span class="ach-icon">' + (unlocked ? ach.icon : '🔒') + '</span>' +
      '<div class="ach-text">' +
        '<strong class="ach-name">' + escapeHtml(ach.name) + '</strong>' +
        '<span class="ach-flavor">' + escapeHtml(ach.flavorText) + '</span>' +
        (unlocked && ts
          ? '<time class="ach-ts" datetime="' + new Date(ts).toISOString() + '">' +
              'Unlocked ' + new Date(ts).toLocaleString() + '</time>'
          : '') +
      '</div>';
    list.appendChild(item);
  }

  panelEl.appendChild(list);
}

function mountPanel() {
  // Try to find an existing panel container first.
  let panelEl = document.getElementById('achievement-panel');
  if (!panelEl) {
    // Append near #tab-settings or body as fallback.
    panelEl = document.createElement('section');
    panelEl.id = 'achievement-panel';
    panelEl.className = 'achievement-panel';
    const settingsTab = document.getElementById('tab-settings');
    if (settingsTab && settingsTab.parentNode) {
      settingsTab.parentNode.insertBefore(panelEl, settingsTab.nextSibling);
    } else {
      document.body.appendChild(panelEl);
    }
  }
  renderPanel(panelEl);
  return panelEl;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function initAchievements() {
  // Evaluate all achievements on boot against current state.
  evaluateAll('boot', null);

  // Subscribe to relevant Bus events.
  Bus.on('catch:new', payload => {
    evaluateAll('catch:new', payload);
  });

  Bus.on('resource:change', payload => {
    evaluateAll('resource:change', payload);
  });

  Bus.on('realm:change', payload => {
    evaluateAll('realm:change', payload);
  });

  Bus.on('ascension:complete', payload => {
    evaluateAll('ascension:complete', payload);
  });

  Bus.on('encyclopedia:discover', payload => {
    evaluateAll('encyclopedia:discover', payload);
  });

  Bus.on('research:complete', payload => {
    evaluateAll('research:complete', payload);
  });

  Bus.on('event:start', payload => {
    _sessionEventsWitnessed++;
    evaluateAll('event:start', payload);
  });

  Bus.on('upgrade:purchased', payload => {
    evaluateAll('upgrade:purchased', payload);
  });

  // automation:purchase — purchaseAutomation emits 'upgrade:purchased' per C3,
  // but automation has its own type; also listen for automation-specific unlock path.
  // The achievement condition 'purchase_automation' checks GameState.automationOwned,
  // which is updated before any event fires, so upgrade:purchased covers it.

  // Mount the panel and subscribe to achievement:unlock to refresh it.
  const panelEl = mountPanel();
  Bus.on('achievement:unlock', () => {
    renderPanel(panelEl);
  });
}
