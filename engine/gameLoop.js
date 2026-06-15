// engine/gameLoop.js — Central loop integrator for Cosmic Fishing.
// C0 NODE-SAFETY: no browser globals at module top level.
// setInterval is accessed only inside start() with a typeof guard.

import { sellValueOf, aggregateEffects, addResource } from './economy.js';
import { resolveCatch, checkImpossibleTriggers, resolveNetCatch } from './rarity.js';
import { tickAutomation, processResearchQueue } from './automation.js';
import { tickEvents, getActiveEvent, tryTriggerBirthOfStar } from './events_engine.js';
import { GameState, Bus, sessionFlags } from './state.js';

// ─── Module-level cast state (never NaN/Infinity) ─────────────────────────────

let _castActive    = false;
let _castRemaining = 0;  // seconds

// ─── Loop handle + timing ─────────────────────────────────────────────────────

let _intervalHandle = null;
const TICK_MS       = 100;          // 100 ms tick
const AUTOSAVE_INTERVAL = 30;       // autosave every 30 real-seconds of playtime

let _lastTickTime    = 0;
let _autosaveAccum   = 0;           // real-seconds since last autosave

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Clamp a number to a finite value; returns fallback on NaN/Infinity. */
function _finite(v, fallback = 0) {
  return Number.isFinite(v) ? v : fallback;
}

/** Build context for rarity functions. */
function _buildContext() {
  const bonuses     = aggregateEffects(GameState);
  const activeEvent = getActiveEvent();
  return {
    bonuses,
    activeEvent: activeEvent ? activeEvent.id : null,
    realm: GameState.currentRealm || 'pond',
  };
}

/** One loop tick — called every TICK_MS ms. */
function _tick() {
  const now = Date.now();
  const dt  = _lastTickTime > 0
    ? _finite((now - _lastTickTime) / 1000, TICK_MS / 1000)
    : TICK_MS / 1000;
  _lastTickTime = now;

  // A-008: throttle when tab hidden — still track time but skip heavy work.
  const hidden = sessionFlags.tabHidden === true;

  // ── Playtime / realm time accrual ────────────────────────────────────────
  if (!hidden) {
    const stats = GameState.statistics;
    if (stats) {
      stats.playtimeSeconds = _finite(stats.playtimeSeconds) + dt;

      const realm = GameState.currentRealm || 'pond';
      if (!stats.realmTimeSeconds) stats.realmTimeSeconds = {};
      stats.realmTimeSeconds[realm] = _finite(stats.realmTimeSeconds[realm]) + dt;
    }
  }

  // ── Active cast timer ────────────────────────────────────────────────────
  if (_castActive && !hidden) {
    _castRemaining -= dt;
    if (_castRemaining < 0) _castRemaining = 0;

    Bus.emit('cast:progress', {
      remaining: _castRemaining,
      active: true,
    });

    if (_castRemaining <= 0) {
      _castActive = false;
      resolveCast();
    }
  }

  // ── Sub-systems ───────────────────────────────────────────────────────────
  if (!hidden) {
    processResearchQueue(now);
    tickAutomation(dt);
    tickEvents(dt);

    // tryTriggerBirthOfStar: only when in cosmic_void, no concurrent event
    if (GameState.currentRealm === 'cosmic_void') {
      tryTriggerBirthOfStar();
    }
  }

  // ── Autosave timing (delegate to save module if available) ────────────────
  if (!hidden) {
    _autosaveAccum += dt;
    if (_autosaveAccum >= AUTOSAVE_INTERVAL) {
      _autosaveAccum = 0;
      Bus.emit('tick:autosave', {});
    }
  }

  // ── General tick event for UI ─────────────────────────────────────────────
  Bus.emit('tick', { dt, now, castActive: _castActive, castRemaining: _castRemaining });
}

// ─── Exported API (C3) ────────────────────────────────────────────────────────

/**
 * start() — begin the 100 ms game loop.
 * Idempotent; guarded with typeof setInterval (C0).
 */
