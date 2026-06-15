// engine/economy.js — Economy mutators and aggregateEffects.
// C0 NODE-SAFETY: no top-level access to document/window/localStorage/setInterval/rAF.

import SPECIES, { speciesById } from '../data/species.js';
import UPGRADES, { upgradeById } from '../data/upgrades.js';
import RESEARCH from '../data/research.js';
import MEMORIES from '../data/cosmicMemories.js';
import { GameState, Bus } from './state.js';

// ─── Internal helpers ──────────────────────────────────────────────────────────

const _researchById = new Map(RESEARCH.map(n => [n.id, n]));
const _memoryById   = new Map(MEMORIES.map(m => [m.id, m]));

/** FR-012 rarity gold multipliers */
const RARITY_GOLD_MULT = {
  common:      1,
  uncommon:    3,
  rare:        8,
  epic:        25,
  legendary:   80,
  mythic:      300,
  impossible:  1000,
};

/** Default bonuses identity object (C2). */
function defaultBonuses() {
  return {
    goldMultiplier:            1,
    rpMultiplier:              1,
    castTimeMultiplier:        1,
    rarityWeightBonus: {
      common:     0,
      uncommon:   0,
      rare:       0,
      epic:       0,
      legendary:  0,
      mythic:     0,
      impossible: 0,
    },
    voidShardRate:             0,
    temporalCrystalRate:       0,
    collectionEssenceFlat:     0,
    researchSpeedMultiplier:   1,
    autoCastIntervalMultiplier:1,
    netIntervalMultiplier:     1,
  };
}

/**
 * Apply a single {type, value} effect record onto the bonuses accumulator.
 * multiplier × multiplier; additive rates/flat/weight bonuses.
 */
function applyEffect(bonuses, effect, scale = 1) {
  const v = effect.value;
  switch (effect.type) {
    case 'gold_multiplier':
      bonuses.goldMultiplier *= (typeof v === 'number' ? v : 1);
      break;
    case 'rp_multiplier':
      bonuses.rpMultiplier *= (typeof v === 'number' ? v : 1);
      break;
    case 'cast_time_multiplier':
      bonuses.castTimeMultiplier *= (typeof v === 'number' ? v : 1);
      break;
    case 'rarity_weight_bonus':
      if (typeof v === 'number') {
        // scalar: add to all tiers (upgrade convention in upgrades.js)
        for (const tier of Object.keys(bonuses.rarityWeightBonus)) {
          bonuses.rarityWeightBonus[tier] += v * scale;
        }
      } else if (v && typeof v === 'object') {
        // object: per-tier bonuses (lucky_star memory style)
        for (const [tier, amt] of Object.entries(v)) {
          if (tier in bonuses.rarityWeightBonus) {
            bonuses.rarityWeightBonus[tier] += amt * scale;
          }
        }
      }
      break;
    case 'void_shard_rate_bonus':
      bonuses.voidShardRate += (typeof v === 'number' ? v * scale : 0);
      break;
    case 'temporal_crystal_rate_bonus':
      bonuses.temporalCrystalRate += (typeof v === 'number' ? v * scale : 0);
      break;
    case 'collection_essence_bonus':
      bonuses.collectionEssenceFlat += (typeof v === 'number' ? v * scale : 0);
      break;
    case 'research_speed_multiplier':
      bonuses.researchSpeedMultiplier *= (typeof v === 'number' ? v : 1);
      break;
    case 'auto_cast_interval_multiplier':
      bonuses.autoCastIntervalMultiplier *= (typeof v === 'number' ? v : 1);
      break;
    case 'net_interval_multiplier':
      bonuses.netIntervalMultiplier *= (typeof v === 'number' ? v : 1);
      break;
    // 'custom' and unknown types: intentionally ignored
    default:
      break;
  }
}

// ─── Exports ───────────────────────────────────────────────────────────────────

/**
 * aggregateEffects(state) → bonuses (C2).
 * Folds: ownedUpgrades + completedResearch + cosmicMemories (FR-093 duplicate-doubling).
 *
 * FR-093: each extra copy of the same memory id doubles its effect.
 *   1 copy → scale 1×, 2 copies → 1× + 2× = 3× total, 3 copies → 3× + 4× = 7× total, etc.
 *   More precisely: the nth copy contributes 2^(n-1)× the base effect.
 */
