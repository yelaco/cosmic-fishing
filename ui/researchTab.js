// ui/researchTab.js — Research DAG tab (T24, FR-060..063, A-014)
// C0 NODE-SAFETY: no top-level browser access. All DOM interaction is inside
// initResearchTab() and render(), which are only invoked at runtime.

import { format } from './format.js';
import { GameState, Bus } from '../engine/state.js';
import { purchaseResearch } from '../engine/economy.js';
import RESEARCH from '../data/research.js';

// ── Constants ──────────────────────────────────────────────────────────────────

const NODE_W  = 120; // px — node card width
const NODE_H  = 60;  // px — node card height
const CELL_W  = 160; // px — grid column stride
const CELL_H  = 100; // px — grid row stride
const PAD_X   = 20;  // px — left/top padding inside SVG/canvas
const PAD_Y   = 20;

// Impossible puzzle path (FR-015)
const IMPOSSIBLE_PATH = new Set(['prime_sequence', 'harmonic_convergence', 'void_mathematics']);

// Build a fast lookup map
const NODE_MAP = new Map(RESEARCH.map(n => [n.id, n]));

// ── Helpers ────────────────────────────────────────────────────────────────────

function nodeStatus(nodeId) {
  const { completedResearch, resources } = GameState;
  const node = NODE_MAP.get(nodeId);
  if (!node) return 'locked';

  if (completedResearch.includes(nodeId)) return 'purchased';

  const prereqsMet = node.prerequisites.every(p => completedResearch.includes(p));
  if (!prereqsMet) return 'locked';

  const canAfford = (resources.rp ?? 0) >= node.cost;
  return canAfford ? 'available' : 'locked';
}

/** Grid position → pixel centre for a node. */
function nodeCentre(pos) {
  return {
    cx: PAD_X + pos.x * CELL_W + NODE_W / 2,
    cy: PAD_Y + pos.y * CELL_H + NODE_H / 2,
  };
}

function prereqNames(node) {
  return node.prerequisites.map(id => {
    const n = NODE_MAP.get(id);
    return n ? n.name : id;
  });
}

// ── Render ─────────────────────────────────────────────────────────────────────

