// ui/main.js — App bootstrap. Wires engine + UI modules together.
// C0 NODE-SAFETY: NO browser globals (document/window/localStorage) at module
// top level. All such access is inside boot() which is called on DOMContentLoaded.

import { GameState, replaceState, Bus, sessionFlags } from '../engine/state.js';
import { save, load, exportSave, importSave, resetSave, startAutosave } from '../engine/save.js';
import { computeOffline } from '../engine/offline.js';
import { start, stop, initiateCast, resolveCast, recordCatch, spendCrystalRewind, spendCrystalFastForward } from '../engine/gameLoop.js';
import { initResourceBar } from './resourceBar.js';
import { initCastPanel } from './castPanel.js';
import { initRealmPanel } from './realmPanel.js';
import { initEncyclopediaTab } from './encyclopediaTab.js';
import { initUpgradesTab } from './upgradesTab.js';
import { initResearchTab } from './researchTab.js';
import { initAutomationTab } from './automationTab.js';
import { initEventsTab } from './eventsTab.js';
import { initAscensionTab } from './ascensionTab.js';
import { initStatisticsTab } from './statisticsTab.js';
import { initSettingsTab } from './settingsTab.js';
import { initAchievements } from './achievements.js';
import { initFishingScene } from './fishingScene.js';

// ─── Tab navigation ────────────────────────────────────────────────────────────

const TAB_IDS = [
  'encyclopedia', 'upgrades', 'research', 'automation',
  'events', 'ascension', 'statistics', 'achievements', 'settings'
];

const DEFAULT_TAB = 'encyclopedia';

function switchTab(name) {
  // Accept both prefixed ("tab-encyclopedia", from data-tab attrs) and
  // unprefixed ("encyclopedia", from Bus 'ui:open-tab') identifiers.
  const id = String(name).replace(/^tab-/, '');
  for (const tabId of TAB_IDS) {
    const panel = document.getElementById('tab-' + tabId);
    if (panel) {
      const active = (tabId === id);
      panel.classList.toggle('active', active);
      panel.setAttribute('aria-hidden', active ? 'false' : 'true');
      panel.hidden = !active;
    }
  }
  const buttons = document.querySelectorAll('[data-tab]');
  for (const btn of buttons) {
    const active = btn.dataset.tab.replace(/^tab-/, '') === id;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
    btn.tabIndex = active ? 0 : -1;
  }
  try {
    localStorage.setItem('cosmic_fishing_active_tab', id);
  } catch (_) { /* localStorage may throw in some contexts */ }
  Bus.emit('tab:show', { id });
}

// ─── Welcome-back overlay (FR-112, C6) ────────────────────────────────────────

function formatDuration(seconds) {
  if (seconds < 60) return Math.floor(seconds) + 's';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ' + Math.floor(seconds % 60) + 's';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h + 'h ' + m + 'm';
}

function renderWelcomeBack(summary) {
  // Only show if meaningful: any fish caught, gold earned, or >3 minutes elapsed.
  const meaningful = summary.fishCaught > 0 || summary.goldEarned > 0 || summary.elapsedSeconds > 180;
  if (!meaningful) return;

  const el = document.getElementById('welcome-back');
  if (!el) return;

  const totalFish = summary.fishCaught + summary.netFishCaught;

  let html = '<div class="welcome-back-box">';
  html += '<h2>Welcome Back!</h2>';
  html += '<p>You were away for <strong>' + formatDuration(summary.elapsedSeconds) + '</strong>';
  if (summary.capped) html += ' (progress capped at 8h)';
  html += '.</p>';

  if (totalFish > 0 || summary.goldEarned > 0) {
    html += '<ul>';
    if (totalFish > 0) html += '<li>Fish caught: <strong>' + totalFish + '</strong></li>';
    if (summary.goldEarned > 0) html += '<li>Gold earned: <strong>' + Math.floor(summary.goldEarned) + '</strong></li>';
    if (summary.rpEarned > 0) html += '<li>Research Points: <strong>' + Math.floor(summary.rpEarned) + '</strong></li>';
    if (summary.notable && summary.notable.length > 0) {
      const highlights = summary.notable.slice(0, 3);
      html += '<li>Notable catches: ' + highlights.map(n => n.name + ' (' + n.rarity + ')').join(', ') + '</li>';
    }
    html += '</ul>';
  } else {
    html += '<p>No automation was active, so no progress was earned.</p>';
  }

  html += '<button type="button" id="welcome-back-close">Dismiss</button>';
  html += '</div>';

  el.innerHTML = html;
  el.hidden = false;

  document.getElementById('welcome-back-close').addEventListener('click', function () {
    el.hidden = true;
    el.innerHTML = '';
  });
}

