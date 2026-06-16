// ui/researchTab.js — Research DAG tab (T24, FR-060..063, A-014)
// C0 NODE-SAFETY: no top-level browser access. All DOM interaction is inside
// initResearchTab() and helpers called only at runtime.

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

const IGNITE_DURATION = 450; // ms — transient rt-node--igniting class lifetime

// Impossible puzzle path (FR-015)
const IMPOSSIBLE_PATH = new Set(['prime_sequence', 'harmonic_convergence', 'void_mathematics']);

// Build a fast lookup map
const NODE_MAP = new Map(RESEARCH.map(n => [n.id, n]));

// ── Module-level guard (idempotency) ───────────────────────────────────────────
let _initialized = false;

// One-time ceremony guard — fires at most once per session
let _impossibleCeremonyFired = false;

// Live reference to the "next affordable node" span inside _rpBarEl
let _nextNodeEl = null;

// ── Helpers ────────────────────────────────────────────────────────────────────

function nodeStatus(nodeId) {
  const { completedResearch, resources } = GameState;
  const node = NODE_MAP.get(nodeId);
  if (!node) return 'locked';
  if (completedResearch.includes(nodeId)) return 'purchased';
  const prereqsMet = node.prerequisites.every(p => completedResearch.includes(p));
  if (!prereqsMet) return 'locked';
  return (resources.rp ?? 0) >= node.cost ? 'available' : 'locked';
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

/** Human-readable summary of node effects, or fall back to description. */
function effectLine(node) {
  if (!node.effects || node.effects.length === 0) return node.description;
  const parts = node.effects.map(e => {
    const { type, value } = e;
    if (type === 'gold_multiplier')               return `+${Math.round((value - 1) * 100)}% gold`;
    if (type === 'cast_time_multiplier')           return `-${Math.round((1 - value) * 100)}% cast time`;
    if (type === 'research_speed_multiplier')      return `-${Math.round((1 - value) * 100)}% research time`;
    if (type === 'net_interval_multiplier')        return `-${Math.round((1 - value) * 100)}% net interval`;
    if (type === 'rarity_weight_bonus')            return `+${Math.round(value * 100)}% rare catch rate`;
    if (type === 'void_shard_rate_bonus')          return `+${Math.round(value * 100)}% void shard rate`;
    if (type === 'temporal_crystal_rate_bonus')    return `+${Math.round(value * 100)}% temporal crystal rate`;
    if (type === 'auto_cast_interval_multiplier')  return `-${Math.round((1 - value) * 100)}% auto-cast interval`;
    if (type === 'collection_essence_bonus')       return `+${value} Collection Essence on discovery`;
    return `${type}: ${value}`;
  });
  return parts.join('; ');
}

// ── Build DOM once ─────────────────────────────────────────────────────────────

// Live references patched on each update
let _rpTextNode  = null;   // Text node inside rp-bar <strong>
let _rpBarEl     = null;   // .rt-rp-bar element
let _nodeRefs    = null;   // Map<nodeId, { el, buyBtn, statusClasses }>
let _connRefs    = null;   // Map<`${fromId}->${toId}`, SVGLineElement>
let _tooltipEl   = null;   // single .rt-tooltip host

function buildDOM(container) {
  // Compute canvas extent
  let maxX = 0, maxY = 0;
  for (const n of RESEARCH) {
    if (n.position.x > maxX) maxX = n.position.x;
    if (n.position.y > maxY) maxY = n.position.y;
  }
  const svgW = PAD_X * 2 + (maxX + 1) * CELL_W;
  const svgH = PAD_Y * 2 + (maxY + 1) * CELL_H;

  // ── RP bar ─────────────────────────────────────────────────────────────
  const rpBar = document.createElement('div');
  rpBar.className = 'rt-rp-bar';
  rpBar.innerHTML = 'Research Points: <strong></strong>';
  _rpBarEl = rpBar;
  _rpTextNode = rpBar.querySelector('strong');

  // ── Wrap ───────────────────────────────────────────────────────────────
  const wrap = document.createElement('div');
  wrap.className = 'rt-wrap';
  wrap.style.cssText = `width:${svgW}px;height:${svgH}px;position:relative;`;

  // ── SVG connectors ─────────────────────────────────────────────────────
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'rt-svg');
  svg.setAttribute('width', String(svgW));
  svg.setAttribute('height', String(svgH));
  svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;overflow:visible;';

  _connRefs = new Map();
  for (const node of RESEARCH) {
    const { cx: x2, cy: y2 } = nodeCentre(node.position);
    for (const prereqId of node.prerequisites) {
      const prereq = NODE_MAP.get(prereqId);
      if (!prereq) continue;
      const { cx: x1, cy: y1 } = nodeCentre(prereq.position);
      const isImpossibleEdge = IMPOSSIBLE_PATH.has(node.id) && IMPOSSIBLE_PATH.has(prereqId);
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(x1));
      line.setAttribute('y1', String(y1));
      line.setAttribute('x2', String(x2));
      line.setAttribute('y2', String(y2));
      line.setAttribute('class', isImpossibleEdge
        ? 'rt-connector rt-connector--impossible'
        : 'rt-connector');
      svg.appendChild(line);
      _connRefs.set(`${prereqId}->${node.id}`, { line, isImpossibleEdge, fromId: prereqId, toId: node.id });
    }
  }
  wrap.appendChild(svg);

  // ── Node cards ─────────────────────────────────────────────────────────
  _nodeRefs = new Map();
  for (const node of RESEARCH) {
    const status = nodeStatus(node.id);
    const { cx, cy } = nodeCentre(node.position);
    const left = cx - NODE_W / 2;
    const top  = cy - NODE_H / 2;

    const el = document.createElement('div');
    el.dataset.nodeId = node.id;
    el.style.cssText = `left:${left}px;top:${top}px;width:${NODE_W}px;height:${NODE_H}px;position:absolute;box-sizing:border-box;`;

    const baseClasses = [
      'rt-node',
      node.isRealmGate ? 'rt-node--realm-gate' : '',
      IMPOSSIBLE_PATH.has(node.id) ? 'rt-node--impossible-path' : '',
    ].filter(Boolean);
    el.className = [...baseClasses, `rt-node--${status}`].join(' ');

    // Header
    const header = document.createElement('div');
    header.className = 'rt-node__header';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'rt-node__name';
    nameSpan.textContent = node.name;
    header.appendChild(nameSpan);

    if (node.isRealmGate) {
      const badge = document.createElement('span');
      badge.className = 'rt-node__gate-badge';
      badge.textContent = 'REALM GATE';
      header.appendChild(badge);
    }
    if (IMPOSSIBLE_PATH.has(node.id)) {
      const badge = document.createElement('span');
      badge.className = 'rt-node__puzzle-badge';
      badge.textContent = 'PUZZLE';
      header.appendChild(badge);
    }
    el.appendChild(header);

    // Cost
    const costDiv = document.createElement('div');
    costDiv.className = 'rt-node__cost';
    costDiv.textContent = `${format(node.cost)} RP`;
    el.appendChild(costDiv);

    // Prereqs
    const prereqNamesArr = prereqNames(node);
    if (prereqNamesArr.length > 0) {
      const prereqDiv = document.createElement('div');
      prereqDiv.className = 'rt-node__prereqs';
      prereqDiv.textContent = `Requires: ${prereqNamesArr.join(', ')}`;
      el.appendChild(prereqDiv);
    }

    // Buy button (always present; shown/hidden via display)
    const buyBtn = document.createElement('button');
    buyBtn.className = 'rt-node__buy-btn';
    buyBtn.dataset.nodeId = node.id;
    buyBtn.textContent = 'Buy';
    buyBtn.style.display = status === 'available' ? '' : 'none';
    el.appendChild(buyBtn);

    wrap.appendChild(el);
    _nodeRefs.set(node.id, { el, buyBtn, baseClasses });
  }

  // ── Tooltip host ───────────────────────────────────────────────────────
  const tooltip = document.createElement('div');
  tooltip.className = 'rt-tooltip';
  // hidden by default; shown via data-show="true"
  wrap.appendChild(tooltip);
  _tooltipEl = tooltip;

  // ── Assemble ───────────────────────────────────────────────────────────
  container.appendChild(rpBar);
  container.appendChild(wrap);
}