function render(container) {
  // Compute canvas extent
  let maxX = 0, maxY = 0;
  for (const n of RESEARCH) {
    if (n.position.x > maxX) maxX = n.position.x;
    if (n.position.y > maxY) maxY = n.position.y;
  }
  const svgW = PAD_X * 2 + (maxX + 1) * CELL_W;
  const svgH = PAD_Y * 2 + (maxY + 1) * CELL_H;

  const rp = GameState.resources.rp ?? 0;

  // ── SVG connector lines ──────────────────────────────────────────────────
  let svgLines = '';
  for (const node of RESEARCH) {
    const { cx: x2, cy: y2 } = nodeCentre(node.position);
    for (const prereqId of node.prerequisites) {
      const prereq = NODE_MAP.get(prereqId);
      if (!prereq) continue;
      const { cx: x1, cy: y1 } = nodeCentre(prereq.position);
      const isImpossibleEdge =
        IMPOSSIBLE_PATH.has(node.id) && IMPOSSIBLE_PATH.has(prereqId);
      const lineClass = isImpossibleEdge
        ? 'rt-connector rt-connector--impossible'
        : 'rt-connector';
      svgLines += `<line class="${lineClass}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
    }
  }

  // ── Node cards ───────────────────────────────────────────────────────────
  let cards = '';
  for (const node of RESEARCH) {
    const status = nodeStatus(node.id);
    const { cx, cy } = nodeCentre(node.position);
    const left = cx - NODE_W / 2;
    const top  = cy - NODE_H / 2;

    const classes = [
      'rt-node',
      `rt-node--${status}`,
      node.isRealmGate      ? 'rt-node--realm-gate'      : '',
      IMPOSSIBLE_PATH.has(node.id) ? 'rt-node--impossible-path' : '',
    ].filter(Boolean).join(' ');

    const prereqNamesStr = prereqNames(node).join(', ');
    const prereqHint = prereqNamesStr
      ? `<div class="rt-node__prereqs">Requires: ${prereqNamesStr}</div>`
      : '';

    const gateTag = node.isRealmGate
      ? '<span class="rt-node__gate-badge">REALM GATE</span>'
      : '';

    const puzzleTag = IMPOSSIBLE_PATH.has(node.id)
      ? '<span class="rt-node__puzzle-badge">PUZZLE</span>'
      : '';

    const buyBtn = status === 'available'
      ? `<button class="rt-node__buy-btn" data-node-id="${node.id}">Buy</button>`
      : '';

    // Tooltip via title attribute (m1 — no custom tooltip logic)
    const tipLines = [
      node.description,
      prereqNamesStr ? `Requires: ${prereqNamesStr}` : '',
      node.isRealmGate ? 'This is a Realm Gate node.' : '',
    ].filter(Boolean).join('\n');

    cards += `
<div class="${classes}"
     style="left:${left}px;top:${top}px;width:${NODE_W}px;height:${NODE_H}px;"
     title="${tipLines.replace(/"/g, '&quot;')}"
     data-node-id="${node.id}">
  <div class="rt-node__header">
    <span class="rt-node__name">${node.name}</span>
    ${gateTag}${puzzleTag}
  </div>
  <div class="rt-node__cost">${format(node.cost)} RP</div>
  ${prereqHint}
  ${buyBtn}
</div>`;
  }

  // ── CSS ──────────────────────────────────────────────────────────────────
  const css = `
<style id="rt-styles">
#tab-research { position:relative; overflow:auto; background:#0a0f1e; color:#d0e8ff; font-family:monospace; }
.rt-wrap { position:relative; }
.rt-svg { position:absolute; top:0; left:0; pointer-events:none; overflow:visible; }
.rt-connector { stroke:#2a4060; stroke-width:1.5; stroke-dasharray:4 3; }
.rt-connector--impossible { stroke:#7f4fff; stroke-width:2; stroke-dasharray:none; }
.rt-node {
  position:absolute; box-sizing:border-box;
  border:1px solid #2a4060; border-radius:6px;
  background:#0d1a2e; padding:4px 6px;
  font-size:10px; cursor:default; overflow:hidden;
  transition:box-shadow .15s, border-color .15s;
}
.rt-node--locked { opacity:.45; }
.rt-node--available { border-color:#3a7fff; box-shadow:0 0 6px #3a7fff66; cursor:pointer; }
.rt-node--purchased { border-color:#00c87a; background:#0d2218; }
.rt-node--realm-gate { border-style:double; border-width:3px; }
.rt-node--realm-gate.rt-node--purchased { border-color:#ffd700; }
.rt-node--realm-gate.rt-node--available { border-color:#ffd700; box-shadow:0 0 8px #ffd70088; }
.rt-node--impossible-path { box-shadow:inset 0 0 8px #7f4fff55; }
.rt-node--impossible-path.rt-node--purchased { border-color:#bf7fff; background:#180d2e; }
.rt-node__header { display:flex; align-items:center; gap:4px; flex-wrap:wrap; }
.rt-node__name { font-weight:bold; font-size:10px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:72px; }
.rt-node__gate-badge { font-size:8px; background:#ffd70033; color:#ffd700; border-radius:3px; padding:0 3px; white-space:nowrap; }
.rt-node__puzzle-badge { font-size:8px; background:#7f4fff33; color:#bf7fff; border-radius:3px; padding:0 3px; white-space:nowrap; }
.rt-node__cost { color:#88bbff; font-size:9px; }
.rt-node__prereqs { color:#607080; font-size:8px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.rt-node__buy-btn {
  margin-top:2px; padding:1px 6px; font-size:9px;
  background:#1a3a6e; border:1px solid #3a7fff; color:#88ccff;
  border-radius:3px; cursor:pointer;
}
.rt-node__buy-btn:hover { background:#1f4e9a; }
.rt-rp-bar { position:sticky; top:0; z-index:10; background:#060d1a; border-bottom:1px solid #1a2a3a; padding:6px 12px; font-size:12px; }
</style>`;

  // ── Assemble HTML ────────────────────────────────────────────────────────
  container.innerHTML = `
${css}
<div class="rt-rp-bar">Research Points: <strong>${format(rp)} RP</strong></div>
<div class="rt-wrap" style="width:${svgW}px;height:${svgH}px;">
  <svg class="rt-svg" width="${svgW}" height="${svgH}" aria-hidden="true">${svgLines}</svg>
  ${cards}
</div>`;

  // ── Event delegation for buy buttons ────────────────────────────────────
  container.addEventListener('click', onContainerClick);
}

function onContainerClick(e) {
  const btn = e.target.closest('.rt-node__buy-btn');
  if (!btn) return;
  const nodeId = btn.dataset.nodeId;
  if (!nodeId) return;
  const result = purchaseResearch(nodeId);
  if (!result.ok) {
    // Surface reason briefly via button text (no console errors)
    const orig = btn.textContent;
    btn.textContent = result.reason;
    btn.disabled = true;
    setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1500);
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function initResearchTab() {
  const container = document.getElementById('tab-research');
  if (!container) return;

  // Initial render
  render(container);

  // Re-render on resource or research changes; remove old listener first
  // to avoid double-registration if initResearchTab is called again.
  let _rcHandler, _rHandler;

  _rcHandler = () => {
    // Re-render fully (DAG status depends on both rp and completedResearch)
    container.removeEventListener('click', onContainerClick);
    render(container);
  };

  _rHandler = () => {
    container.removeEventListener('click', onContainerClick);
    render(container);
  };

  Bus.on('resource:change', _rcHandler);
  Bus.on('research:complete', _rHandler);
}
