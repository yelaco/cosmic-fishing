// engine/state.js — KEYSTONE state module (root of the import graph).
//
// C0 NODE-SAFETY: This module has NO top-level access to document/window/
// localStorage/setInterval/requestAnimationFrame and NO imports from
// engine/* or data/*. It is the single author of GameState + Bus; every
// other module imports from here.
//
// ---------------------------------------------------------------------------
// CANONICAL Bus EVENTS (the complete vocabulary emitted on the Bus):
//   "catch:new"            — the canonical Catch object (shape below, C1)
//   "resource:change"      — { resource, newValue, delta }
//   "realm:change"         — { from, to }
//   "upgrade:purchased"    — { upgradeId }
//   "research:complete"    — { nodeId }
//   "event:start"          — { eventId }
//   "event:end"            — { eventId }
//   "ascension:begin"      — {}
//   "ascension:complete"   — { memoriesSelected }
//   "achievement:unlock"   — { achievementId }
//   "encyclopedia:discover"— { speciesId }
//   "save:complete"        — {}
//
// Canonical Catch object (contracts.md C1) — the single shape produced by
// rarity.resolveCatch(...), emitted UNCHANGED on "catch:new", rendered by
// castPanel; economy.sellCatch credits EXACTLY catch.sellValue:
//   {
//     id: string,            // unique per catch instance
//     speciesId: string,     // matches data/species.js id (or event-exclusive id)
//     name: string,
//     realm: RealmId,
//     rarity: RarityTier,
//     size: number,          // cm, float
//     trait: string,
//     sellValue: number,     // FINAL gold credited on Sell (bonuses applied)
//     rpValue: number,       // RP credited on Research
//     isNewDiscovery: boolean,
//     isImpossible: boolean,
//     fromNet: boolean       // true if produced by Boat passive net
//   }
// ---------------------------------------------------------------------------

// Canonical id ordering. Constant arrays (do not mutate).
export const RealmId = ['pond', 'ocean', 'abyss', 'dream_sea', 'time_ocean', 'cosmic_void'];
export const RarityTier = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'impossible'];

/**
 * createDefaultState — fresh GameState object matching REQUIREMENTS §3.2.
 * Always returns a brand-new object (no shared references between calls).
 */
export function createDefaultState() {
  return {
    saveVersion: 1,
    timestamp: 0,
    lastLoginTimestamp: 0,

    // Resources
    resources: {
      gold: 0,
      rp: 0,
      collectionEssence: 0,
      voidShards: 0,
      temporalCrystals: 0,
      cosmicMemories: []
    },

    // Progression
    currentRealm: 'pond',
    unlockedRealms: ['pond'],
    ascensionCount: 0,
    lifetimeGoldEarned: 0,
    lifetimeCastCount: 0,

    // Upgrades
    ownedUpgrades: [],

    // Research
    completedResearch: [],
    researchQueue: { slot1: null, slot2: null },

    // Encyclopedia
    encyclopediaDiscoveries: {},

    // Automation
    automationOwned: [],
    automationEnabled: {},

    // Ascension
    ascensionLoreUnlocked: [],

    // Achievements
    unlockedAchievements: {},

    // Statistics
    statistics: {
      totalCasts: 0,
      totalFishCaught: 0,
      rarityCounts: {
        common: 0,
        uncommon: 0,
        rare: 0,
        epic: 0,
        legendary: 0,
        mythic: 0,
        impossible: 0
      },
      largestCatch: null,
      mostValuableCatch: null,
      catchLog: [],
      playtimeSeconds: 0,
      realmTimeSeconds: {}
    },

    // Settings
    settings: {
      numberFormat: 'standard',
      reduceAnimations: false,
      showCastTimer: true
    }
  };
}

/**
 * GameState — the mutable live singleton. Importers hold THIS reference;
 * replaceState() mutates it in place so references stay valid.
 */
export const GameState = createDefaultState();

/**
 * replaceState(newState) — mutate the GameState singleton in place by copying
 * keys from newState onto it. Stale keys not present in newState are removed
 * so the object matches newState exactly while preserving the reference.
 */
export function replaceState(newState) {
  for (const key of Object.keys(GameState)) {
    if (!(key in newState)) delete GameState[key];
  }
  for (const key of Object.keys(newState)) {
    GameState[key] = newState[key];
  }
  return GameState;
}

/**
 * Bus — tiny synchronous event emitter. A throwing listener is isolated
 * (try/catch + console.error) and never blocks the other listeners.
 */
export const Bus = {
  _listeners: {},

  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
    return fn;
  },

  off(event, fn) {
    const fns = this._listeners[event];
    if (!fns) return;
    const i = fns.indexOf(fn);
    if (i !== -1) fns.splice(i, 1);
  },

  emit(event, payload) {
    const fns = this._listeners[event];
    if (!fns) return;
    // Iterate a copy so on/off during emit doesn't disturb this dispatch.
    for (const fn of fns.slice()) {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[Bus] listener for "${event}" threw:`, err);
      }
    }
  }
};

function defaultSessionFlags() {
  return {
    temporalSpeciesCaughtThisSession: [],
    castsSinceLastBirthOfStar: 0,
    researchedThisRun: [],
    tabHidden: false,
    hiddenAccumulator: { fish: 0, gold: 0, rp: 0 }
  };
}

/**
 * sessionFlags — in-memory ONLY (never persisted). Keys per contracts.md C4.
 */
export const sessionFlags = defaultSessionFlags();

/**
 * resetSessionFlags — restore sessionFlags to defaults, in place.
 */
export function resetSessionFlags() {
  const fresh = defaultSessionFlags();
  for (const key of Object.keys(sessionFlags)) delete sessionFlags[key];
  for (const key of Object.keys(fresh)) sessionFlags[key] = fresh[key];
  return sessionFlags;
}
