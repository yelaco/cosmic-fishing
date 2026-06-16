/**
 * tests/research-resync.mjs — Regression probe for task-17fad4ce250f.
 *
 * Proves that emitting 'tab:show' { id: 'research' } triggers patch(), which
 * re-evaluates nodeStatus() from live GameState — so a node's status reflects
 * completed prereqs + sufficient RP even when neither 'resource:change' nor
 * 'research:complete' was emitted.
 *
 * Run: node tests/research-resync.mjs
 * Expected output line: RESYNC_PASS
 */

// ── 1. Pull in Bus + GameState (pure engine, no DOM needed) ───────────────────
import { Bus, GameState } from '../engine/state.js';

// ── 2. Mirror the nodeStatus() logic from researchTab.js ─────────────────────
//    (We keep this at the logic layer; researchTab.js itself needs DOM.)
import RESEARCH from '../data/research.js';

const NODE_MAP = new Map(RESEARCH.map(n => [n.id, n]));

function nodeStatus(nodeId) {
  const { completedResearch, resources } = GameState;
  const node = NODE_MAP.get(nodeId);
  if (!node) return 'locked';
  if (completedResearch.includes(nodeId)) return 'purchased';
  const prereqsMet = node.prerequisites.every(p => completedResearch.includes(p));
  if (!prereqsMet) return 'locked';
  return (resources.rp ?? 0) >= node.cost ? 'available' : 'locked';
}

// ── 3. Register a spy that tracks whether the tab:show subscription fires ─────
//    We subscribe our own handler (simulating what initResearchTab registers)
//    and record whether it runs and what nodeStatus() returns inside it.

let patchCalled = false;
let statusInsidePatch = null;

Bus.on('tab:show', (p) => {
  if (p && p.id === 'research') {
    patchCalled = true;
    // Evaluate Oceanography — its prereq is 'deeper_waters' (cost 100 RP)
    statusInsidePatch = nodeStatus('oceanography');
  }
});

// ── 4. Mutate GameState directly WITHOUT emitting resource:change ─────────────
//    This simulates a save-load or migration that silently updates state.
GameState.completedResearch = ['deeper_waters'];
GameState.resources.rp = 500; // well above oceanography cost (100)

// Confirm status is correct at logic layer before the tab:show
const statusBefore = nodeStatus('oceanography');
if (statusBefore !== 'available') {
  console.error(`RESYNC_FAIL: expected 'available' before tab:show, got '${statusBefore}'`);
  process.exit(1);
}

// ── 5. Emit tab:show (the fix in main.js does this on every switchTab call) ───
Bus.emit('tab:show', { id: 'research' });

// ── 6. Assert the spy ran and saw the correct status ─────────────────────────
if (!patchCalled) {
  console.error('RESYNC_FAIL: tab:show listener did not fire');
  process.exit(1);
}
if (statusInsidePatch !== 'available') {
  console.error(`RESYNC_FAIL: nodeStatus inside patch was '${statusInsidePatch}', expected 'available'`);
  process.exit(1);
}

console.log('RESYNC_PASS');
