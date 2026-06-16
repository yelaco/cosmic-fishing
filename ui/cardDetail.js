// ui/cardDetail.js — Shared compact-card → detail-modal interaction layer.
// C0 NODE-SAFETY: NO browser globals (document/window) at module top level.
// All DOM access is inside exported functions.

// ─── Internal state ─────────────────────────────────────────────────────────

let _openDetail = null;
// Shape: { el, kind, id, opener, keyHandler, backdropHandler, actionHandler, overlayRoot }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getFocusable(panel) {
  return Array.from(
    panel.querySelectorAll(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
    )
  ).filter(el => !el.closest('[hidden]'));
}

// ─── Focus trap ───────────────────────────────────────────────────────────────

function trapTab(panel, e) {
  if (e.key !== 'Tab') return;
  const focusable = getFocusable(panel);
  if (focusable.length === 0) { e.preventDefault(); return; }
  const first = focusable[0];
  const last  = focusable[focusable.length - 1];
  if (e.shiftKey) {
    if (document.activeElement === first) { e.preventDefault(); last.focus(); }
  } else {
    if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
  }
}

// ─── Core close logic ────────────────────────────────────────────────────────

function _doClose() {
  if (!_openDetail) return;
  const { el, opener, keyHandler, backdropHandler, actionHandler, overlayRoot } = _openDetail;

  document.removeEventListener('keydown', keyHandler);
  overlayRoot.removeEventListener('click', backdropHandler);
  if (actionHandler) el.removeEventListener('click', actionHandler);

  el.remove();
  _openDetail = null;

  if (opener && typeof opener.focus === 'function') {
    try { opener.focus(); } catch (_) { /* opener may have been removed */ }
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Returns the currently open detail info, or null.
 * @returns {{ el: HTMLElement, kind: string, id: string } | null}
 */
export function getOpenDetail() {
  if (!_openDetail) return null;
  return { el: _openDetail.el, kind: _openDetail.kind, id: _openDetail.id };
}

/**
 * Closes any open card-detail modal.
 */
export function closeCardDetail() {
  _doClose();
}

/**
 * Opens a card-detail modal in #overlay-root.
 *
 * @param {object} opts
 * @param {string}   opts.title
 * @param {string}  [opts.chipHtml]    — raw HTML for the chip before the title
 * @param {string}   opts.bodyHtml     — raw HTML for the body
 * @param {string}  [opts.actionsHtml] — raw HTML for the actions row (omitted if falsy)
 * @param {string}  [opts.rarityClass] — extra class added to the panel root
 * @param {string}  [opts.id]          — stored as data-detail-id
 * @param {string}  [opts.kind]        — stored as data-detail-kind
 * @param {function}[opts.onAction]    — (actionEl, detailEl) for [data-card-action] clicks
 */
export function openCardDetail({
  title = '',
  chipHtml = '',
  bodyHtml = '',
  actionsHtml = '',
  rarityClass = '',
  id = '',
  kind = '',
  onAction,
} = {}) {
  // Close any existing modal first
  _doClose();

  const overlayRoot = document.getElementById('overlay-root');
  if (!overlayRoot) return;

  // Save opener before we shift focus
  const opener = document.activeElement;

  // Build panel element
  const safeTitle = escapeHtml(title);
  const actionsSection = actionsHtml
    ? `<div class="card-detail__actions">${actionsHtml}</div>`
    : '';

  const panel = document.createElement('div');
  panel.className = ['overlay-panel', 'card-detail', rarityClass].filter(Boolean).join(' ');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'card-detail-title');
  if (id)   panel.dataset.detailId   = id;
  if (kind) panel.dataset.detailKind = kind;

  panel.innerHTML =
    `<button class="close-btn" aria-label="Close">\u00d7</button>` +
    `<h2 id="card-detail-title" class="card-detail__title">${chipHtml ? chipHtml + ' ' : ''}${safeTitle}</h2>` +
    `<div class="card-detail__body">${bodyHtml}</div>` +
    actionsSection;

  overlayRoot.appendChild(panel);

  // Move focus to close button
  const closeBtn = panel.querySelector('.close-btn');
  if (closeBtn) closeBtn.focus();

  // Wire close button
  if (closeBtn) closeBtn.addEventListener('click', _doClose);

  // Keyboard: Esc to close, Tab to trap
  const keyHandler = function keyHandler(e) {
    if (e.key === 'Escape') { _doClose(); return; }
    trapTab(panel, e);
  };
  document.addEventListener('keydown', keyHandler);

  // Backdrop click — only fires when the click target IS #overlay-root itself
  const backdropHandler = function backdropHandler(e) {
    if (e.target === overlayRoot) _doClose();
  };
  overlayRoot.addEventListener('click', backdropHandler);

  // Action delegation for [data-card-action] buttons inside the panel
  let actionHandler = null;
  if (typeof onAction === 'function') {
    actionHandler = function actionHandler(e) {
      const actionEl = e.target.closest('[data-card-action]');
      if (actionEl && panel.contains(actionEl)) onAction(actionEl, panel);
    };
    panel.addEventListener('click', actionHandler);
  }

  _openDetail = { el: panel, kind, id, opener, keyHandler, backdropHandler, actionHandler, overlayRoot };
}

// ─── bindCardGrid ─────────────────────────────────────────────────────────────

/**
 * Attaches ONE delegated click + keydown listener to `container` for
 * elements matching [data-detail-id]. Idempotent — safe to call on every
 * re-render; the dataset flag prevents stacking listeners.
 *
 * @param {HTMLElement} container
 * @param {function} resolveDetail — (id, kind, cardEl) => openCardDetail-args-object | null
 */
export function bindCardGrid(container, resolveDetail) {
  if (!container || container.dataset.cardGridBound) return;
  container.dataset.cardGridBound = '1';

  function handleActivate(e) {
    const card = e.target.closest('[data-detail-id]');
    if (!card || !container.contains(card)) return;
    if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    if (e.type === 'keydown') e.preventDefault();

    const detailId   = card.dataset.detailId   || '';
    const detailKind = card.dataset.detailKind || '';
    const args = resolveDetail(detailId, detailKind, card);
    if (!args) return;
    openCardDetail({ ...args, id: detailId, kind: detailKind });
  }

  container.addEventListener('click',   handleActivate);
  container.addEventListener('keydown', handleActivate);
}
