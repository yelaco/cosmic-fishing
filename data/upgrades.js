// data/upgrades.js — All upgrade records for Cosmic Fishing
// C0: no browser globals, pure data, no imports

export const UPGRADES = [
  // ─── ROD UPGRADES ────────────────────────────────────────────────────────────
  {
    id: 'better_rod',
    name: 'Better Rod',
    description: 'A sturdier rod with improved casting mechanics. Reduces cast time.',
    category: 'rod',
    cost: [{ resource: 'gold', amount: 30 }],
    costScaling: null,
    maxLevel: 1,
    prerequisites: [],
    effects: [
      { type: 'cast_time_multiplier', value: 0.85 }
    ],
    realm: null
  },
  {
    id: 'fine_rod',
    name: 'Fine Rod',
    description: 'Precision-crafted with enchanted guides. Noticeably faster casts and better catch quality.',
    category: 'rod',
    cost: [{ resource: 'gold', amount: 500 }],
    costScaling: null,
    maxLevel: 1,
    prerequisites: ['better_rod'],
    effects: [
      { type: 'cast_time_multiplier', value: 0.80 },
      { type: 'gold_multiplier', value: 1.10 }
    ],
    realm: null
  },
  {
    id: 'deep_probe',
    name: 'Deep Probe',
    description: 'An abyss-hardened rod tuned to deep-water frequencies. Dramatically faster casts.',
    category: 'rod',
    cost: [{ resource: 'gold', amount: 10000 }],
    costScaling: null,
    maxLevel: 1,
    prerequisites: ['fine_rod'],
    effects: [
      { type: 'cast_time_multiplier', value: 0.70 },
      { type: 'gold_multiplier', value: 1.20 }
    ],
    realm: 'abyss'
  },
  {
    id: 'void_tendril',
    name: 'Void Tendril',
    description: 'Woven from the sinew of void-space itself. Casts at impossible angles through reality.',
    category: 'rod',
    cost: [{ resource: 'gold', amount: 500000 }],
    costScaling: null,
    maxLevel: 1,
    prerequisites: ['deep_probe'],
    effects: [
      { type: 'cast_time_multiplier', value: 0.55 },
      { type: 'gold_multiplier', value: 1.50 }
    ],
    realm: 'cosmic_void'
  },

  // ─── BAIT / LURE UPGRADES ────────────────────────────────────────────────────
  {
    id: 'shiny_lure',
    name: 'Shiny Lure',
    description: 'Glittery finish attracts uncommon fish. Shifts rarity weights upward.',
    category: 'bait',
    cost: [{ resource: 'gold', amount: 100 }],
    costScaling: null,
    maxLevel: 1,
    prerequisites: [],
    effects: [
      { type: 'rarity_weight_bonus', value: 3 }  // +3 weight to uncommon+
    ],
    realm: null
  },
  {
    id: 'spectral_bait',
    name: 'Spectral Bait',
    description: 'Shimmers at frequencies only rare creatures can perceive.',
    category: 'bait',
    cost: [{ resource: 'gold', amount: 5000 }],
    costScaling: null,
    maxLevel: 1,
    prerequisites: ['shiny_lure'],
    effects: [
      { type: 'rarity_weight_bonus', value: 5 }
    ],
    realm: 'ocean'
  },
  {
    id: 'temporal_hook',
    name: 'Temporal Hook',
    description: 'Exists across multiple moments simultaneously. Legendary and Mythic fish are drawn to its paradox.',
    category: 'bait',
    cost: [{ resource: 'gold', amount: 250000 }],
    costScaling: null,
    maxLevel: 1,
    prerequisites: ['spectral_bait'],
    effects: [
      { type: 'rarity_weight_bonus', value: 8 },
      { type: 'gold_multiplier', value: 1.15 }
    ],
    realm: 'time_ocean'
  },

  // ─── REEL UPGRADES ───────────────────────────────────────────────────────────
  {
    id: 'precision_reel',
    name: 'Precision Reel',
    description: 'Smooth drag system. Fish sizes tend toward the larger end of their range.',
    category: 'reel',
    cost: [{ resource: 'gold', amount: 300 }],
    costScaling: null,
    maxLevel: 1,
    prerequisites: [],
    effects: [
      { type: 'gold_multiplier', value: 1.08 }  // larger fish = higher sell value
    ],
    realm: null
  },
  {
    id: 'quantum_reel',
    name: 'Quantum Reel',
    description: 'Collapses the probability wave of fish size toward maximum. Eerily effective.',
    category: 'reel',
    cost: [{ resource: 'gold', amount: 20000 }],
    costScaling: null,
    maxLevel: 1,
    prerequisites: ['precision_reel'],
    effects: [
      { type: 'gold_multiplier', value: 1.25 }
    ],
    realm: 'abyss'
  },

  // ─── BOAT UPGRADES ───────────────────────────────────────────────────────────
  {
    id: 'boat_basic',
    name: 'Basic Boat Blueprint',
    description: 'A simple but seaworthy vessel. Required to sail to the Ocean. Enables passive net catches every 30 seconds.',
    category: 'boat',
    cost: [{ resource: 'gold', amount: 200 }],
    costScaling: null,
    maxLevel: 1,
    prerequisites: [],
    effects: [
      { type: 'net_interval_multiplier', value: 1.0 }  // enables net; base 30s interval
    ],
    realm: 'ocean'
  },
  {
    id: 'fishing_trawler',
    name: 'Fishing Trawler',
    description: 'Upgraded hull with a wide-mouth net. Net catches come faster and more reliably.',
    category: 'boat',
    cost: [{ resource: 'gold', amount: 50000 }],
    costScaling: null,
    maxLevel: 1,
    prerequisites: ['boat_basic'],
    effects: [
      { type: 'net_interval_multiplier', value: 0.70 },  // 30% faster net
      { type: 'gold_multiplier', value: 1.10 }
    ],
    realm: 'ocean'
  },

  // ─── DIMENSIONAL EQUIPMENT ───────────────────────────────────────────────────
  {
    id: 'void_compass',
    name: 'Void Compass',
    description: 'Triangulates positions between realities. Void Shards appear in your catches.',
    category: 'dimensional',
    cost: [{ resource: 'gold', amount: 100000 }],
    costScaling: null,
    maxLevel: 1,
    prerequisites: ['deep_probe'],
    effects: [
      { type: 'void_shard_rate_bonus', value: 0.05 }  // +5% Void Shard drop rate
    ],
    realm: 'abyss'
  },
  {
    id: 'rift_anchor',
    name: 'Rift Anchor',
    description: 'Stabilizes a tear in local space-time, drawing dimensional species to your line.',
    category: 'dimensional',
    cost: [{ resource: 'gold', amount: 1000000 }],
    costScaling: null,
    maxLevel: 1,
    prerequisites: ['void_compass'],
    effects: [
      { type: 'void_shard_rate_bonus', value: 0.10 },
      { type: 'gold_multiplier', value: 1.30 }
    ],
    realm: 'cosmic_void'
  },

  // ─── SPECIAL / REALM-GATE LURES ──────────────────────────────────────────────
  {
    id: 'darkness_lure',
    name: 'Darkness Lure',
    description: 'Emits no light, casts no shadow. Required to fish in the lightless Abyss.',
    category: 'lure',
    cost: [
      { resource: 'gold', amount: 25000 },
      { resource: 'rp', amount: 500 }
    ],
    costScaling: null,
    maxLevel: 1,
    prerequisites: ['boat_basic'],
    effects: [
      { type: 'rarity_weight_bonus', value: 4 }  // bonus rarity in Abyss
    ],
    realm: 'abyss'
  },
  {
    id: 'dreamcatcher_lure',
    name: 'Dreamcatcher Lure',
    description: 'Woven from crystallized nightmares and tuned to oneiric frequencies. Opens the way to the Dream Sea.',
    category: 'lure',
    cost: [
      { resource: 'gold', amount: 100000 },
      { resource: 'rp', amount: 2000 },
      { resource: 'collectionEssence', amount: 50 }
    ],
    costScaling: null,
    maxLevel: 1,
    prerequisites: ['darkness_lure'],
    effects: [
      { type: 'rarity_weight_bonus', value: 6 },
      { type: 'gold_multiplier', value: 1.20 }
    ],
    realm: 'dream_sea'
  },
  {
    id: 'void_whisper',
    name: 'Void Whisper',
    description: 'A cursed trinket that resonates with null-space. Amplifies the Void Whisper world event and is required to attract the Null Shark.',
    category: 'special',
    cost: [
      { resource: 'gold', amount: 75000 },
      { resource: 'voidShards', amount: 10 }
    ],
    costScaling: null,
    maxLevel: 1,
    prerequisites: ['void_compass'],
    effects: [
      { type: 'void_shard_rate_bonus', value: 0.05 },
      { type: 'rarity_weight_bonus', value: 3 }
    ],
    realm: 'abyss'
  },

  // ─── AUTOMATION UPGRADES ─────────────────────────────────────────────────────
  {
    id: 'auto_cast',
    name: 'Auto-Cast',
    description: 'Automatically re-casts after each catch resolves. Default: auto-sells.',
    category: 'automation',
    cost: [{ resource: 'gold', amount: 200 }],
    costScaling: null,
    maxLevel: 1,
    prerequisites: [],
    effects: [
      { type: 'auto_cast_interval_multiplier', value: 1.0 }
    ],
    realm: null
  },
  {
    id: 'auto_sell',
    name: 'Auto-Sell',
    description: 'Automatically sells all catches. Species never-yet-researched this run are researched once first.',
    category: 'automation',
    cost: [{ resource: 'gold', amount: 5000 }],
    costScaling: null,
    maxLevel: 1,
    prerequisites: ['auto_cast', 'boat_basic'],
    effects: [
      { type: 'gold_multiplier', value: 1.0 }  // no inherent bonus — enables automation
    ],
    realm: 'ocean'
  },
  {
    id: 'research_drone',
    name: 'Research Drone',
    description: 'A mechanical assistant that enables a second parallel research slot.',
    category: 'automation',
    cost: [{ resource: 'gold', amount: 15000 }],
    costScaling: null,
    maxLevel: 1,
    prerequisites: ['auto_sell'],
    effects: [
      { type: 'rp_multiplier', value: 1.10 }
    ],
    realm: 'ocean'
  },

  // ─── PASSIVE RESEARCH-SYNERGY UPGRADES ───────────────────────────────────────
  {
    id: 'deep_sea_sonar',
    name: 'Deep Sea Sonar',
    description: 'Pings the depths to locate schools of rare fish. Epic+ catch rates improve in Abyss and below.',
    category: 'special',
    cost: [{ resource: 'gold', amount: 40000 }],
    costScaling: null,
    maxLevel: 1,
    prerequisites: ['void_compass'],
    effects: [
      { type: 'rarity_weight_bonus', value: 5 }
    ],
    realm: 'abyss'
  },
  {
    id: 'crystal_resonator',
    name: 'Crystal Resonator',
    description: 'Tunes your equipment to the frequency of Temporal Crystals, increasing their drop rate.',
    category: 'special',
    cost: [{ resource: 'gold', amount: 200000 }],
    costScaling: null,
    maxLevel: 1,
    prerequisites: ['temporal_hook'],
    effects: [
      { type: 'temporal_crystal_rate_bonus', value: 0.05 }
    ],
    realm: 'time_ocean'
  },
  {
    id: 'temporal_crystal_cache',
    name: 'Temporal Crystal Cache',
    description: 'A resonant storage array that passively attracts more Temporal Crystals.',
    category: 'special',
    cost: [{ resource: 'gold', amount: 500000 }],
    costScaling: null,
    maxLevel: 5,
    prerequisites: ['crystal_resonator'],
    effects: [
      { type: 'temporal_crystal_rate_bonus', value: 0.03 }
    ],
    realm: 'time_ocean'
  },
  {
    id: 'essence_amplifier',
    name: 'Essence Amplifier',
    description: 'Each catch passively generates a trickle of Collection Essence.',
    category: 'special',
    cost: [{ resource: 'gold', amount: 8000 }],
    costScaling: null,
    maxLevel: 1,
    prerequisites: ['boat_basic'],
    effects: [
      { type: 'collection_essence_bonus', value: 1 }
    ],
    realm: 'ocean'
  },
  {
    id: 'research_catalyst',
    name: 'Research Catalyst',
    description: 'Concentrated arcane reagent. Research completes 15% faster.',
    category: 'special',
    cost: [{ resource: 'gold', amount: 12000 }],
    costScaling: null,
    maxLevel: 1,
    prerequisites: ['auto_cast'],
    effects: [
      { type: 'research_speed_multiplier', value: 0.85 }
    ],
    realm: null
  },
  {
    id: 'golden_scales',
    name: 'Golden Scales',
    description: 'A measuring instrument blessed by a forgotten fishing deity. All gold income increased.',
    category: 'special',
    cost: [{ resource: 'gold', amount: 1500 }],
    costScaling: null,
    maxLevel: 1,
    prerequisites: [],
    effects: [
      { type: 'gold_multiplier', value: 1.15 }
    ],
    realm: null
  },
  {
    id: 'astral_net',
    name: 'Astral Net',
    description: 'Woven from starlight. The boat net fires with supernatural frequency.',
    category: 'boat',
    cost: [{ resource: 'gold', amount: 300000 }],
    costScaling: null,
    maxLevel: 1,
    prerequisites: ['fishing_trawler'],
    effects: [
      { type: 'net_interval_multiplier', value: 0.60 }
    ],
    realm: 'cosmic_void'
  }
];

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const _byId = new Map(UPGRADES.map(u => [u.id, u]));

export function upgradeById(id) {
  return _byId.get(id) ?? null;
}

export function upgradesByCategory(cat) {
  return UPGRADES.filter(u => u.category === cat);
}

export default UPGRADES;
