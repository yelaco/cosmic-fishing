// engine/rarity.js — Rarity rolling, catch resolution, impossible triggers.
// C0: no browser globals at top level. Pure functions; reads GameState/sessionFlags
// only inside function bodies (invoked at runtime, not at import time).

import SPECIES, { speciesByRealm, speciesById } from '../data/species.js';
import { eventExclusiveSpecies } from '../data/events.js';
import { GameState, sessionFlags, RarityTier } from './state.js';

// ---------------------------------------------------------------------------
// FR-011  Base rarity weights
// ---------------------------------------------------------------------------
const BASE_WEIGHTS = {
  common:    60,
  uncommon:  25,
  rare:      10,
  epic:       3.5,
  legendary:  1,
  mythic:     0.5,
  impossible: 0   // A-004: NEVER from a random roll
};

// Tiers eligible for random roll (impossible is always excluded).
const ROLLABLE_TIERS = RarityTier.filter(t => t !== 'impossible');

// ---------------------------------------------------------------------------
// rollRarity(bonuses, context) → RarityTier
// ---------------------------------------------------------------------------
/**
 * Weighted RNG over base weights + bonuses.rarityWeightBonus.
 * impossible weight stays 0 regardless of bonuses (A-004).
 *
 * @param {object} bonuses  - from economy.aggregateEffects; expects
 *                            bonuses.rarityWeightBonus  (all keys default 0)
 * @param {object} context  - { rng?: () => number [0,1), realm?: string }
 * @returns {string}  RarityTier
 */