export function start() {
  if (_intervalHandle !== null) return;
  if (typeof setInterval === 'undefined') return; // Node.js --check safety
  _lastTickTime = Date.now();
  _intervalHandle = setInterval(_tick, TICK_MS);
}

/**
 * stop() — halt the game loop.
 */
export function stop() {
  if (_intervalHandle === null) return;
  if (typeof clearInterval !== 'undefined') clearInterval(_intervalHandle);
  _intervalHandle = null;
}

/**
 * initiateCast() — begin a manual cast (FR-001).
 * Ignored if a cast is already active.
 * Cast time = baseCastTime × bonuses.castTimeMultiplier, floored at 0.5 s (A-002).
 */
export function initiateCast() {
  if (_castActive) return;

  const bonuses     = aggregateEffects(GameState);
  const baseCastTime = 3; // seconds base cast time
  let   castTime    = _finite(baseCastTime * bonuses.castTimeMultiplier, baseCastTime);
  if (castTime < 0.5) castTime = 0.5; // A-002 floor

  _castActive    = true;
  _castRemaining = castTime;

  Bus.emit('cast:start', { castTime });
}

/**
 * resolveCast() — resolve the current cast into a catch (FR-003).
 * Builds C1 Catch: checks impossible triggers first, then rarity.resolveCatch.
 * Sets sellValue via economy.sellValueOf, isNewDiscovery from encyclopediaDiscoveries
 * BEFORE recordCatch. Calls recordCatch, then emits catch:new UNCHANGED.
 * Also increments castsSinceLastBirthOfStar and tracks temporalSpeciesCaughtThisSession.
 */
export function resolveCast() {
  const context = _buildContext();

  // FR-015: check impossible triggers first.
  let catchObj = checkImpossibleTriggers(GameState, context);
  if (!catchObj) {
    catchObj = resolveCatch(GameState.currentRealm || 'pond', context);
  }

  // C1: set sellValue via economy.sellValueOf (bonuses already applied).
  catchObj.sellValue = _finite(sellValueOf(catchObj), 0);

  // C1: isNewDiscovery from encyclopediaDiscoveries BEFORE recordCatch.
  catchObj.isNewDiscovery = !(GameState.encyclopediaDiscoveries &&
    GameState.encyclopediaDiscoveries[catchObj.speciesId]);

  // Record BEFORE emitting (C1 guarantee: emit UNCHANGED after all fields set).
  recordCatch(catchObj);

  // Update sessionFlags for Birth of a Star / Moment Made Flesh triggers.
  sessionFlags.castsSinceLastBirthOfStar =
    _finite(sessionFlags.castsSinceLastBirthOfStar) + 1;

  // Temporal species tracking (only when in time_ocean realm).
  if (GameState.currentRealm === 'time_ocean' && catchObj.speciesId) {
    const tsc = sessionFlags.temporalSpeciesCaughtThisSession;
    if (!tsc.includes(catchObj.speciesId)) {
      tsc.push(catchObj.speciesId);
    }
  }

  Bus.emit('catch:new', catchObj);
}

/**
 * recordCatch(catch) — SOLE writer of stats, catch log, and encyclopedia (M3/M4, C3).
 * Updates: totalFishCaught, totalCasts (for cast-originated catches), rarityCounts,
 * largestCatch, mostValuableCatch, catchLog (cap 50), encyclopediaDiscoveries,
 * lifetimeCastCount. Awards Void Shard / Temporal Crystal drops.
 */