export function aggregateEffects(state) {
  const bonuses = defaultBonuses();

  // 1. Owned upgrades
  for (const upgradeId of (state.ownedUpgrades || [])) {
    const upg = upgradeById(upgradeId);
    if (!upg) continue;
    for (const eff of (upg.effects || [])) {
      applyEffect(bonuses, eff);
    }
  }

  // 2. Completed research nodes
  for (const nodeId of (state.completedResearch || [])) {
    const node = _researchById.get(nodeId);
    if (!node) continue;
    for (const eff of (node.effects || [])) {
      applyEffect(bonuses, eff);
    }
  }

  // 3. Cosmic Memories (FR-093 duplicate-doubling)
  // Count occurrences of each memory id
  const memoryCounts = {};
  for (const memId of (state.resources?.cosmicMemories || [])) {
    memoryCounts[memId] = (memoryCounts[memId] || 0) + 1;
  }
  // Apply: copy k contributes scale 2^(k-1)
  for (const [memId, count] of Object.entries(memoryCounts)) {
    const mem = _memoryById.get(memId);
    if (!mem) continue;
    for (let k = 1; k <= count; k++) {
      const scale = Math.pow(2, k - 1);
      for (const eff of (mem.effects || [])) {
        applyEffect(bonuses, eff, scale);
      }
    }
  }

  return bonuses;
}

/**
 * sellValueOf(catch) → number (pure, FR-005).
 * baseValue × sizeModifier × rarityMultiplier × goldMultiplier.
 * sizeModifier = catch.size / species.sizeRange[0] (A-011).
 */
export function sellValueOf(catchObj) {
  const species = speciesById(catchObj.speciesId);
  if (!species) return 0;

  const baseValue = species.baseValue;
  const minSize   = species.sizeRange[0];

  // Guard against zero sizeRange[0] (e.g. void_mathematical_entity has [0,0])
  const sizeModifier = (minSize > 0 && Number.isFinite(catchObj.size))
    ? catchObj.size / minSize
    : 1;

  const rarityMult  = RARITY_GOLD_MULT[catchObj.rarity] ?? 1;
  const bonuses     = aggregateEffects(GameState);
  const goldMult    = bonuses.goldMultiplier;

  const result = baseValue * sizeModifier * rarityMult * goldMult;
  return Number.isFinite(result) ? result : 0;
}

/**
 * sellValue(species, size, bonuses) → number (pure).
 * Lower-level form taking a raw species record + size + an optional §3.8-style
 * bonuses object ({gold_multiplier}). Used by tooling/tests; sellValueOf wraps
 * the canonical Catch object (C1).
 */
export function sellValue(species, size, bonuses = {}) {
  if (!species) return 0;
  const baseValue = species.baseValue;
  const minSize   = species.sizeRange ? species.sizeRange[0] : 0;
  const sizeModifier = (minSize > 0 && Number.isFinite(size)) ? size / minSize : 1;
  const rarityMult = RARITY_GOLD_MULT[species.rarity] ?? 1;
  const goldMult = Number.isFinite(bonuses.gold_multiplier) ? bonuses.gold_multiplier : 1;
  const result = baseValue * sizeModifier * rarityMult * goldMult;
  return Number.isFinite(result) ? result : 0;
}

/**
 * sellCatch(catch) → {ok, reason}
 * Credits catch.sellValue EXACTLY (C1/AC-003); emits resource:change.
 */
export function sellCatch(catchObj) {
  if (!catchObj || typeof catchObj.sellValue !== 'number') {
    return { ok: false, reason: 'invalid catch' };
  }
  addGold(catchObj.sellValue);
  return { ok: true };
}

/**
 * researchCatch(catch) → {ok, reason}
 * Credits catch.rpValue RP (minimal: A-003 slot logic lives in automation).
 */
export function researchCatch(catchObj) {
  if (!catchObj || typeof catchObj.rpValue !== 'number') {
    return { ok: false, reason: 'invalid catch' };
  }
  const bonuses = aggregateEffects(GameState);
  const rp = catchObj.rpValue * bonuses.rpMultiplier;
  addRp(rp);
  return { ok: true };
}

/**
 * donateCatch(catch) → {ok, reason}
 * Only allowed after Ocean unlocked (FR-044/A-013).
 * Awards 10 CE for new species / 1 CE for duplicate; emits resource:change.
 */
export function donateCatch(catchObj) {
  if (!GameState.unlockedRealms || !GameState.unlockedRealms.includes('ocean')) {
    return { ok: false, reason: 'Ocean not yet unlocked' };
  }
  if (!catchObj || !catchObj.speciesId) {
    return { ok: false, reason: 'invalid catch' };
  }

  const isNew = !(GameState.encyclopediaDiscoveries &&
                  GameState.encyclopediaDiscoveries[catchObj.speciesId]);
  const bonuses = aggregateEffects(GameState);
  const ce = (isNew ? 10 : 1) + bonuses.collectionEssenceFlat;

  addResource('collectionEssence', ce);
  return { ok: true };
}

