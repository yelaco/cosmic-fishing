// engine/realms.js — Realm unlock gating, transitions, and completion.
// C0 NODE-SAFETY: no top-level access to document/window/localStorage/
// setInterval/requestAnimationFrame. All GameState access is via parameters.

import SPECIES, { speciesByRealm } from '../data/species.js';
import UPGRADES from '../data/upgrades.js';
import RESEARCH from '../data/research.js';
import { GameState, Bus, RealmId } from './state.js';

// ── Display names ────────────────────────────────────────────────────────────
const REALM_NAMES = {
  pond:        'Pond',
  ocean:       'Ocean',
  abyss:       'Abyss',
  dream_sea:   'Dream Sea',
  time_ocean:  'Time Ocean',
  cosmic_void: 'Cosmic Void',
};

// ── Realm identity metadata ───────────────────────────────────────────────────
export const REALM_META = {
  pond:        { icon: '🪷', accent: '#5fd88a', feature: 'Stillness',  description: 'A quiet lily-dappled pool where the water barely breathes. Soft, forgiving, and full of small wonders.' },
  ocean:       { icon: '🌊', accent: '#30c8e8', feature: 'Tides',      description: 'Open blue expanse rolling to the horizon. Sunlight fractures into the shallows where bright schools dart.' },
  abyss:       { icon: '🌑', accent: '#5060c8', feature: 'Pressure',   description: 'The crushing dark below the light. Bioluminescent shapes drift through cold indigo silence.' },
  dream_sea:   { icon: '🌸', accent: '#f060c0', feature: 'Reverie',    description: 'A half-remembered ocean of lavender mist where fish swim through sleep itself. Nothing here is quite real.' },
  time_ocean:  { icon: '⏳', accent: '#ffc030', feature: 'Eons',       description: 'Golden currents that flow against the hours. Catches here have already happened, or never will.' },
  cosmic_void: { icon: '🌌', accent: '#9060ff', feature: 'Infinity',   description: 'The fishing ground at the end of everything. Stars hang like bait in electric violet nothing.' },
};

// ── Realm gate research node ids (FR-022) ───────────────────────────────────
const REALM_GATE = {
  ocean:       'oceanography',
  abyss:       'deep_pressure',
  dream_sea:   'oneiric_frequency',
  time_ocean:  'temporal_sensitivity',
  cosmic_void: 'void_sight',
};

// ── Lore flash strings (FR-023) ──────────────────────────────────────────────
export const LORE_FLASH = {
  pond:        'You cast into the familiar stillness of the pond.',
  ocean:       'Salt spray and horizon — the open ocean awaits.',
  abyss:       'The light fades. Something vast stirs below.',
  dream_sea:   'Reality softens. You are fishing inside a dream.',
  time_ocean:  'Past and future blur. The current flows both ways.',
  cosmic_void: 'Stars become fish. The void looks back.',
};

/**
 * canUnlock(realmId, state) → {ok: boolean, unmet: string[]}
 *
 * Checks all conditions for unlocking a realm (FR-022).
 * - pond is always unlocked.
 * - Each realm requires its gate research node completed in state.completedResearch.
 * - Each realm requires the previous realm to already be unlocked.
 * - dream_sea gate is relaxed if resources.cosmicMemories contains 'dream_walker'.
 */
export function canUnlock(realmId, state) {
  if (realmId === 'pond') return { ok: true, unmet: [] };

  const unmet = [];

  // Previous realm must be unlocked
  const idx = RealmId.indexOf(realmId);
  if (idx <= 0) {
    unmet.push(`Unknown realm: ${realmId}`);
    return { ok: false, unmet };
  }
  const prevRealm = RealmId[idx - 1];
  const unlockedRealms = state.unlockedRealms || [];
  if (!unlockedRealms.includes(prevRealm)) {
    unmet.push(`${REALM_NAMES[prevRealm]} must be unlocked first`);
  }

  // Research gate — dream_sea relaxed by dream_walker cosmic memory
  const gateNode = REALM_GATE[realmId];
  if (gateNode) {
    const completed = state.completedResearch || [];
    const hasGate = completed.includes(gateNode);

    if (!hasGate) {
      const hasDreamWalker =
        realmId === 'dream_sea' &&
        Array.isArray(state.resources?.cosmicMemories) &&
        state.resources.cosmicMemories.includes('dream_walker');

      if (!hasDreamWalker) {
        const node = RESEARCH.find(n => n.id === gateNode);
        const nodeName = node ? node.name : gateNode;
        unmet.push(`Research "${nodeName}" must be completed`);
      }
    }
  }

  return { ok: unmet.length === 0, unmet };
}

/**
 * transitionTo(realmId) → {ok: boolean, loreFlash?: string}
 *
 * If realm is already unlocked or canUnlock passes, transitions to it:
 * sets GameState.currentRealm, ensures realm is in unlockedRealms,
 * emits realm:change, returns a lore flash string.
 */
export function transitionTo(realmId) {
  const unlockedRealms = GameState.unlockedRealms || [];
  const alreadyUnlocked = unlockedRealms.includes(realmId);

  if (!alreadyUnlocked) {
    const check = canUnlock(realmId, GameState);
    if (!check.ok) return { ok: false, loreFlash: null };
  }

  const from = GameState.currentRealm;
  GameState.currentRealm = realmId;

  if (!GameState.unlockedRealms.includes(realmId)) {
    GameState.unlockedRealms.push(realmId);
  }

  Bus.emit('realm:change', { realm: realmId, from, to: realmId });

  return { ok: true, loreFlash: LORE_FLASH[realmId] || `You enter the ${REALM_NAMES[realmId] || realmId}.` };
}

/**
 * realmCompletionPct(realmId, state) → 0..100
 *
 * Percent of that realm's species discovered (encyclopediaDiscoveries)
 * over total species in realm (via speciesByRealm). Guards divide-by-zero.
 */
export function realmCompletionPct(realmId, state) {
  const all = speciesByRealm(realmId);
  if (all.length === 0) return 0;
  const discoveries = state.encyclopediaDiscoveries || {};
  const discovered = all.filter(s => discoveries[s.id]).length;
  return (discovered / all.length) * 100;
}

/**
 * getRealms(state) → array (in RealmId order) of realm card objects.
 *
 * {id, name, unlocked, active, canUnlock: boolean, unmet: string[]}
 */
export function getRealms(state) {
  return RealmId.map(id => {
    const unlockedRealms = state.unlockedRealms || [];
    const unlocked = unlockedRealms.includes(id);
    const check = canUnlock(id, state);
    const meta = REALM_META[id] || {};
    return {
      id,
      name: REALM_NAMES[id],
      unlocked,
      active: state.currentRealm === id,
      canUnlock: check.ok,
      unmet: check.unmet,
      description: meta.description,
      icon: meta.icon,
      accent: meta.accent,
      feature: meta.feature,
    };
  });
}