export function recordCatch(catchObj) {
  if (!catchObj || typeof catchObj !== 'object') return;

  const stats = GameState.statistics;
  if (!stats) return;

  // ── Counts ────────────────────────────────────────────────────────────────
  stats.totalFishCaught = _finite(stats.totalFishCaught) + 1;

  // totalCasts increments for every cast (net catches are not cast-originated;
  // fromNet indicates net origin; we count casts from manual/auto-cast sources).
  if (!catchObj.fromNet) {
    stats.totalCasts    = _finite(stats.totalCasts) + 1;
    GameState.lifetimeCastCount = _finite(GameState.lifetimeCastCount) + 1;
  }

  // ── Rarity counts ─────────────────────────────────────────────────────────
  if (!stats.rarityCounts) stats.rarityCounts = {};
  const rarity = catchObj.rarity;
  if (rarity) {
    stats.rarityCounts[rarity] = _finite(stats.rarityCounts[rarity]) + 1;
  }

  // ── Largest catch ─────────────────────────────────────────────────────────
  const size = _finite(catchObj.size, 0);
  if (!stats.largestCatch || size > _finite(stats.largestCatch.size, 0)) {
    stats.largestCatch = catchObj;
  }

  // ── Most valuable catch ───────────────────────────────────────────────────
  const sv = _finite(catchObj.sellValue, 0);
  if (!stats.mostValuableCatch || sv > _finite(stats.mostValuableCatch.sellValue, 0)) {
    stats.mostValuableCatch = catchObj;
  }

  // ── Catch log (cap 50) ────────────────────────────────────────────────────
  if (!Array.isArray(stats.catchLog)) stats.catchLog = [];
  stats.catchLog.unshift(catchObj);
  if (stats.catchLog.length > 50) stats.catchLog.length = 50;

  // ── Encyclopedia discoveries ──────────────────────────────────────────────
  const speciesId = catchObj.speciesId;
  if (speciesId) {
    if (!GameState.encyclopediaDiscoveries) GameState.encyclopediaDiscoveries = {};
    const existing = GameState.encyclopediaDiscoveries[speciesId];
    if (!existing) {
      // First ever catch of this species.
      GameState.encyclopediaDiscoveries[speciesId] = {
        firstCaughtAt: Date.now(),
        catchCount: 1,
      };
      Bus.emit('encyclopedia:discover', { speciesId });
    } else {
      existing.catchCount = _finite(existing.catchCount) + 1;
    }
  }

  // ── Resource drops: Void Shards & Temporal Crystals ──────────────────────
  const bonuses = aggregateEffects(GameState);

  // Base void shard rate is 0.05; bonuses.voidShardRate is additive on top.
  const voidRate = _finite(0.05 + bonuses.voidShardRate, 0.05);
  if (Math.random() < voidRate) {
    addResource('voidShards', 1);
  }

  // Temporal crystal rate is purely additive bonus (base 0).
  const tcRate = _finite(bonuses.temporalCrystalRate, 0);
  if (tcRate > 0 && Math.random() < tcRate) {
    addResource('temporalCrystals', 1);
  }
}

/**
 * spendCrystalRewind(catch) → {ok} (FR-026).
 * Deduct 1 Temporal Crystal, re-roll the current catch, emit catch:new with new catch.
 */
export function spendCrystalRewind(catchObj) {
  if (_finite(GameState.resources.temporalCrystals) < 1) {
    return { ok: false };
  }

  addResource('temporalCrystals', -1);

  // Re-roll using the same realm context.
  const context  = _buildContext();
  let newCatch   = checkImpossibleTriggers(GameState, context);
  if (!newCatch) {
    newCatch = resolveCatch(GameState.currentRealm || 'pond', context);
  }

  newCatch.sellValue      = _finite(sellValueOf(newCatch), 0);
  newCatch.isNewDiscovery = !(GameState.encyclopediaDiscoveries &&
    GameState.encyclopediaDiscoveries[newCatch.speciesId]);

  recordCatch(newCatch);
  Bus.emit('catch:new', newCatch);
  return { ok: true };
}

/**
 * spendCrystalFastForward() → {ok} (FR-026).
 * Deduct 3 Temporal Crystals, instantly complete the current cast timer.
 */
export function spendCrystalFastForward() {
  if (_finite(GameState.resources.temporalCrystals) < 3) {
    return { ok: false };
  }

  addResource('temporalCrystals', -3);
  _castRemaining = 0;
  return { ok: true };
}