/**
 * purchaseUpgrade(upgradeId) → {ok, reason}
 * Checks affordability (all resources in cost array), prerequisites, unlockCondition.
 * Deducts; pushes to GameState.ownedUpgrades; emits upgrade:purchased + resource:change.
 */
export function purchaseUpgrade(upgradeId) {
  const upg = upgradeById(upgradeId);
  if (!upg) return { ok: false, reason: 'unknown upgrade' };

  if (GameState.ownedUpgrades.includes(upgradeId)) {
    return { ok: false, reason: 'already owned' };
  }

  // Prerequisites
  for (const prereq of (upg.prerequisites || [])) {
    if (!GameState.ownedUpgrades.includes(prereq)) {
      return { ok: false, reason: `missing prerequisite: ${prereq}` };
    }
  }

  // Affordability (multi-resource cost array)
  for (const { resource, amount } of (upg.cost || [])) {
    const have = GameState.resources[resource] ?? 0;
    if (have < amount) {
      return { ok: false, reason: `insufficient ${resource}` };
    }
  }

  // Deduct all costs
  for (const { resource, amount } of (upg.cost || [])) {
    addResource(resource, -amount);
  }

  GameState.ownedUpgrades.push(upgradeId);
  Bus.emit('upgrade:purchased', { upgradeId });
  // resource:change already emitted inside addResource above
  return { ok: true };
}

/**
 * purchaseResearch(nodeId) → {ok, reason}
 * RESEARCH-NODE PURCHASE OWNER (C3).
 * Checks RP cost + prerequisites (all in completedResearch); deducts RP;
 * pushes to completedResearch; emits research:complete + resource:change.
 */
export function purchaseResearch(nodeId) {
  const node = _researchById.get(nodeId);
  if (!node) return { ok: false, reason: 'unknown research node' };

  if (GameState.completedResearch.includes(nodeId)) {
    return { ok: false, reason: 'already researched' };
  }

  // Prerequisites
  for (const prereq of (node.prerequisites || [])) {
    if (!GameState.completedResearch.includes(prereq)) {
      return { ok: false, reason: `missing prerequisite: ${prereq}` };
    }
  }

  // RP affordability
  const bonuses = aggregateEffects(GameState);
  const cost = node.cost;
  if ((GameState.resources.rp ?? 0) < cost) {
    return { ok: false, reason: 'insufficient RP' };
  }

  addRp(-cost);
  GameState.completedResearch.push(nodeId);
  Bus.emit('research:complete', { nodeId });
  return { ok: true };
}

/**
 * addGold(amount) — mutate gold; update lifetimeGoldEarned; emit resource:change.
 */
export function addGold(amount) {
  if (!Number.isFinite(amount)) return;
  const prev = GameState.resources.gold;
  GameState.resources.gold = Math.max(0, prev + amount);
  if (amount > 0) {
    GameState.lifetimeGoldEarned = (GameState.lifetimeGoldEarned || 0) + amount;
  }
  Bus.emit('resource:change', {
    resource: 'gold',
    newValue: GameState.resources.gold,
    delta: amount,
  });
}

/**
 * addRp(amount) — mutate RP; emit resource:change.
 */
export function addRp(amount) {
  if (!Number.isFinite(amount)) return;
  const prev = GameState.resources.rp;
  GameState.resources.rp = Math.max(0, prev + amount);
  Bus.emit('resource:change', {
    resource: 'rp',
    newValue: GameState.resources.rp,
    delta: amount,
  });
}

/**
 * addResource(resource, amount) — mutate any resource; emit resource:change.
 * For 'gold', delegates to addGold (lifetime tracking).
 * For 'rp', delegates to addRp.
 * For array resources (cosmicMemories), no-ops (managed by ascension).
 */
export function addResource(resource, amount) {
  if (resource === 'gold') { addGold(amount); return; }
  if (resource === 'rp')   { addRp(amount);   return; }

  if (!Number.isFinite(amount)) return;
  const prev = GameState.resources[resource] ?? 0;
  if (typeof prev !== 'number') return; // array resources: skip
  GameState.resources[resource] = Math.max(0, prev + amount);
  Bus.emit('resource:change', {
    resource,
    newValue: GameState.resources[resource],
    delta: amount,
  });
}