// ── Patch ──────────────────────────────────────────────────────────────────────

function patch(justCompletedId) {
  const rp = GameState.resources.rp ?? 0;

  // Update RP bar text
  _rpTextNode.textContent = `${format(rp)} RP`;

  // Impossible path completion — ceremony (fires once per session) + RP-bar marker
  const allImpDone = [...IMPOSSIBLE_PATH].every(id =>
    GameState.completedResearch.includes(id));
  if (allImpDone && !_impossibleCeremonyFired &&
      justCompletedId && IMPOSSIBLE_PATH.has(justCompletedId)) {
    _impossibleCeremonyFired = true;
    try {
      const overlay = document.createElement('div');
      overlay.className = 'rt-impossible-ceremony';
      overlay.setAttribute('role', 'status');
      overlay.textContent = 'The impossible has been completed. Something stirs in the void.';
      const root = document.getElementById('overlay-root') || document.body;
      root.appendChild(overlay);
      setTimeout(() => {
        try { overlay.remove(); } catch (_) { /* noop */ }
      }, 3500);
    } catch (_) { /* noop */ }
  }
  // RP-bar quiet marker
  const existingMsg = _rpBarEl.querySelector('.rt-impossible-msg');
  if (allImpDone && !existingMsg) {
    const msg = document.createElement('span');
    msg.className = 'rt-impossible-msg';
    msg.textContent = ' \u2014 The Impossible Path is complete.';
    _rpBarEl.appendChild(msg);
  } else if (!allImpDone && existingMsg) {
    existingMsg.remove();
  }

  // Next affordable node indicator
  const rp2 = GameState.resources.rp ?? 0;
  let cheapest = null;
  for (const node of RESEARCH) {
    if (GameState.completedResearch.includes(node.id)) continue;
    const prereqsMet = node.prerequisites.every(p => GameState.completedResearch.includes(p));
    if (!prereqsMet) continue;
    if (cheapest === null || node.cost < cheapest.cost) cheapest = node;
  }
  if (cheapest) {
    if (!_nextNodeEl) {
      _nextNodeEl = document.createElement('span');
      _nextNodeEl.className = 'rt-next-node';
      _rpBarEl.appendChild(_nextNodeEl);
    }
    _nextNodeEl.textContent = `\u00b7 Next: ${cheapest.name} (${format(cheapest.cost)} RP)`;
  } else if (_nextNodeEl) {
    _nextNodeEl.remove();
    _nextNodeEl = null;
  }

  // Update each node's classes and buy button
  for (const node of RESEARCH) {
    const ref = _nodeRefs.get(node.id);
    if (!ref) continue;
    const status = nodeStatus(node.id);
    ref.el.className = [...ref.baseClasses, `rt-node--${status}`].join(' ');
    ref.buyBtn.style.display = status === 'available' ? '' : 'none';
  }

  // Ignite ceremony for just-completed node
  if (justCompletedId) {
    const ref = _nodeRefs.get(justCompletedId);
    if (ref) {
      ref.el.classList.add('rt-node--igniting');
      setTimeout(() => ref.el.classList.remove('rt-node--igniting'), IGNITE_DURATION);
    }
  }

  // Update connector lit state
  for (const [, { line, isImpossibleEdge, fromId, toId }] of _connRefs) {
    const lit = GameState.completedResearch.includes(fromId) &&
                GameState.completedResearch.includes(toId);
    const base = isImpossibleEdge
      ? 'rt-connector rt-connector--impossible'
      : 'rt-connector';
    line.setAttribute('class', lit ? `${base} rt-connector--lit` : base);
  }
}

