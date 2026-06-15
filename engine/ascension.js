// engine/ascension.js — Ascension system (C3, T17, FR-090..095, A-009/A-018).
//
// C0 NODE-SAFETY: No top-level access to document/window/localStorage or any
// other browser global. All such access lives inside functions.

import cosmicMemoriesData from '../data/cosmicMemories.js';
import { GameState, Bus, createDefaultState } from './state.js';
import { save } from './save.js';

// ---------------------------------------------------------------------------
// Lore fragments — one per ascension (cycled by index mod length)
// ---------------------------------------------------------------------------
const LORE_FRAGMENTS = [
  "The pond remembers you. It always has.",
  "You have returned to the beginning, but you are not what you were.",
  "Each cycle carves a little more of the void into your bones.",
  "The fish recognize the shape of your shadow across universes.",
  "Time is patient. So are you.",
  "Every ending is the same pond, seen from a different lifetime.",
  "The stars you have already eaten still light your way.",
  "You carry every cast that ever was.",
];

// ---------------------------------------------------------------------------
// Exported API (C3)
// ---------------------------------------------------------------------------

/**
 * canAscend(state) → { ok: boolean, unmet: string[] }
 *
 * Requirements (A-009):
 *   1. currentRealm === 'cosmic_void'
 *   2. lifetimeGoldEarned >= 1_000_000
 *   3. completedResearch includes 'ascension_theory'
 */
export function canAscend(state) {
  const unmet = [];

  if (state.currentRealm !== 'cosmic_void') {
    unmet.push("Must be in the Cosmic Void realm");
  }

  if ((state.lifetimeGoldEarned ?? 0) < 1_000_000) {
    unmet.push("Requires 1,000,000 lifetime gold earned");
  }

  const completed = state.completedResearch ?? [];
  if (!completed.includes('ascension_theory')) {
    unmet.push("Requires 'Ascension Theory' research completed");
  }

  return { ok: unmet.length === 0, unmet };
}

/**
 * getMemoryChoices() → the 8 cosmic memory records (player picks one per ascension).
 */
export function getMemoryChoices() {
  return cosmicMemoriesData;
}

/**
 * executeAscension(memoryId) → { ok: boolean, reason?: string }
 *
 * FR-091: validate → record memory → increment ascensionCount → unlock lore →
 * reset run state (keep persistent data) → emit events → save.
 */
export function executeAscension(memoryId) {
  // Validate ascension conditions
  const check = canAscend(GameState);
  if (!check.ok) {
    return { ok: false, reason: check.unmet.join('; ') };
  }

  // Validate memoryId
  const validIds = cosmicMemoriesData.map(m => m.id);
  if (!validIds.includes(memoryId)) {
    return { ok: false, reason: `Unknown memory id: ${memoryId}` };
  }

  Bus.emit('ascension:begin', {});

  // Push memoryId to cosmicMemories (duplicates allowed — FR-093 doubling)
  GameState.resources.cosmicMemories.push(memoryId);

  // Increment ascension count
  GameState.ascensionCount = (GameState.ascensionCount ?? 0) + 1;

  // Unlock a lore fragment (A-018)
  const loreIndex = (GameState.ascensionCount - 1) % LORE_FRAGMENTS.length;
  if (!Array.isArray(GameState.ascensionLoreUnlocked)) {
    GameState.ascensionLoreUnlocked = [];
  }
  GameState.ascensionLoreUnlocked.push(LORE_FRAGMENTS[loreIndex]);

  // --- Preserve persistent data before reset ---
  const preserved = {
    encyclopediaDiscoveries: GameState.encyclopediaDiscoveries,
    statistics:              GameState.statistics,
    unlockedAchievements:    GameState.unlockedAchievements,
    ascensionCount:          GameState.ascensionCount,
    ascensionLoreUnlocked:   GameState.ascensionLoreUnlocked,
    cosmicMemories:          GameState.resources.cosmicMemories.slice(),
    settings:                GameState.settings,
    // Keep all-time lifetime counters
    lifetimeGoldEarned:      GameState.lifetimeGoldEarned,
    lifetimeCastCount:       GameState.lifetimeCastCount,
  };

  // --- Reset run-scoped state ---
  const fresh = createDefaultState();

  // Resources: zero numeric resources, keep cosmicMemories
  GameState.resources.gold             = 0;
  GameState.resources.rp               = 0;
  GameState.resources.collectionEssence = 0;
  GameState.resources.voidShards       = 0;
  GameState.resources.temporalCrystals = 0;
  GameState.resources.cosmicMemories   = preserved.cosmicMemories;

  // Progression
  GameState.currentRealm    = 'pond';
  GameState.unlockedRealms  = ['pond'];

  // Upgrades / Research / Automation
  GameState.ownedUpgrades     = [];
  GameState.completedResearch = [];
  GameState.researchQueue     = { slot1: null, slot2: null };
  GameState.automationOwned   = [];
  GameState.automationEnabled = {};

  // Restore persistent data
  GameState.encyclopediaDiscoveries = preserved.encyclopediaDiscoveries;
  GameState.statistics              = preserved.statistics;
  GameState.unlockedAchievements    = preserved.unlockedAchievements;
  GameState.ascensionCount          = preserved.ascensionCount;
  GameState.ascensionLoreUnlocked   = preserved.ascensionLoreUnlocked;
  GameState.settings                = preserved.settings;
  GameState.lifetimeGoldEarned      = preserved.lifetimeGoldEarned;
  GameState.lifetimeCastCount       = preserved.lifetimeCastCount;

  // Update timestamp
  GameState.timestamp = Date.now();

  Bus.emit('ascension:complete', { memoriesSelected: preserved.cosmicMemories });

  save();

  return { ok: true };
}

/**
 * applyMemoryEffects() — ensures cosmic memory effects are active.
 *
 * The actual effect aggregation is handled by economy.aggregateEffects (C2),
 * which folds cosmicMemories with FR-093 duplicate-doubling. This function
 * emits resource:change so any UI listening re-renders its bonuses display.
 * It is intentionally a thin, harmless helper (NFR-006).
 */
export function applyMemoryEffects() {
  Bus.emit('resource:change', {
    resource: 'cosmicMemories',
    newValue: GameState.resources.cosmicMemories,
    delta: 0,
  });
}