export function rollRarity(bonuses, context = {}) {
  const rng = (context && typeof context.rng === 'function') ? context.rng : Math.random;
  const weightBonus = (bonuses && bonuses.rarityWeightBonus) ? bonuses.rarityWeightBonus : {};

  // FR-025: Dream Sea reality instability — small extra wobble on each weight.
  const dreamWobble = (context && context.realm === 'dream_sea') ? rng() * 2 : 0;

  const weights = {};
  let total = 0;
  for (const tier of ROLLABLE_TIERS) {
    const bonus = (weightBonus[tier] != null) ? weightBonus[tier] : 0;
    // impossible bonus is ignored (weight stays 0 per A-004)
    const w = Math.max(0, BASE_WEIGHTS[tier] + bonus + (tier !== 'mythic' ? 0 : 0));
    weights[tier] = w + (tier === 'dream_sea' ? dreamWobble : 0); // wobble is realm-level, apply below
    total += w;
  }

  // Apply dream_sea wobble to total weight as small noise (±dreamWobble across all tiers).
  // Per FR-025: add dreamWobble to the mythic tier to make high-rarity outcomes fractionally
  // more likely, keeping the system consistent and documented.
  if (context && context.realm === 'dream_sea') {
    weights.mythic += dreamWobble;
    total += dreamWobble;
  }

  let roll = rng() * total;
  for (const tier of ROLLABLE_TIERS) {
    roll -= weights[tier];
    if (roll <= 0) return tier;
  }
  return ROLLABLE_TIERS[ROLLABLE_TIERS.length - 1];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Pick a uniformly random element from an array. */
function pick(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

/** Linear interpolate a size within sizeRange. */
function rollSize(sizeRange, rng) {
  const [min, max] = sizeRange;
  if (min === max) return min;
  return +(min + rng() * (max - min)).toFixed(1);
}

/**
 * Simple inline value computation used as fallback when context doesn't
 * supply sellValueOf / rpValueOf.
 */
const RARITY_MULT = {
  common: 1, uncommon: 1.5, rare: 3, epic: 8, legendary: 20, mythic: 60, impossible: 200
};

function inlineSellValue(species, size, rarity) {
  const [min, max] = species.sizeRange;
  const range = max - min || 1;
  const sizeMod = 0.8 + 0.4 * ((size - min) / range);
  return Math.round(species.baseValue * sizeMod * RARITY_MULT[rarity]);
}

function inlineRpValue(species, size, rarity) {
  return Math.max(1, Math.round(inlineSellValue(species, size, rarity) / 10));
}

// ---------------------------------------------------------------------------
// resolveCatch(realm, context) → canonical C1 Catch
// ---------------------------------------------------------------------------
/**
 * Produces a canonical C1 Catch object.
 *
 * @param {string} realm    - RealmId
 * @param {object} context  - {
 *     bonuses?,         // from economy.aggregateEffects (C2)
 *     activeEvent?,     // current event id or null
 *     rng?,             // injectable () => [0,1)
 *     sellValueOf?,     // (species, size, rarity) => number
 *     rpValueOf?,       // (species, size, rarity) => number
 *   }
 * @returns {object}  Catch (C1)
 */
export function resolveCatch(realm, context = {}) {
  const rng = (context && typeof context.rng === 'function') ? context.rng : Math.random;
  const bonuses = (context && context.bonuses) ? context.bonuses : {
    rarityWeightBonus: { common:0, uncommon:0, rare:0, epic:0, legendary:0, mythic:0, impossible:0 }
  };

  const rarity = rollRarity(bonuses, { rng, realm });

  // Gather candidate species: realm-matching species of the rolled rarity,
  // excluding impossible-rarity (those come only from checkImpossibleTriggers).
  let candidates = speciesByRealm(realm).filter(s => s.rarity === rarity);

  // Include event-exclusive species when their exclusiveToEvent matches activeEvent
  // and their realm matches.
  if (context && context.activeEvent) {
    const exclusive = eventExclusiveSpecies.filter(
      s => s.realm === realm && s.rarity === rarity && s.exclusiveToEvent === context.activeEvent
    );
    candidates = candidates.concat(exclusive);
  }

  // Fallback: if no candidates (shouldn't happen in a complete data set), pick any from realm.
  if (candidates.length === 0) {
    candidates = speciesByRealm(realm).filter(s => s.rarity !== 'impossible');
    if (candidates.length === 0) candidates = SPECIES.filter(s => s.rarity !== 'impossible');
  }

  const species = pick(candidates, rng);
  const size = rollSize(species.sizeRange, rng);
  const trait = pick(species.traits, rng);

  const sellValueFn = (context && typeof context.sellValueOf === 'function')
    ? () => context.sellValueOf(species, size, rarity)
    : () => inlineSellValue(species, size, rarity);
  const rpValueFn = (context && typeof context.rpValueOf === 'function')
    ? () => context.rpValueOf(species, size, rarity)
    : () => inlineRpValue(species, size, rarity);

  const sellValue = sellValueFn();
  const rpValue = rpValueFn();

  // isNewDiscovery: check BEFORE recordCatch runs (C1 / C3).
  const isNewDiscovery = !(GameState.encyclopediaDiscoveries[species.id]);

  const rand = Math.floor(rng() * 1e6);
  const id = `${species.id}-${Date.now()}-${rand}`;

  return {
    id,
    speciesId: species.id,
    name: species.name,
    realm,
    rarity,
    size,
    trait,
    sellValue,
    rpValue,
    isNewDiscovery,
    isImpossible: false,
    fromNet: false
  };
}

// ---------------------------------------------------------------------------
// checkImpossibleTriggers(gs, context) → Catch | null   (FR-015)
// ---------------------------------------------------------------------------
/**
 * Checks all impossible-species trigger conditions in priority order.
 * Returns the FIRST satisfied trigger as a C1 Catch (isImpossible:true),
 * or null if none are satisfied.
 *
 * @param {object} gs       - GameState (or compatible snapshot)
 * @param {object} context  - { activeEvent?, realm?, rng?, sellValueOf?, rpValueOf? }
 * @returns {object|null}
 */
export function checkImpossibleTriggers(gs, context = {}) {
  const rng = (context && typeof context.rng === 'function') ? context.rng : Math.random;
  const realm = (context && context.realm) ? context.realm : gs.currentRealm;
  const activeEvent = (context && context.activeEvent) ? context.activeEvent : null;

  // Helper: build a catch object from a species record.
  function buildImpossibleCatch(species) {
    const size = rollSize(species.sizeRange, rng);
    const trait = pick(species.traits, rng);
    const sellValue = (context && typeof context.sellValueOf === 'function')
      ? context.sellValueOf(species, size, species.rarity)
      : inlineSellValue(species, size, species.rarity);
    const rpValue = (context && typeof context.rpValueOf === 'function')
      ? context.rpValueOf(species, size, species.rarity)
      : inlineRpValue(species, size, species.rarity);
    const isNewDiscovery = !(gs.encyclopediaDiscoveries[species.id]);
    const rand = Math.floor(rng() * 1e6);
    return {
      id: `${species.id}-${Date.now()}-${rand}`,
      speciesId: species.id,
      name: species.name,
      realm: species.realm,
      rarity: species.rarity,
      size,
      trait,
      sellValue,
      rpValue,
      isNewDiscovery,
      isImpossible: true,
      fromNet: false
    };
  }

  // 1. abyss_null_shark: realm === abyss AND activeEvent === 'void_whisper'
  if (realm === 'abyss' && activeEvent === 'void_whisper') {
    const s = speciesById('abyss_null_shark');
    if (s) return buildImpossibleCatch(s);
  }

  // 2. dream_impossible_geometry_fish: dream_sea encyclopedia entries >= 10
  {
    const dreamDiscovered = Object.keys(gs.encyclopediaDiscoveries || {})
      .filter(id => {
        const sp = speciesById(id) || eventExclusiveSpecies.find(e => e.id === id);
        return sp && sp.realm === 'dream_sea';
      }).length;
    if (dreamDiscovered >= 10) {
      const s = speciesById('dream_impossible_geometry_fish');
      if (s) return buildImpossibleCatch(s);
    }
  }

  // 3. time_moment_made_flesh: sessionFlags.temporalSpeciesCaughtThisSession >= 3 distinct ids
  {
    const temporal = sessionFlags.temporalSpeciesCaughtThisSession || [];
    const distinct = new Set(temporal).size;
    if (distinct >= 3) {
      const s = speciesById('time_moment_made_flesh');
      if (s) return buildImpossibleCatch(s);
    }
  }

  // 4. void_mathematical_entity: completedResearch includes all three nodes
  {
    const cr = gs.completedResearch || [];
    if (
      cr.includes('prime_sequence') &&
      cr.includes('harmonic_convergence') &&
      cr.includes('void_mathematics')
    ) {
      const s = speciesById('void_mathematical_entity');
      if (s) return buildImpossibleCatch(s);
    }
  }

  // 5. void_universe_in_a_bottle: activeEvent === 'birth_of_a_star' AND ascensionCount >= 5
  if (activeEvent === 'birth_of_a_star' && (gs.ascensionCount || 0) >= 5) {
    const s = speciesById('void_universe_in_a_bottle');
    if (s) return buildImpossibleCatch(s);
  }

  return null;
}

// ---------------------------------------------------------------------------
// resolveNetCatch(realm, context) → Catch with fromNet:true  (A-007, C6/m2)
// ---------------------------------------------------------------------------
/**
 * Boat passive net loot table (A-007). Biased toward common/uncommon.
 * Single source for automation and offline — no duplicate tables.
 *
 * @param {string} realm
 * @param {object} context  - same shape as resolveCatch context
 * @returns {object}  Catch (C1, fromNet:true)
 */
export function resolveNetCatch(realm, context = {}) {
  // Net bias: common×3, uncommon×2, rare×1, rest suppressed.
  const netWeightBonus = {
    common:    180,  // 60+180 = 240 (heavily biased)
    uncommon:   50,  // 25+50  =  75
    rare:        0,
    epic:       -3,  // 3.5-3  =  0.5
    legendary:  -1,  // 1-1    =  0
    mythic:   -0.5,  // effectively 0
    impossible:  0
  };

  // Merge caller bonuses with net bias (caller bonus stacks on top).
  const callerBonus = (context && context.bonuses && context.bonuses.rarityWeightBonus)
    ? context.bonuses.rarityWeightBonus
    : {};

  const merged = {};
  for (const tier of RarityTier) {
    merged[tier] = (netWeightBonus[tier] || 0) + (callerBonus[tier] || 0);
  }

  const netContext = Object.assign({}, context, {
    bonuses: { ...(context.bonuses || {}), rarityWeightBonus: merged }
  });

  const catchObj = resolveCatch(realm, netContext);
  catchObj.fromNet = true;
  return catchObj;
}
