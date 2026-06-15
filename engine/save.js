// engine/save.js — persistence layer (C3, T13).
//
// C0 NODE-SAFETY: No top-level access to localStorage, setInterval, btoa, or
// any other browser global. All such access lives inside exported functions.

import { GameState, createDefaultState, replaceState, Bus, resetSessionFlags } from './state.js';

const SAVE_KEY = 'cosmic_fishing_save';
const CURRENT_SAVE_VERSION = 1;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function hasLocalStorage() {
  return typeof localStorage !== 'undefined';
}

/**
 * Migrate a parsed save object to the current version.
 * Strategy (FR-124): merge loaded data onto a fresh default state so missing
 * keys are filled with defaults and unknown/future keys are preserved.
 */
function migrate(raw) {
  const base = createDefaultState();
  // Deep-merge top-level keys: objects get key-level merge, primitives/arrays
  // are taken from raw if present, otherwise base default stands.
  const result = Object.assign({}, base);
  for (const key of Object.keys(raw)) {
    if (
      raw[key] !== null &&
      typeof raw[key] === 'object' &&
      !Array.isArray(raw[key]) &&
      typeof base[key] === 'object' &&
      base[key] !== null &&
      !Array.isArray(base[key])
    ) {
      // Shallow-merge nested objects so new sub-keys default in
      result[key] = Object.assign({}, base[key], raw[key]);
    } else {
      result[key] = raw[key];
    }
  }
  result.saveVersion = CURRENT_SAVE_VERSION;
  return result;
}

/**
 * Minimal validation: must be a non-null object with saveVersion.
 */
function isValidSave(obj) {
  return obj !== null && typeof obj === 'object' && typeof obj.saveVersion === 'number';
}

// ---------------------------------------------------------------------------
// Exported API (C3)
// ---------------------------------------------------------------------------

/**
 * save() — serialize GameState (stamping timestamp) to localStorage and emit
 * "save:complete" on Bus. No-op if localStorage is unavailable.
 */
export function save() {
  if (!hasLocalStorage()) return;
  GameState.timestamp = Date.now();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(GameState));
    Bus.emit('save:complete', {});
  } catch (_) {
    // Storage full or access denied — silently ignore.
  }
}

/**
 * load() — read + parse localStorage. Returns migrated state (and calls
 * replaceState) on success; returns null on absent/corrupt save (NFR-005,
 * never throws).
 */
export function load() {
  if (!hasLocalStorage()) return null;
  let raw;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch (_) {
    return null;
  }
  if (raw === null || raw === undefined) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_) {
    // Corrupt JSON — NFR-005: never throw, just return null.
    return null;
  }
  if (!isValidSave(parsed)) return null;
  const migrated = migrate(parsed);
  replaceState(migrated);
  return migrated;
}

/**
 * exportSave() — return base64-encoded JSON of the current GameState.
 * Works in both browser (btoa) and Node (Buffer).
 */
export function exportSave() {
  const json = JSON.stringify(GameState);
  if (typeof btoa !== 'undefined') {
    return btoa(json);
  }
  // Node fallback
  return Buffer.from(json, 'utf8').toString('base64');
}

/**
 * importSave(str) — base64-decode → JSON.parse → validate → replaceState.
 * Returns { ok: true } on success or { ok: false, reason: string } on failure.
 */
export function importSave(str) {
  if (typeof str !== 'string' || str.length === 0) {
    return { ok: false, reason: 'empty input' };
  }
  let json;
  try {
    if (typeof atob !== 'undefined') {
      json = atob(str);
    } else {
      json = Buffer.from(str, 'base64').toString('utf8');
    }
  } catch (_) {
    return { ok: false, reason: 'base64 decode failed' };
  }
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch (_) {
    return { ok: false, reason: 'invalid JSON' };
  }
  if (!isValidSave(parsed)) {
    return { ok: false, reason: 'invalid save structure' };
  }
  const migrated = migrate(parsed);
  replaceState(migrated);
  return { ok: true };
}

/**
 * resetSave() — remove persisted save, reset GameState to defaults, reset
 * session flags.
 */
export function resetSave() {
  if (hasLocalStorage()) {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch (_) {}
  }
  replaceState(createDefaultState());
  resetSessionFlags();
}

/**
 * startAutosave() — start a 60-second autosave interval. Returns the handle.
 * Guard: no-op if setInterval is unavailable.
 */
export function startAutosave() {
  if (typeof setInterval === 'undefined') return null;
  return setInterval(save, 60000);
}