// ── Tooltip logic ──────────────────────────────────────────────────────────────

function showTooltip(node, anchorEl) {
  const rect = anchorEl.getBoundingClientRect();
  const wrapRect = anchorEl.offsetParent
    ? anchorEl.offsetParent.getBoundingClientRect()
    : rect;

  // Position: right of the node, or left-shifted if near viewport edge
  let left = anchorEl.offsetLeft + NODE_W + 8;
  let top  = anchorEl.offsetTop;

  // Build tooltip content
  const prereqNamesArr = prereqNames(node);
  const prereqLine = prereqNamesArr.length
    ? `<div class="rt-tooltip__prereqs">Requires: ${prereqNamesArr.join(', ')}</div>`
    : '';

  _tooltipEl.innerHTML = `
    <div class="rt-tooltip__name">${node.name}</div>
    <div class="rt-tooltip__effect">${effectLine(node)}</div>
    <div class="rt-tooltip__cost">${format(node.cost)} RP</div>
    ${prereqLine}
  `.trim();

  _tooltipEl.style.left = `${left}px`;
  _tooltipEl.style.top  = `${top}px`;
  _tooltipEl.dataset.show = 'true';
}

function hideTooltip() {
  delete _tooltipEl.dataset.show;
}

// ── Event handlers ─────────────────────────────────────────────────────────────

function onContainerClick(e) {
  const btn = e.target.closest('.rt-node__buy-btn');
  if (!btn) return;
  const nodeId = btn.dataset.nodeId;
  if (!nodeId) return;
  const result = purchaseResearch(nodeId);
  if (!result.ok) {
    const orig = btn.textContent;
    btn.textContent = result.reason;
    btn.disabled = true;
    setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 1500);
  }
}

function onNodeMouseEnter(e) {
  const nodeEl = e.target.closest('.rt-node[data-node-id]');
  if (!nodeEl) return;
  const node = NODE_MAP.get(nodeEl.dataset.nodeId);
  if (!node) return;
  showTooltip(node, nodeEl);
}

function onNodeMouseLeave(e) {
  // Only hide when leaving to something outside the tooltip itself
  const related = e.relatedTarget;
  if (related && (_tooltipEl.contains(related) || related === _tooltipEl)) return;
  hideTooltip();
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function initResearchTab() {
  if (_initialized) return;
  _initialized = true;

  const container = document.getElementById('tab-research');
  if (!container) return;

  // Build the DOM once
  buildDOM(container);

  // Initial patch to reflect current state
  patch(null);

  // Single delegated click listener
  container.addEventListener('click', onContainerClick);

  // Tooltip listeners on the wrap (second child = .rt-wrap)
  const wrap = container.querySelector('.rt-wrap');
  if (wrap) {
    wrap.addEventListener('mouseenter', onNodeMouseEnter, true);
    wrap.addEventListener('mouseleave', onNodeMouseLeave, true);
  }

  // Track last completedResearch snapshot to diff on research:complete
  let _prevCompleted = GameState.completedResearch.slice();

  Bus.on('resource:change', () => {
    patch(null);
  });

  Bus.on('research:complete', () => {
    const current = GameState.completedResearch;
    // Find which node was just added
    const justDone = current.find(id => !_prevCompleted.includes(id)) ?? null;
    _prevCompleted = current.slice();
    patch(justDone);
  });
}
