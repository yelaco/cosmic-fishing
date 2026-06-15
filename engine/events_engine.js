// engine/events_engine.js — World-event lifecycle engine for Cosmic Fishing.
// C0: no browser globals, no setInterval at top level. tickEvents is called by gameLoop.

import EVENTS from '../data/events.js';
import { GameState, Bus, sessionFlags } from './state.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const SPAWN_MIN_SECONDS = 10 * 60; // 600s (10 min active play)
const SPAWN_MAX_SECONDS = 20 * 60; // 1200s (20 min active play)
const EVENT_HISTORY_CAP = 5;
const EVENT_LOG_CAP = 100;

// Pre-index by id for fast lookup.
const EVENT_BY_ID = Object.fromEntries(EVENTS.map(e => [e.id, e]));

// ---------------------------------------------------------------------------
// Internal state (also mirrored onto GameState for save persistence)
// ---------------------------------------------------------------------------
// GameState fields we manage:
//   GameState.activeEvent    : null | { id, remaining }
//   GameState.eventHistory   : string[]  (cap 5, most-recent-first)
//   GameState.eventLog       : Array<{ id, timestamp }>  (cap 100)
//   GameState.eventsWitnessed: number

function ensureState() {
  if (!('activeEvent' in GameState)) GameState.activeEvent = null;
  if (!Array.isArray(GameState.eventHistory)) GameState.eventHistory = [];
  if (!Array.isArray(GameState.eventLog)) GameState.eventLog = [];
  if (typeof GameState.eventsWitnessed !== 'number') GameState.eventsWitnessed = 0;
}

// Module-level spawn timer (active-seconds until next eligible random event).
let _spawnTimer = 0;
let _nextSpawnThreshold = _randomSpawnThreshold();

function _randomSpawnThreshold() {
  return SPAWN_MIN_SECONDS + Math.random() * (SPAWN_MAX_SECONDS - SPAWN_MIN_SECONDS);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
function _startEvent(eventDef) {
  ensureState();

  const record = { id: eventDef.id, remaining: eventDef.durationSeconds };
  GameState.activeEvent = record;
  GameState.eventsWitnessed = (GameState.eventsWitnessed || 0) + 1;

  // Log entry.
  GameState.eventLog.push({ id: eventDef.id, timestamp: Date.now() });
  if (GameState.eventLog.length > EVENT_LOG_CAP) {
    GameState.eventLog.splice(0, GameState.eventLog.length - EVENT_LOG_CAP);
  }

  Bus.emit('event:start', { eventId: eventDef.id });

  // Reset spawn timer for next event.
  _spawnTimer = 0;
  _nextSpawnThreshold = _randomSpawnThreshold();
}

function _endEvent() {
  ensureState();
  const ev = GameState.activeEvent;
  if (!ev) return;

  // Push to history (most-recent-first).
  GameState.eventHistory.unshift(ev.id);
  if (GameState.eventHistory.length > EVENT_HISTORY_CAP) {
    GameState.eventHistory.length = EVENT_HISTORY_CAP;
  }

  GameState.activeEvent = null;
  Bus.emit('event:end', { eventId: ev.id });
}

function _eligibleEvents() {
  ensureState();
  const realm = GameState.currentRealm;
  return EVENTS.filter(e => {
    // birth_of_a_star is handled exclusively by tryTriggerBirthOfStar.
    if (e.id === 'birth_of_a_star') return false;
    return Array.isArray(e.eligibleRealms) && e.eligibleRealms.includes(realm);
  });
}

// ---------------------------------------------------------------------------
// Exports (C3)
// ---------------------------------------------------------------------------

/**
 * tickEvents(dt) — call from game loop with dt = active-play seconds elapsed.
 * Advances active-event countdown; ends it when expired; otherwise accumulates
 * the spawn timer and may randomly start a new eligible event.
 */
export function tickEvents(dt) {
  ensureState();
  if (typeof dt !== 'number' || dt <= 0) return;

  // 1. Advance active event.
  if (GameState.activeEvent) {
    GameState.activeEvent.remaining -= dt;
    if (GameState.activeEvent.remaining <= 0) {
      _endEvent();
    }
    // While an event is active, do not spawn another.
    return;
  }

  // 2. Accumulate spawn timer.
  _spawnTimer += dt;
  if (_spawnTimer < _nextSpawnThreshold) return;

  // 3. Attempt to spawn a random eligible event.
  const pool = _eligibleEvents();
  if (pool.length === 0) {
    // No eligible events in this realm; reset timer and wait again.
    _spawnTimer = 0;
    _nextSpawnThreshold = _randomSpawnThreshold();
    return;
  }

  const pick = pool[Math.floor(Math.random() * pool.length)];
  _startEvent(pick);
}

/**
 * getActiveEvent() → the active event record { id, remaining } or null.
 */
export function getActiveEvent() {
  ensureState();
  return GameState.activeEvent ?? null;
}

/**
 * getActiveEventEffects() → effects array of the active event, or [] when none.
 */
export function getActiveEventEffects() {
  ensureState();
  const ev = GameState.activeEvent;
  if (!ev) return [];
  const def = EVENT_BY_ID[ev.id];
  if (!def) return [];
  return def.effects ?? [];
}

/**
 * tryTriggerBirthOfStar() → boolean.
 * Checks: cosmic_void realm + ascensionCount ≥ 5 + castsSinceLastBirthOfStar ≥ 10
 *         + per-cast probability 0.01. No event already active.
 * If triggered: starts birth_of_a_star, resets cooldown counter, returns true.
 */
export function tryTriggerBirthOfStar() {
  ensureState();

  // Guard: no concurrent event.
  if (GameState.activeEvent) return false;

  // Realm check.
  if (GameState.currentRealm !== 'cosmic_void') return false;

  // Ascension check.
  if ((GameState.ascensionCount ?? 0) < 5) return false;

  // Cooldown check (C4: sessionFlags.castsSinceLastBirthOfStar ≥ 10).
  if ((sessionFlags.castsSinceLastBirthOfStar ?? 0) < 10) return false;

  // Probability check (~0.01 per cast as per triggerCondition).
  const def = EVENT_BY_ID['birth_of_a_star'];
  const prob = def?.triggerCondition?.value ?? 0.01;
  if (Math.random() >= prob) return false;

  // All checks passed — trigger.
  sessionFlags.castsSinceLastBirthOfStar = 0;
  _startEvent(def);
  return true;
}
