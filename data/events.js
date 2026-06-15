// data/events.js — World events for Cosmic Fishing
// C0: no browser globals, no imports. Pure data module.

export default [
  {
    id: "eclipse_tide",
    name: "Eclipse Tide",
    description: "A celestial shadow falls across the water. Rare creatures stir from the depths and gold flows freely.",
    durationSeconds: 180,
    eligibleRealms: ["pond", "ocean"],
    effects: [
      { type: "rarity_weight_bonus", value: 50 },
      { type: "gold_multiplier", value: 2.0 }
    ],
    exclusiveSpecies: ["umbra_carp", "shadow_manta"],
    cssClass: "event-eclipse-tide",
    triggerCondition: null
  },
  {
    id: "dream_storm",
    name: "Dream Storm",
    description: "The dream sea convulses with impossible weather. Mythic entities surface between lightning strikes of pure thought.",
    durationSeconds: 180,
    eligibleRealms: ["dream_sea"],
    effects: [
      { type: "rarity_weight_bonus", value: 30 },
      { type: "cast_time_multiplier", value: 1.4 }
    ],
    exclusiveSpecies: ["storm_dreamer"],
    cssClass: "event-dream-storm",
    triggerCondition: null
  },
  {
    id: "temporal_collapse",
    name: "Temporal Collapse",
    description: "Time buckles. Every catch yields temporal crystals and casts complete in half the usual duration.",
    durationSeconds: 180,
    eligibleRealms: ["time_ocean"],
    effects: [
      { type: "temporal_crystal_rate_bonus", value: 1.0 },
      { type: "cast_time_multiplier", value: 0.5 }
    ],
    exclusiveSpecies: ["collapsed_future"],
    cssClass: "event-temporal-collapse",
    triggerCondition: null
  },
  {
    id: "void_whisper",
    name: "Void Whisper",
    description: "The abyss exhales. Something that should not exist drifts up from beneath, and void shards rain like static.",
    durationSeconds: 180,
    eligibleRealms: ["abyss", "cosmic_void"],
    effects: [
      { type: "void_shard_rate_bonus", value: 0.25 },
      { type: "rarity_weight_bonus", value: 20 }
    ],
    exclusiveSpecies: ["abyss_null_shark"],
    cssClass: "event-void-whisper",
    triggerCondition: null
  },
  {
    id: "birth_of_a_star",
    name: "Birth of a Star",
    description: "A star ignites in the cosmic void. The light of creation touches everything. Something impossible stirs.",
    durationSeconds: 300,
    eligibleRealms: ["cosmic_void"],
    effects: [
      { type: "gold_multiplier", value: 5.0 },
      { type: "rarity_weight_bonus", value: 100 },
      { type: "void_shard_rate_bonus", value: 0.5 },
      { type: "temporal_crystal_rate_bonus", value: 0.5 }
    ],
    exclusiveSpecies: ["void_universe_in_a_bottle"],
    cssClass: "event-birth-of-a-star",
    triggerCondition: { type: "cast_probability", value: 0.01 }
  }
];

// Full §3.1 species records for event-exclusive creatures not already in data/species.js.
// null_shark (abyss_null_shark) and universe_in_a_bottle (void_universe_in_a_bottle)
// are IMPOSSIBLE-tier and already exist in data/species.js — referenced by id above only.
export const eventExclusiveSpecies = [
  {
    id: "umbra_carp",
    name: "Umbra Carp",
    realm: "ocean",
    rarity: "epic",
    baseValue: 4800,
    sizeRange: [40, 120],
    traits: ["Shadow-scaled", "Eclipse-born", "Light-absorbing"],
    lore: "The umbra carp exists only in the narrow window when sunlight fails. Its scales drink shadow rather than reflect it, and fishers report that looking at one feels like staring into a hole where a fish should be. They vanish when the light returns, leaving no trace — not even a wet mark on the dock.",
    discoveryCondition: { type: "active_event", value: "eclipse_tide" },
    artworkType: "emoji",
    artworkRef: "🐟",
    catchWeightOverride: 0.08,
    exclusiveToEvent: "eclipse_tide"
  },
  {
    id: "shadow_manta",
    name: "Shadow Manta",
    realm: "ocean",
    rarity: "legendary",
    baseValue: 22000,
    sizeRange: [200, 600],
    traits: ["Umbral", "Vast", "Eclipse-caller"],
    lore: "Old sailors claim the eclipse tide is not an astronomical event but a living one — that the shadow manta rises so vast and so close to the surface that it blots the sun from below. Those who have seen the full wingspan describe a darkness that has opinions.",
    discoveryCondition: { type: "active_event", value: "eclipse_tide" },
    artworkType: "emoji",
    artworkRef: "🦈",
    catchWeightOverride: 0.02,
    exclusiveToEvent: "eclipse_tide"
  },
  {
    id: "storm_dreamer",
    name: "Storm Dreamer",
    realm: "dream_sea",
    rarity: "mythic",
    baseValue: 150000,
    sizeRange: [80, 300],
    traits: ["Thought-form", "Lightning-edged", "Unstable narrative"],
    lore: "The storm dreamer is not a fish so much as a concentrated wish for weather. It manifests when the dream sea becomes turbulent enough to generate its own mythology. Catching one briefly grants the angler a memory of a storm they were never in — vivid, complete, and entirely someone else's.",
    discoveryCondition: { type: "active_event", value: "dream_storm" },
    artworkType: "emoji",
    artworkRef: "⚡",
    catchWeightOverride: 0.01,
    exclusiveToEvent: "dream_storm"
  },
  {
    id: "collapsed_future",
    name: "Collapsed Future",
    realm: "time_ocean",
    rarity: "mythic",
    baseValue: 180000,
    sizeRange: [1, 500],
    traits: ["Superposed", "Causality-free", "All-sizes-at-once"],
    lore: "A collapsed future is what remains when a timeline folds in on itself. It has no fixed size because it occupies every possible size simultaneously — the act of measuring it forces a choice the universe would rather not make. Handle carefully. It is technically still happening.",
    discoveryCondition: { type: "active_event", value: "temporal_collapse" },
    artworkType: "emoji",
    artworkRef: "⌛",
    catchWeightOverride: 0.01,
    exclusiveToEvent: "temporal_collapse"
  }
];
