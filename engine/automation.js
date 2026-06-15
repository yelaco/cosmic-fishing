// engine/automation.js — Automation tick, purchase, and research queue.
// C0 NODE-SAFETY: no top-level browser globals. tickAutomation called by gameLoop.

import { sellCatch, researchCatch, addGold, addRp, aggregateEffects, purchaseUpgrade } from './economy.js';
import { resolveCatch, resolveNetCatch } from './rarity.js';
import UPGRADES from '../data/upgrades.js';
import { GameState, Bus, sessionFlags } from './state.js';

// ─── Internal constants ────────────────────────────────────────────────────────

const AUTO_CAST_BASE_INTERVAL = 5;  // seconds between automatic casts
const NET_BASE_INTERVAL       = 30; // seconds between net catches (A-007)

// ─── Internal state ───────────────────────────────────────────────────────────

// Timers accumulate fractional seconds across ticks.
let _castTimer = 0;
let _netTimer  = 0;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Return the automation upgrade record from data, or null. */
function _automationUpgrade(id) {
  return UPGRADES.find(u => u.id === id && u.category === 'automation') ?? null;
}

/** True when the_memory_that_fishes cosmic memory is active (auto-cast from start). */
function _hasMemoryAutoCast() {
  return (GameState.resources.cosmicMemories || []).includes('the_memory_that_fishes');
}

/** True when auto_cast is effectively active: owned+enabled OR memory override. */
function _autoCastActive() {
  return (
    GameState.automationOwned.includes('auto_cast') &&
    GameState.automationEnabled['auto_cast'] !== false
  ) || _hasMemoryAutoCast();
}

/** True when boat net is active: boat_basic owned. */
function _netActive() {
  return GameState.ownedUpgrades.includes('boat_basic');
}

/**
 * Apply the A-005 priority: if species not yet researched this run → research it,
 * else sell. When auto_sell is disabled, always attempt to emit catch:new for
 * manual handling.
 */
function _dispatchCatch(catchObj) {
  const autoSellOwned   = GameState.automationOwned.includes('auto_sell');
  const autoSellEnabled = GameState.automationEnabled['auto_sell'] !== false;
  const autoSell        = autoSellOwned && autoSellEnabled;

  if (sessionFlags.tabHidden) {
    // FR-072: accumulate into hiddenAccumulator
    sessionFlags.hiddenAccumulator.fish += 1;

    if (autoSell) {
      const alreadyResearched = sessionFlags.researchedThisRun.includes(catchObj.speciesId);
      if (!alreadyResearched) {
        // Research priority (A-005)
        sessionFlags.researchedThisRun.push(catchObj.speciesId);
        sessionFlags.hiddenAccumulator.rp += catchObj.rpValue ?? 0;
      } else {
        sessionFlags.hiddenAccumulator.gold += catchObj.sellValue ?? 0;
      }
    }
    // Emit so the UI / gameLoop can still record stats
    Bus.emit('catch:new', catchObj);
    return;
  }

  // Normal (tab visible) path
  Bus.emit('catch:new', catchObj);

  if (!autoSell) return;

  const alreadyResearched = sessionFlags.researchedThisRun.includes(catchObj.speciesId);
  if (!alreadyResearched) {
    // A-005: research once then sell on future catches
    sessionFlags.researchedThisRun.push(catchObj.speciesId);
    researchCatch(catchObj);
  } else {
    sellCatch(catchObj);
  }
}

// ─── Exported API ─────────────────────────────────────────────────────────────

/**
 * purchaseAutomation(id) → {ok, reason}
 * Deducts cost via purchaseUpgrade, pushes to automationOwned, enables by default.
 * Emits resource:change + upgrade:purchased (both via purchaseUpgrade).
 */
export function purchaseAutomation(id) {
  const upg = _automationUpgrade(id);
  if (!upg) return { ok: false, reason: 'unknown automation' };

  if (GameState.automationOwned.includes(id)) {
    return { ok: false, reason: 'already owned' };
  }

  // Reuse purchaseUpgrade for cost-check, deduction, and events.
  const result = purchaseUpgrade(id);
  if (!result.ok) return result;

  GameState.automationOwned.push(id);
  GameState.automationEnabled[id] = true;

  return { ok: true };
}

/**
 * toggleAutomation(id) → boolean (new enabled state)
 * Flips automationEnabled[id]. Requires owned.
 */
export function toggleAutomation(id) {
  if (!GameState.automationOwned.includes(id)) return false;
  const current = GameState.automationEnabled[id] !== false;
  GameState.automationEnabled[id] = !current;
  return GameState.automationEnabled[id];
}

/**
 * tickAutomation(dt) — called by gameLoop each frame (dt in seconds).
 * - auto_cast: accumulate timer, on expiry resolve a catch and dispatch it.
 * - boat net: accumulate net timer, on expiry resolve via resolveNetCatch and sell.
 */
export function tickAutomation(dt) {
  if (typeof dt !== 'number' || !Number.isFinite(dt) || dt <= 0) return;

  const bonuses = aggregateEffects(GameState);
  const realm   = GameState.currentRealm || 'pond';

  // ── Auto-cast ──────────────────────────────────────────────────────────────
  if (_autoCastActive()) {
    const interval = AUTO_CAST_BASE_INTERVAL * bonuses.autoCastIntervalMultiplier;
    _castTimer += dt;
    if (_castTimer >= interval) {
      _castTimer -= interval;
      const catchObj = resolveCatch(realm, { bonuses });
      _dispatchCatch(catchObj);
    }
  } else {
    _castTimer = 0;
  }

  // ── Boat passive net (A-007) ───────────────────────────────────────────────
  if (_netActive()) {
    const netInterval = NET_BASE_INTERVAL * bonuses.netIntervalMultiplier;
    _netTimer += dt;
    if (_netTimer >= netInterval) {
      _netTimer -= netInterval;
      const netCatch = resolveNetCatch(realm, { bonuses });

      if (sessionFlags.tabHidden) {
        sessionFlags.hiddenAccumulator.fish  += 1;
        sessionFlags.hiddenAccumulator.gold  += netCatch.sellValue ?? 0;
      } else {
        Bus.emit('catch:new', netCatch);
        sellCatch(netCatch);
      }
    }
  } else {
    _netTimer = 0;
  }
}

/**
 * processResearchQueue(now) — advance research queue slots.
 * research_drone (when owned+enabled) unlocks slot2.
 * @param {number} now  - current timestamp in ms (or seconds; used for duration checks)
 */
export function processResearchQueue(now) {
  const droneOwned   = GameState.automationOwned.includes('research_drone');
  const droneEnabled = GameState.automationEnabled['research_drone'] !== false;
  const slot2Active  = droneOwned && droneEnabled;

  const bonuses = aggregateEffects(GameState);
  const slots = slot2Active ? ['slot1', 'slot2'] : ['slot1'];

  for (const slot of slots) {
    const entry = GameState.researchQueue[slot];
    if (!entry) continue;

    // entry shape expected: { speciesId, startTime, duration }
    const elapsed = (now - (entry.startTime || now));
    const effectiveDuration = (entry.duration || 0) * bonuses.researchSpeedMultiplier;

    if (elapsed >= effectiveDuration) {
      // Complete the research
      if (!sessionFlags.researchedThisRun.includes(entry.speciesId)) {
        sessionFlags.researchedThisRun.push(entry.speciesId);
      }
      if (typeof entry.rpReward === 'number') {
        addRp(entry.rpReward * bonuses.rpMultiplier);
      }
      GameState.researchQueue[slot] = null;
    }
  }
}
