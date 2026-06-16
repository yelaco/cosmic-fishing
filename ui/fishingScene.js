// ui/fishingScene.js — Fishing Stage scene for Cosmic Fishing.
// C0: No document/window/matchMedia access at module top level.
// All DOM access is inside initFishingScene() or its event handlers.

import { Bus } from '../engine/state.js';
import { speciesById } from '../data/species.js';

// ─── Module-local state ───────────────────────────────────────────────────────

/** Total cast duration recorded on cast:start (0 when no active cast). */
let _castTime = 0;

/** Tracked setTimeout handles so they can all be cancelled at once. */
let _timers = [];

/** Cancel and discard all tracked timers. */
function _clearTimers() {
  for (const h of _timers) clearTimeout(h);
  _timers = [];
}

/** Push a setTimeout handle into the tracked list. */
function _addTimer(fn, ms) {
  const h = setTimeout(fn, ms);
  _timers.push(h);
  return h;
}

// ─── State machine ────────────────────────────────────────────────────────────

/** Valid states: idle | casting | descending | bite | catching | reveal */
let _stage = null; // set once the DOM is built

function _setState(s) {
  if (_stage) _stage.dataset.sceneState = s;
}

// ─── Reduce-motion helper ─────────────────────────────────────────────────────

/**
 * _reduced() — return true if the user prefers reduced motion.
 * Called at event time (not module load) so the Settings toggle works live.
 * Beast B2.
 */
function _reduced() {
  return (
    document.body.classList.contains('reduce-animations') ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

// ─── DOM builders ─────────────────────────────────────────────────────────────

const SVG_NS = 'http://www.w3.org/2000/svg';

function _svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  }
  return el;
}

function _el(tag, className) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  return el;
}

/** Build the full .fishing-stage DOM tree. */
function _buildStage() {
  const stage = _el('div', 'fishing-stage');
  stage.dataset.sceneState = 'idle';

  // ── Sky ───────────────────────────────────────────────────────────────────
  stage.appendChild(_el('div', 'stage-sky'));

  // ── Horizon line ──────────────────────────────────────────────────────────
  stage.appendChild(_el('div', 'stage-horizon'));

  // ── Water surface + wave SVG ──────────────────────────────────────────────
  const waterSurface = _el('div', 'stage-water-surface');
  const waveSvg = _svgEl('svg');
  waveSvg.classList.add('wave-svg');
  waveSvg.setAttribute('preserveAspectRatio', 'none');
  waveSvg.setAttribute('viewBox', '0 0 1200 80');
  // Wave path 1 — primary swell
  const wavePath1 = _svgEl('path');
  wavePath1.setAttribute(
    'd',
    'M0 40 C150 10, 350 70, 600 40 C850 10, 1050 70, 1200 40 L1200 80 L0 80 Z'
  );
  wavePath1.classList.add('wave-path', 'wave-path--1');
  // Wave path 2 — secondary shimmer
  const wavePath2 = _svgEl('path');
  wavePath2.setAttribute(
    'd',
    'M0 50 C200 20, 400 80, 600 50 C800 20, 1000 80, 1200 50 L1200 80 L0 80 Z'
  );
  wavePath2.classList.add('wave-path', 'wave-path--2');
  waveSvg.appendChild(wavePath1);
  waveSvg.appendChild(wavePath2);
  waterSurface.appendChild(waveSvg);
  stage.appendChild(waterSurface);

  // ── Underwater: depth-particles + lure-bob ────────────────────────────────
  const underwater = _el('div', 'stage-underwater');

  const particles = _el('div', 'depth-particles');
  // 8 drifting particle spans; --i custom prop drives staggered delays in CSS
  for (let i = 0; i < 8; i++) {
    const p = _el('span');
    p.style.setProperty('--i', String(i));
    particles.appendChild(p);
  }
  underwater.appendChild(particles);

  const lureBob = _el('div', 'lure-bob');
  underwater.appendChild(lureBob);

  stage.appendChild(underwater);

  // ── Fishing line SVG ──────────────────────────────────────────────────────
  const lineSvg = _svgEl('svg');
  lineSvg.classList.add('line-svg');
  lineSvg.setAttribute('preserveAspectRatio', 'none');
  lineSvg.setAttribute('viewBox', '0 0 1000 1000');
  const fishingLine = _svgEl('path');
  fishingLine.id = 'fishing-line';
  // Rod-tip anchor (220,300) → lure idle rest (520,620)
  fishingLine.setAttribute('d', 'M220 300 Q380 480 520 620');
  fishingLine.setAttribute('fill', 'none');
  lineSvg.appendChild(fishingLine);
  stage.appendChild(lineSvg);

  // ── Rod rig ───────────────────────────────────────────────────────────────
  const rodRig = _el('div', 'rod-rig');
  rodRig.appendChild(_el('div', 'rod-pole'));
  rodRig.appendChild(_el('div', 'rod-reel'));
  rodRig.appendChild(_el('div', 'rod-tip'));
  stage.appendChild(rodRig);

  // ── Fish actor (hidden by default) ────────────────────────────────────────
  const fishActor = _el('div', 'fish-actor');
  fishActor.hidden = true;
  stage.appendChild(fishActor);

  // ── FX layer ──────────────────────────────────────────────────────────────
  stage.appendChild(_el('div', 'fx-layer'));

  return stage;
}

