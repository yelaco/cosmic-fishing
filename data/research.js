// data/research.js — 22-node research tree
// Schema: §3.4 | Effect types: §3.8 | Realm gates: FR-022 | Puzzle path: FR-015

export default [
  // ── Tier 0 ──────────────────────────────────────────────────────────────
  {
    id: 'fish_anatomy',
    name: 'Fish Anatomy',
    description: 'Studying the internal structure of pond fish grants a +10% bonus to gold from Common species.',
    cost: 20,
    prerequisites: [],
    effects: [{ type: 'gold_multiplier', value: 1.1 }],
    isRealmGate: false,
    position: { x: 4, y: 0 },
  },

  // ── Tier 1 ──────────────────────────────────────────────────────────────
  {
    id: 'deeper_waters',
    name: 'Deeper Waters',
    description: 'Mastery of current theory reduces cast time by 5%.',
    cost: 50,
    prerequisites: ['fish_anatomy'],
    effects: [{ type: 'cast_time_multiplier', value: 0.95 }],
    isRealmGate: false,
    position: { x: 4, y: 1 },
  },

  // ── Tier 2 ──────────────────────────────────────────────────────────────
  {
    id: 'oceanography',
    name: 'Oceanography',
    description: 'Understanding tidal systems and ocean currents unlocks the techniques needed to fish open waters. (Realm gate: Ocean)',
    cost: 100,
    prerequisites: ['deeper_waters'],
    effects: [],
    isRealmGate: true,
    position: { x: 4, y: 2 },
  },
  {
    id: 'research_efficiency',
    name: 'Research Efficiency',
    description: 'Streamlined lab practices cut research processing time by 20%.',
    cost: 150,
    prerequisites: ['deeper_waters'],
    effects: [{ type: 'research_speed_multiplier', value: 0.8 }],
    isRealmGate: false,
    position: { x: 7, y: 2 },
  },

  // ── Tier 3 ──────────────────────────────────────────────────────────────
  {
    id: 'marine_biology',
    name: 'Marine Biology',
    description: 'A deeper understanding of ocean life grants a +15% bonus to gold earned from Ocean species.',
    cost: 200,
    prerequisites: ['oceanography'],
    effects: [{ type: 'gold_multiplier', value: 1.15 }],
    isRealmGate: false,
    position: { x: 4, y: 3 },
  },

  // ── Tier 4 ──────────────────────────────────────────────────────────────
  {
    id: 'net_theory',
    name: 'Net Theory',
    description: 'Optimising net geometry reduces the Boat passive net catch interval by 20%.',
    cost: 300,
    prerequisites: ['marine_biology'],
    effects: [{ type: 'net_interval_multiplier', value: 0.8 }],
    isRealmGate: false,
    position: { x: 1, y: 4 },
  },
  {
    id: 'encyclopedic_obsession',
    name: 'Encyclopedic Obsession',
    description: 'A compulsive need to catalogue everything grants +1 Collection Essence whenever a new species is first discovered.',
    cost: 1000,
    prerequisites: ['marine_biology'],
    effects: [{ type: 'collection_essence_bonus', value: 1 }],
    isRealmGate: false,
    position: { x: 0, y: 3 },
  },
  {
    id: 'rarity_attunement',
    name: 'Rarity Attunement',
    description: 'Fine-tuned perception of aquatic resonance adds +2% to Epic and above catch rates globally.',
    cost: 600,
    prerequisites: ['marine_biology'],
    effects: [{ type: 'rarity_weight_bonus', value: 0.02 }],
    isRealmGate: false,
    position: { x: 8, y: 3 },
  },
  {
    id: 'deep_pressure',
    name: 'Deep Pressure',
    description: 'Knowledge of abyssal pressure regimes enables pressure-resistant equipment and opens the Abyss. (Realm gate: Abyss)',
    cost: 500,
    prerequisites: ['marine_biology'],
    effects: [],
    isRealmGate: true,
    position: { x: 4, y: 4 },
  },

  // ── Tier 5 ──────────────────────────────────────────────────────────────
  {
    id: 'bioluminescence_study',
    name: 'Bioluminescence Study',
    description: 'Mapping the light-producing organs of deep creatures raises Rare catch rates in Ocean and Abyss by +20%.',
    cost: 400,
    prerequisites: ['deep_pressure'],
    effects: [{ type: 'rarity_weight_bonus', value: 0.2 }],
    isRealmGate: false,
    position: { x: 2, y: 5 },
  },
  {
    id: 'void_resonance',
    name: 'Void Resonance',
    description: 'Detecting resonance signatures bleeding from the void increases Void Shard drop rate by 10%.',
    cost: 800,
    prerequisites: ['deep_pressure'],
    effects: [{ type: 'void_shard_rate_bonus', value: 0.1 }],
    isRealmGate: false,
    position: { x: 6, y: 5 },
  },

  // ── Tier 6 ──────────────────────────────────────────────────────────────
  {
    id: 'oneiric_frequency',
    name: 'Oneiric Frequency',
    description: 'Attuning the rod to dream-state frequencies bridges the gap between abyss and the unconscious sea. (Realm gate: Dream Sea)',
    cost: 1500,
    prerequisites: ['bioluminescence_study'],
    effects: [],
    isRealmGate: true,
    position: { x: 4, y: 6 },
  },

  // ── Tier 7 ──────────────────────────────────────────────────────────────
  {
    id: 'dream_interpretation',
    name: 'Dream Interpretation',
    description: 'Translating the symbolic language of Dream Sea creatures grants a +15% bonus to gold earned from them.',
    cost: 2000,
    prerequisites: ['oneiric_frequency'],
    effects: [{ type: 'gold_multiplier', value: 1.15 }],
    isRealmGate: false,
    position: { x: 2, y: 7 },
  },
  {
    id: 'reality_mapping',
    name: 'Reality Mapping',
    description: 'Charting the fractures in Dream Sea logic reduces the chance of a Reality Instability reversal by 5%.',
    cost: 2500,
    prerequisites: ['dream_interpretation'],
    effects: [],
    isRealmGate: false,
    position: { x: 4, y: 7 },
  },

  // ── Tier 8 ──────────────────────────────────────────────────────────────
  {
    id: 'temporal_sensitivity',
    name: 'Temporal Sensitivity',
    description: 'Attunement to temporal drift lets consciousness slip between moments, opening the Time Ocean. (Realm gate: Time Ocean)',
    cost: 5000,
    prerequisites: ['reality_mapping'],
    effects: [],
    isRealmGate: true,
    position: { x: 4, y: 8 },
  },
  {
    id: 'prime_sequence',
    name: 'Prime Sequence',
    description: 'Cataloguing the prime-numbered patterns hidden in catch data marks the first step of an impossible puzzle.',
    cost: 10000,
    prerequisites: ['reality_mapping'],
    effects: [],
    isRealmGate: false,
    position: { x: 7, y: 8 },
  },
  {
    id: 'ascension_theory',
    name: 'Ascension Theory',
    description: 'A theoretical framework for cosmological rebirth reveals the Ascension mechanic and enhances Cosmic Memory potency.',
    cost: 3000,
    prerequisites: ['temporal_sensitivity'],
    effects: [],
    isRealmGate: false,
    position: { x: 1, y: 8 },
  },

  // ── Tier 9 ──────────────────────────────────────────────────────────────
  {
    id: 'chrono_biology',
    name: 'Chrono-Biology',
    description: 'Studying organisms that exist outside linear time increases Temporal Crystal drop rates by +20%.',
    cost: 6000,
    prerequisites: ['temporal_sensitivity'],
    effects: [{ type: 'temporal_crystal_rate_bonus', value: 0.2 }],
    isRealmGate: false,
    position: { x: 3, y: 9 },
  },
  {
    id: 'harmonic_convergence',
    name: 'Harmonic Convergence',
    description: 'Aligning the prime ratios into a unified harmonic structure brings the impossible puzzle one step closer to resolution.',
    cost: 20000,
    prerequisites: ['prime_sequence'],
    effects: [],
    isRealmGate: false,
    position: { x: 7, y: 9 },
  },

  // ── Tier 10 ─────────────────────────────────────────────────────────────
  {
    id: 'time_compression',
    name: 'Time Compression',
    description: 'Folding micro-temporal pockets into the automation cycle reduces auto-cast interval by 15%.',
    cost: 8000,
    prerequisites: ['chrono_biology'],
    effects: [{ type: 'auto_cast_interval_multiplier', value: 0.85 }],
    isRealmGate: false,
    position: { x: 4, y: 10 },
  },
  {
    id: 'void_mathematics',
    name: 'Void Mathematics',
    description: 'The final equation dissolves the boundary between number and being — the Mathematical Entity Δ becomes catchable.',
    cost: 35000,
    prerequisites: ['harmonic_convergence'],
    effects: [],
    isRealmGate: false,
    position: { x: 7, y: 10 },
  },

  // ── Tier 11 ─────────────────────────────────────────────────────────────
  {
    id: 'void_sight',
    name: 'Void Sight',
    description: 'Perceiving the luminous nothing between realities tears open passage to the Cosmic Void. (Realm gate: Cosmic Void)',
    cost: 15000,
    prerequisites: ['time_compression'],
    effects: [],
    isRealmGate: true,
    position: { x: 4, y: 11 },
  },
];
