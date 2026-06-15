// engine/offline.js — Offline progress computation.
// C0 NODE-SAFETY: no top-level access to document/window/localStorage/setInterval/rAF.
// Contract: C3 (exports computeOffline), C6 (uses rarity.resolveNetCatch — no duplicate tables),
//           C0 (node-safe), FR-110..113, A-006/A-007/A-008.

import { aggregateEffects, addGold, addRp } from './economy.js';
import { resolveCatch, resolveNetCatch } from './rarity.js';
import { GameState, sessionFlags } from './state.js';

// ─── Constants ─────────────────────────────────────────────────────────────────

/** A-006: max offline credit cap (ms). */
const MAX_OFFLINE_MS = 8 * 60 * 60 * 1000; // 8 hours

/** Base auto-cast interval (ms). Matches gameLoop convention; 0.5s floor applied after bonuses. */
const BASE_CAST_INTERVAL_MS = 5000;

/** Base boat passive net interval (ms). Matches boat_basic description: "every 30 seconds". */
const BASE_NET_INTERVAL_MS = 30000;

/** Rarity tiers considered "notable" (rare+) for the summary highlights. */
const NOTABLE_RARITIES = new Set(['rare', 'epic', 'legendary', 'mythic', 'impossible']);

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Guard a number — return 0 if NaN/Infinity (NFR-006). */
function safe(n) {
  return Number.isFinite(n) ? n : 0;
}

/**
 * Determine whether auto-cast automation is active on the given state.
 * Requires both ownership AND enabled flag (FR-113).
 */
function isAutoCastActive(state) {
  return (
    Array.isArray(state.automationOwned) &&
    state.automationOwned.includes('auto_cast') &&
    !!(state.automationEnabled && state.automationEnabled['auto_cast'])
  );
}

/**
 * Determine whether the player owns any boat upgrade that provides a passive net.
 * Boat net upgrades in data/upgrades.js: boat_basic, fishing_trawler, astral_net.
 * All have 'net_interval_multiplier' effects — owning any of them enables the net.
 */
function hasBoatNet(state) {
  if (!Array.isArray(state.ownedUpgrades)) return false;
  return (
    state.ownedUpgrades.includes('boat_basic') ||
    state.ownedUpgrades.includes('fishing_trawler') ||
    state.ownedUpgrades.includes('astral_net')
  );
}

// ─── Export ────────────────────────────────────────────────────────────────────

/**
 * computeOffline(state, now) → welcome-back summary (FR-112).
 *
 * @param {object} state  - GameState (or compatible snapshot). Mutated by addGold/addRp.
 * @param {number} [now]  - Injectable timestamp (ms). Defaults to Date.now().
 * @returns {{
 *   elapsedSeconds: number,
 *   capped: boolean,
 *   fishCaught: number,
 *   goldEarned: number,
 *   rpEarned: number,
 *   netFishCaught: number,
 *   notable: Array<{name:string, rarity:string, fromNet:boolean}>
 * }}
 */
export function computeOffline(state = GameState, now = Date.now()) {
  // ── 1. Elapsed time, capped at A-006 limit ──────────────────────────────────
  const last = (typeof state.lastLoginTimestamp === 'number' && state.lastLoginTimestamp > 0)
    ? state.lastLoginTimestamp
    : now;

  const rawElapsed = safe(now - last);
  const capped = rawElapsed > MAX_OFFLINE_MS;
  const elapsedMs = Math.max(0, Math.min(rawElapsed, MAX_OFFLINE_MS));
  const elapsedSeconds = elapsedMs / 1000;

  // ── 2. Check FR-113: must have auto-cast OR boat net to award progress ───────
  const autoCastEnabled = isAutoCastActive(state);
  const boatNetOwned    = hasBoatNet(state);

  if (!autoCastEnabled && !boatNetOwned) {
    return {
      elapsedSeconds,
      capped,
      fishCaught:    0,
      goldEarned:    0,
      rpEarned:      0,
      netFishCaught: 0,
      notable:       [],
    };
  }

  // ── 3. Bonuses ───────────────────────────────────────────────────────────────
  const bonuses = aggregateEffects(state);
  const realm   = state.currentRealm || 'pond';

  // ── 4. Auto-cast offline catches ─────────────────────────────────────────────
  let fishCaught    = 0;
  let goldEarned    = 0;
  let rpEarned      = 0;
  const notable     = [];

  if (autoCastEnabled && elapsedMs > 0) {
    // Effective cast interval; apply 0.5s floor after multiplier (C2 note).
    const castInterval = Math.max(
      500,
      safe(BASE_CAST_INTERVAL_MS * bonuses.autoCastIntervalMultiplier)
    );
    const castCount = Math.floor(elapsedMs / castInterval);

    const castContext = { bonuses, realm };

    for (let i = 0; i < castCount; i++) {
      const catchObj = resolveCatch(realm, castContext);

      // Auto-sell → gold (A-008: events are flavor-only offline, no event simulation).
      const gold = safe(catchObj.sellValue);
      goldEarned += gold;

      // Auto-research priority: award RP for catches not yet researched this session.
      // A simple heuristic: if species hasn't been seen in researchedThisRun, give RP once.
      const sp = catchObj.speciesId;
      const alreadyResearched = Array.isArray(sessionFlags.researchedThisRun) &&
                                sessionFlags.researchedThisRun.includes(sp);
      if (!alreadyResearched) {
        rpEarned += safe(catchObj.rpValue);
        // Don't mutate sessionFlags during offline calc — flavor only.
      }

      fishCaught++;

      if (NOTABLE_RARITIES.has(catchObj.rarity)) {
        notable.push({ name: catchObj.name, rarity: catchObj.rarity, fromNet: false });
      }
    }
  }

  // ── 5. Boat net offline catches ───────────────────────────────────────────────
  let netFishCaught = 0;

  if (boatNetOwned && elapsedMs > 0) {
    const netInterval = Math.max(
      1000,
      safe(BASE_NET_INTERVAL_MS * bonuses.netIntervalMultiplier)
    );
    const netCount = Math.floor(elapsedMs / netInterval);

    const netContext = { bonuses, realm };

    for (let i = 0; i < netCount; i++) {
      const catchObj = resolveNetCatch(realm, netContext);

      const gold = safe(catchObj.sellValue);
      goldEarned += gold;
      // Net catches: always auto-sell; RP only if not yet researched.
      const sp = catchObj.speciesId;
      const alreadyResearched = Array.isArray(sessionFlags.researchedThisRun) &&
                                sessionFlags.researchedThisRun.includes(sp);
      if (!alreadyResearched) {
        rpEarned += safe(catchObj.rpValue);
      }

      netFishCaught++;

      if (NOTABLE_RARITIES.has(catchObj.rarity)) {
        notable.push({ name: catchObj.name, rarity: catchObj.rarity, fromNet: true });
      }
    }
  }

  // ── 6. Final NaN/Infinity guards (NFR-006) ────────────────────────────────────
  goldEarned = safe(goldEarned);
  rpEarned   = safe(rpEarned);

  // ── 7. Award totals to GameState ─────────────────────────────────────────────
  if (goldEarned > 0) addGold(goldEarned);
  if (rpEarned   > 0) addRp(rpEarned);

  // ── 8. Return welcome-back summary (FR-112) ───────────────────────────────────
  return {
    elapsedSeconds,
    capped,
    fishCaught,
    goldEarned,
    rpEarned,
    netFishCaught,
    notable,
  };
}