// ─── Main init ────────────────────────────────────────────────────────────────

/**
 * initFishingScene() — mount the fishing stage into #cast-area and wire Bus events.
 * Called once by main.js after the DOM is ready, immediately after initCastPanel.
 * C0-safe: all DOM/browser access is inside this function and its handlers.
 */
export function initFishingScene() {
  const area = document.getElementById('cast-area');
  if (!area) return; // graceful no-op; zero console output

  // Build the stage DOM and prepend it so castPanel's children stay as-is
  _stage = _buildStage();
  area.prepend(_stage);

  _setState('idle');

  // ── T3 helpers ────────────────────────────────────────────────────────────

  const lureBob = _stage.querySelector('.lure-bob');
  const fishingLine = _stage.querySelector('#fishing-line');
  const fxLayer = _stage.querySelector('.fx-layer');

  /**
   * Initialise the SVG fishing line for the stroke-dashoffset reveal animation.
   * Must be called after the stage is in the DOM (getTotalLength requires layout).
   * T5 hook: sets --line-length and stroke-dasharray on #fishing-line.
   */
  function _initLine() {
    const len = fishingLine.getTotalLength();
    if (!len || isNaN(len)) return; // guard: no layout yet
    fishingLine.style.setProperty('--line-length', len + 'px');
    fishingLine.setAttribute('stroke-dasharray', len + ' ' + len);
  }

  // Schedule _initLine() once layout is available so --line-length is set at
  // idle (getTotalLength requires the element to be in the rendered DOM).
  // requestAnimationFrame fires after the first paint; setTimeout 0 is the fallback.
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => _initLine());
  } else {
    setTimeout(() => _initLine(), 0);
  }

  /**
   * _updateLinePath(lureVbX, lureVbY) — recompute the fishing line path `d`
   * so the line runs from the fixed rod-tip anchor (220,300) to the live lure
   * position expressed in the 0–1000 viewBox coordinate space, then re-runs
   * _initLine() so stroke-dasharray / --line-length stay valid after each change.
   *
   * lureVbX / lureVbY are in the 0–1000 viewBox space (not CSS pixels).
   * The control point is placed roughly mid-arc: cx = (220+lureVbX)/2 + 80, cy = midY.
   */
  function _updateLinePath(lureVbX, lureVbY) {
    const cx = Math.round((220 + lureVbX) / 2 + 80);
    const cy = Math.round((300 + lureVbY) / 2 + 60);
    fishingLine.setAttribute('d', `M220 300 Q${cx} ${cy} ${lureVbX} ${lureVbY}`);
    _initLine();
  }

  /**
   * Add the fx-splash class to the FX layer and schedule its removal so the
   * animation can replay on the next cast.  --splash-dur ≈ 600ms.
   * Removal handle is pushed to _timers so _clearTimers() cancels it.
   */
  function _triggerSplash() {
    fxLayer.classList.add('fx-splash');
    // 600ms matches --splash-dur; hardcoded here because getPropertyValue on
    // a <ms> token requires extra parsing and the value is spec-fixed at 600ms.
    _addTimer(() => fxLayer.classList.remove('fx-splash'), 600);
  }

  /**
   * _updateDescent(remaining) — shared by cast:progress and tick handlers.
   * Computes how far the lure has sunk and applies it as `top` on .lure-bob.
   *
   * Positioning approach: we set `top` (not `transform`) on .lure-bob.
   * Rationale: the CSS `lure-bob` @keyframe owns `transform` (translateY + scaleX
   * for the bob animation in descending/bite states).  Setting `transform` from JS
   * would fight that animation.  The CSS already declares `transition: top 300ms ease`
   * on .lure-bob, so smooth descent is handled by the browser.
   * `top` is relative to .stage-underwater (the lure's offsetParent), which starts
   * at 45% of the stage.  We express depth as a percentage of underwater height.
   *
   * Beast M1 guard: returns immediately when _castTime <= 0.
   * Beast M2: caller must pass the right remaining value per event type.
   */
  function _updateDescent(remaining) {
    if (_castTime <= 0) return; // M1: never saw cast:start

    const pct = Math.max(0, Math.min(1, (_castTime - remaining) / _castTime));

    // Enter descending if still in casting (progress may arrive before the timer fires)
    const currentState = _stage.dataset.sceneState;
    if (currentState === 'casting' || currentState === 'idle') {
      _setState('descending');
    }

    // Bite threshold: switch to bite state once at ≥82% (idempotent)
    if (pct >= 0.82 && _stage.dataset.sceneState === 'descending') {
      if (!_reduced()) {
        _setState('bite');
      }
    }

    if (_reduced()) return; // skip JS-driven descent animation under reduced motion

    // Read --realm-depth (unitless 0..1) from the stage element at event time
    // so realm:change is picked up live without re-subscribing.
    const rawDepth = parseFloat(
      getComputedStyle(_stage).getPropertyValue('--realm-depth')
    );
    const depthFraction = isNaN(rawDepth) ? 0.5 : rawDepth;

    // .stage-underwater occupies the bottom portion of the stage.
    // We express target as a percentage of underwater's own height so the lure
    // sinks from near the top (waterline) toward depthFraction of the section.
    // pct 0 → top:0% (just entered water); pct 1 → top:(depthFraction*100)%.
    const targetTopPct = depthFraction * pct * 100;
    lureBob.style.top = targetTopPct + '%';

    // Sync the line endpoint with the lure position.
    // .stage-underwater starts at 45% of the stage; convert lure's CSS position
    // (top% of underwater section) into the 0–1000 viewBox coordinate space.
    // Stage: 0–1000 vb units. Underwater starts at vb-y 450 (45% of 1000).
    // Underwater height = 550 vb units (from 450 to 1000).
    // Lure vbX stays at 520 (matches horizontal CSS left:52%).
    const lureVbY = Math.round(450 + (targetTopPct / 100) * 550);
    _updateLinePath(520, lureVbY);
  }

  // ── Bus: cast:start ───────────────────────────────────────────────────────
  Bus.on('cast:start', ({ castTime }) => {
    _castTime = castTime; // M2: field is `castTime`
    _clearTimers();

    // Reset line to idle path for this new cast
    fishingLine.setAttribute('d', 'M220 300 Q380 480 520 620');

    if (_reduced()) {
      // Reduced motion: skip animations, go straight to a static descended pose
      _setState('descending');
      _initLine(); // ensure line is drawn (CSS handles static stroke-dashoffset:0)
      return;
    }

    _setState('casting');
    _initLine(); // set --line-length + stroke-dasharray for line-arc keyframe

    // Trigger splash at cast impact (lure hits water during the swing)
    _triggerSplash();

    // After ~--cast-swing-dur (500ms, spec-fixed) transition to descending.
    // This is capped/independent of castTime — purely visual timing.
    _addTimer(() => _setState('descending'), 500);
  });

  // ── Bus: cast:progress ────────────────────────────────────────────────────
  // M2: fields are `remaining` and `active` (NOT castRemaining / castActive)
  Bus.on('cast:progress', ({ remaining, active }) => {
    if (!active) return; // cast ended; tick's castActive:false path handles cleanup
    _updateDescent(remaining); // M2: pass `remaining` from this event
  });

  // ── Bus: tick ─────────────────────────────────────────────────────────────
  // M2: fields are `castActive` and `castRemaining` (NOT active / remaining)
  Bus.on('tick', ({ castActive, castRemaining }) => {
    if (_castTime <= 0) return; // M1: guard — never saw cast:start
    if (castActive) {
      _updateDescent(castRemaining); // M2: pass `castRemaining` from this event
    } else {
      // Cast is no longer active; if we're stuck in descending/bite, return to idle
      const s = _stage.dataset.sceneState;
      if (s === 'descending' || s === 'bite') {
        _castTime = 0;
        lureBob.style.top = '';
        fishingLine.setAttribute('d', 'M220 300 Q380 480 520 620');
        _initLine();
        _setState('idle');
      }
    }
  });

  // ── Bus: catch:new ────────────────────────────────────────────────────────
  // T8: { C1 catch object } — run catching → reveal sequence
  Bus.on('catch:new', (catchObj) => {
    // Step 1: cancel any in-flight choreography (re-entrancy guard: rapid catches,
    // time_ocean rewind firing a second catch:new while a card is still showing).
    _clearTimers();

    // Step 2: clean up any leftover classes from a previous reveal so we start fresh.
    _stage.classList.remove(
      'rarity-fx', 'is-new',
      'rarity-fx--common', 'rarity-fx--uncommon', 'rarity-fx--rare',
      'rarity-fx--epic', 'rarity-fx--legendary', 'rarity-fx--mythic', 'rarity-fx--impossible'
    );
    fxLayer.classList.remove('fx-splash');

    // Step 3: populate fish-actor from species data.
    const fishActor = _stage.querySelector('.fish-actor');
    if (!fishActor) return; // guard: DOM not built

    // Remove any previously-added css-class artwork class (tracked via dataset).
    const prevClass = fishActor.dataset.artClass;
    if (prevClass) {
      fishActor.classList.remove(prevClass);
      delete fishActor.dataset.artClass;
    }

    const species = speciesById(catchObj.speciesId);
    if (!species) {
      fishActor.textContent = '🐟';
    } else if (species.artworkType === 'emoji') {
      fishActor.textContent = species.artworkRef || '🐟';
    } else if (species.artworkType === 'css-class') {
      fishActor.textContent = '';
      fishActor.classList.add(species.artworkRef);
      fishActor.dataset.artClass = species.artworkRef; // remember for cleanup
    } else {
      fishActor.textContent = '🐟';
    }
    // NOTE: no inline transform for scale — CSS handles per-tier scale via
    // .rarity-fx--{tier} .fish-actor rules; inline transform would fight fish-breach.

    // Helper: adds rarity-fx classes to .fishing-stage.
    const tier = catchObj.rarity || 'common';
    function _applyRarityFx() {
      _stage.classList.add('rarity-fx', 'rarity-fx--' + tier);
      if (catchObj.isNewDiscovery) _stage.classList.add('is-new');
    }

    // Helper: removes all rarity-fx / is-new classes.
    function _removeRarityFx() {
      _stage.classList.remove(
        'rarity-fx', 'is-new',
        'rarity-fx--common', 'rarity-fx--uncommon', 'rarity-fx--rare',
        'rarity-fx--epic', 'rarity-fx--legendary', 'rarity-fx--mythic', 'rarity-fx--impossible'
      );
    }

    // Read timing durations from CSS tokens (single-sourced); fall back to spec constants.
    function _readMs(prop, fallback) {
      const raw = getComputedStyle(_stage).getPropertyValue(prop).trim();
      if (!raw) return fallback;
      const n = parseFloat(raw);
      return isNaN(n) ? fallback : (raw.endsWith('s') && !raw.endsWith('ms') ? n * 1000 : n);
    }
    const REEL_DUR   = _readMs('--reel-in-dur',  350);
    const BREACH_DUR = _readMs('--breach-dur',    900);
    const SPLASH_DUR = _readMs('--splash-dur',    600);

    // ── Reduced-motion path: static reveal, no timer choreography ────────────
    if (_reduced()) {
      _setState('reveal');
      _applyRarityFx();
      // No multi-step timers under reduced motion; clean up rarity classes on
      // the next cast:start (which calls _clearTimers → state reset). One minimal
      // cleanup timer is OK per spec only if necessary — we omit it and let the
      // next cast:start / catch:new handle cleanup via the top-of-handler scrub.
      return;
    }

    // ── Normal motion path ────────────────────────────────────────────────────
    const currentState = _stage.dataset.sceneState;
    const isFromActivecast =
      !catchObj.fromNet &&
      (currentState === 'descending' || currentState === 'bite');

    if (isFromActivecast) {
      // Full sequence: hook-set tug (CSS), reel-in (CSS), then breach.
      _setState('catching'); // CSS: hook-set + reel-in animations on rod/reel; fish-actor visible.

      // Line shortens toward the water surface during reel-in (endpoint rises to ~35% depth).
      _updateLinePath(520, 800);

      // Splash fires immediately (fish breaks the surface while being reeled in).
      _triggerSplash();

      // After reel-in completes, transition to reveal (breach).
      _addTimer(() => {
        _setState('reveal');
        _applyRarityFx();
        _triggerSplash(); // breach splash

        // Line endpoint at fish position (near surface, ~45% vbY = waterline).
        _updateLinePath(500, 450);

        // After breach completes, hide fish and clean up.
        _addTimer(() => {
          fishActor.hidden = true;
          _removeRarityFx();
          // Remove css-class artwork if one was added.
          const artClass = fishActor.dataset.artClass;
          if (artClass) {
            fishActor.classList.remove(artClass);
            delete fishActor.dataset.artClass;
          }
          _castTime = 0;
          lureBob.style.top = '';
          // Reset line to idle path
          fishingLine.setAttribute('d', 'M220 300 Q380 480 520 620');
          _initLine();
          _setState('idle');
        }, BREACH_DUR);
      }, REEL_DUR);

    } else {
      // fromNet === true OR scene is not in an active cast (automation/idle/rewind):
      // skip reel-in, jump straight to a short breach/reveal.
      fishActor.hidden = false; // make visible before CSS can show it via state

      _setState('reveal');
      _applyRarityFx();
      _triggerSplash();

      // Line endpoint at fish/surface position for reveal
      _updateLinePath(500, 450);

      // Remove fx-splash after its duration (triggerSplash already schedules removal,
      // but the removal is also in _timers so _clearTimers() will clean it if needed).

      // After breach completes, clean up and return to idle.
      _addTimer(() => {
        fishActor.hidden = true;
        _removeRarityFx();
        const artClass = fishActor.dataset.artClass;
        if (artClass) {
          fishActor.classList.remove(artClass);
          delete fishActor.dataset.artClass;
        }
        // Reset line to idle path
        fishingLine.setAttribute('d', 'M220 300 Q380 480 520 620');
        _initLine();
        _setState('idle');
      }, BREACH_DUR);
    }
  });

  // ── Bus: realm:change ─────────────────────────────────────────────────────
  // T8/m4: { from, to } — CSS token transitions handle the 600ms crossfade automatically
  // via body.realm-* classes (owned by main.js/realmPanel). Our job: guard state.
  Bus.on('realm:change', ({ from, to }) => { // eslint-disable-line no-unused-vars
    // If a cast is active (casting/descending/bite), let it finish — do NOT force idle.
    const s = _stage ? _stage.dataset.sceneState : 'idle';
    if (s === 'casting' || s === 'descending' || s === 'bite') return;
    // Otherwise (idle/reveal/catching): ensure we're at idle so realm repaint is clean.
    _clearTimers();
    _setState('idle');
  });
}