// ─── Boot ──────────────────────────────────────────────────────────────────────

function boot() {
  // 1. Load save
  const loaded = load();
  let firstRun = false;
  if (loaded) {
    replaceState(loaded);
  } else {
    firstRun = true;
  }

  // 2. Offline progression (FR-112)
  if (loaded && GameState.lastLoginTimestamp > 0) {
    const summary = computeOffline(GameState, Date.now());
    renderWelcomeBack(summary);
  } else if (firstRun) {
    // FR-125: first-run hint (small, no overlay)
    const el = document.getElementById('welcome-back');
    if (el) {
      el.innerHTML = '<div class="welcome-back-box"><p>Welcome to Cosmic Fishing! Cast your line to begin.</p>'
        + '<button type="button" id="welcome-back-close">Got it</button></div>';
      el.hidden = false;
      document.getElementById('welcome-back-close').addEventListener('click', function () {
        el.hidden = true;
        el.innerHTML = '';
      });
    }
  }

  // 3. Apply realm body class
  const body = document.body;
  const realmClass = 'realm-' + (GameState.currentRealm || 'pond');
  for (const cls of Array.from(body.classList)) {
    if (cls.startsWith('realm-')) body.classList.remove(cls);
  }
  body.classList.add(realmClass);

  // 4. Apply settings
  if (GameState.settings && GameState.settings.reduceAnimations) {
    body.classList.add('reduce-animations');
  }

  // 5. Initialize UI modules (errors isolated so one bad init won't abort boot)
  const inits = [
    ['initResourceBar',    initResourceBar],
    ['initCastPanel',      initCastPanel],
    ['initFishingScene',   initFishingScene],
    ['initRealmPanel',     initRealmPanel],
    ['initEncyclopediaTab',initEncyclopediaTab],
    ['initUpgradesTab',    initUpgradesTab],
    ['initResearchTab',    initResearchTab],
    ['initAutomationTab',  initAutomationTab],
    ['initEventsTab',      initEventsTab],
    ['initAscensionTab',   initAscensionTab],
    ['initStatisticsTab',  initStatisticsTab],
    ['initSettingsTab',    initSettingsTab],
    ['initAchievements',   initAchievements],
  ];
  for (const [name, fn] of inits) {
    try {
      fn();
    } catch (err) {
      console.error('[main] ' + name + ' failed:', err);
    }
  }

  // 6. Tab navigation
  const tabNav = document.getElementById('tab-nav');
  if (tabNav) tabNav.setAttribute('role', 'tablist');

  const tabButtons = document.querySelectorAll('[data-tab]');
  for (const btn of tabButtons) {
    const tabName = btn.dataset.tab.replace(/^tab-/, '');
    btn.setAttribute('role', 'tab');
    btn.setAttribute('id', 'tabbtn-' + tabName);
    btn.setAttribute('aria-controls', 'tab-' + tabName);
    btn.addEventListener('click', function () {
      switchTab(this.dataset.tab);
    });
  }
  for (const tabId of TAB_IDS) {
    const panel = document.getElementById('tab-' + tabId);
    if (panel) {
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', 'tabbtn-' + tabId);
    }
  }

  if (tabNav) {
    tabNav.addEventListener('keydown', function (e) {
      const btns = Array.from(tabNav.querySelectorAll('[data-tab]'));
      const current = btns.findIndex(b => b === document.activeElement);
      if (current === -1) return;
      let next = -1;
      if (e.key === 'ArrowRight') next = (current + 1) % btns.length;
      else if (e.key === 'ArrowLeft') next = (current - 1 + btns.length) % btns.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = btns.length - 1;
      if (next !== -1) {
        e.preventDefault();
        btns[next].focus();
        switchTab(btns[next].dataset.tab);
      }
    });
  }

  let initialTab = DEFAULT_TAB;
  try {
    const stored = localStorage.getItem('cosmic_fishing_active_tab');
    if (stored && TAB_IDS.includes(stored)) initialTab = stored;
  } catch (_) { /* localStorage may throw */ }
  switchTab(initialTab);

  Bus.on('ui:open-tab', function (payload) {
    if (payload && payload.tab) switchTab(payload.tab);
  });

  // 7. Start engine
  start();
  startAutosave();

  // 8. Visibility handling (FR-072)
  document.addEventListener('visibilitychange', function () {
    sessionFlags.tabHidden = document.hidden;
  });
}

// Entry point — C0 safe: no top-level browser access
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}
