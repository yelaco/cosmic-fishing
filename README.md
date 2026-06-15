# Cosmic Fishing

A cozy-to-cosmic incremental fishing game that runs entirely in the browser with no backend, no build step, and no dependencies. Start by casting a line in a quiet pond, sell your catch, fund research, and upgrade your gear. Unlock new waters as your skill grows, from the open ocean to the crushing Abyss, the surreal Dream Sea, the temporal Time Ocean, and finally the Cosmic Void itself. Discover all 48 hand-authored species across 6 realms, each with its own lore entry in the encyclopedia. Research passive bonuses, automate your operation, survive world events, and ultimately Ascend -- trading progress for Cosmic Memories that permanently reshape future runs. Seven rarity tiers (Common, Uncommon, Rare, Epic, Legendary, Mythic, Impossible) keep every cast meaningful from the first minute to the last. Offline progression, achievements, and detailed statistics round out the experience.

---

## How to Run

**You must serve the game from a local HTTP server.** Opening `index.html` directly via `file://` will fail because browsers block ES module imports under the `file:` protocol due to CORS restrictions -- the browser treats each file as a cross-origin resource and refuses to load the modules.

Any static file server works. The canonical command:

```
cd cosmic_fishing
python -m http.server 8080
```

Then open `http://localhost:8080` in your browser.

Alternatives (all equivalent):

```
npx serve .
npx http-server -p 8080
```

No npm install, no build step -- just start the server and open the URL.

---

## Zero Dependencies

The game is pure vanilla HTML, CSS, and JavaScript (ES modules). There is nothing to install to play it. Playwright is the only dev dependency, used exclusively for the smoke test.

---

## Project Structure

```
cosmic_fishing/
├── index.html              # Entry point; loads styles and bootstraps the app
├── styles.css              # All visual styles
│
├── data/                   # Static game data (authored content)
│   ├── species.js          # 48 fish species with lore, rarity, realm assignments
│   ├── upgrades.js         # Upgrade definitions and costs
│   ├── research.js         # Research tree nodes and unlock conditions
│   ├── events.js           # World event definitions
│   ├── achievements.js     # Achievement criteria and rewards
│   └── cosmicMemories.js   # Ascension memory definitions and bonuses
│
├── engine/                 # Core game logic (no DOM access)
│   ├── state.js            # Central mutable game state
│   ├── economy.js          # Sell prices, income calculations
│   ├── rarity.js           # Rarity roll logic and tier weights
│   ├── save.js             # Serialize/deserialize state; localStorage key: cosmic_fishing_save
│   ├── offline.js          # Offline progression (up to 8 hours)
│   ├── automation.js       # Auto-cast and auto-sell logic
│   ├── events_engine.js    # World event triggering and resolution
│   ├── ascension.js        # Ascension / prestige logic
│   ├── realms.js           # Realm unlock conditions and modifiers
│   └── gameLoop.js         # Main tick loop
│
├── ui/                     # DOM rendering and user interaction
│   ├── main.js             # App init, tab routing
│   ├── resourceBar.js      # Gold / bait / reagent display
│   ├── castPanel.js        # Cast button, catch display, reel animations
│   ├── realmPanel.js       # Realm selection UI
│   └── tabs/               # One module per tab (Encyclopedia, Research, Upgrades, etc.)
│
└── tests/
    ├── smoke.spec.js       # Playwright smoke test
    └── run-smoke.mjs       # Test runner entry point
```

---

## Saving

The game auto-saves to `localStorage` under the key `cosmic_fishing_save` every 30 seconds and on tab close. Offline progression is calculated on load, covering up to 8 hours away.

From the **Settings** tab you can:

- **Export save** -- copies a base64-encoded save string to your clipboard.
- **Import save** -- paste a base64 string to restore a save.
- **Reset** -- type `RESET` in the confirmation field to wipe all progress and start over.

---

## Development and Verification

**Syntax check any module without running it:**

```
node --check engine/state.js
```

**Run the Playwright smoke test:**

```
node tests/run-smoke.mjs
```

If Playwright is not yet installed:

```
npx playwright install chromium
node tests/run-smoke.mjs
```

The smoke test launches a headless browser, serves the game, and verifies the page loads without JS errors.
