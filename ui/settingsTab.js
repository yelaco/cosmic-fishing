// ui/settingsTab.js — Settings Tab (T29, FR-150, FR-122/123)
// C0: no top-level browser globals. All DOM access inside initSettingsTab().

import { GameState, Bus } from '../engine/state.js';
import { save, exportSave, importSave, resetSave } from '../engine/save.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function showToast(container, msg, isError = false) {
  let toast = container.querySelector('.settings-toast');
  if (!toast) {
    toast = document.createElement('p');
    toast.className = 'settings-toast';
    container.prepend(toast);
  }
  toast.textContent = msg;
  toast.className = 'settings-toast' + (isError ? ' settings-toast--error' : ' settings-toast--ok');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.textContent = '';
    toast.className = 'settings-toast';
  }, 3000);
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

function buildSaveSection(container) {
  const section = document.createElement('section');
  section.className = 'settings-section';
  section.innerHTML = `
    <h3 class="settings-section-title">Save</h3>
    <button class="settings-btn" id="settings-manual-save">Manual Save</button>
  `;

  section.querySelector('#settings-manual-save').addEventListener('click', () => {
    save();
    // Feedback arrives via Bus save:complete subscription below.
  });

  return section;
}

function buildExportImportSection() {
  const section = document.createElement('section');
  section.className = 'settings-section';
  section.innerHTML = `
    <h3 class="settings-section-title">Export / Import Save</h3>
    <p class="settings-hint">Export encodes your save as base64. Paste it back to import.</p>
    <div class="settings-row">
      <button class="settings-btn" id="settings-export-btn">Export Save</button>
      <button class="settings-btn" id="settings-import-btn">Import Save</button>
    </div>
    <textarea
      id="settings-save-data"
      class="settings-textarea"
      rows="4"
      placeholder="Export output will appear here. Paste save data here to import."
      spellcheck="false"
    ></textarea>
    <p id="settings-import-feedback" class="settings-feedback" aria-live="polite"></p>
  `;
  return section;
}

function buildResetSection() {
  const section = document.createElement('section');
  section.className = 'settings-section settings-section--danger';
  section.innerHTML = `
    <h3 class="settings-section-title">Reset Game</h3>
    <p class="settings-hint">This permanently deletes all progress. Type <strong>RESET</strong> to confirm.</p>
    <div class="settings-row">
      <input
        type="text"
        id="settings-reset-confirm"
        class="settings-input"
        placeholder="Type RESET"
        autocomplete="off"
      />
      <button class="settings-btn settings-btn--danger" id="settings-reset-btn" disabled>Reset Game</button>
    </div>
  `;
  return section;
}

function buildDisplaySection() {
  const section = document.createElement('section');
  section.className = 'settings-section';
  section.innerHTML = `
    <h3 class="settings-section-title">Display</h3>

    <label class="settings-toggle-row" title="Choose how large numbers are displayed">
      <span class="settings-label">Number Format</span>
      <select id="settings-number-format" class="settings-select">
        <option value="standard">Standard (1.23 Million)</option>
        <option value="scientific">Scientific (1.23e6)</option>
      </select>
    </label>

    <label class="settings-toggle-row" title="Disable CSS animations for accessibility / performance">
      <span class="settings-label">Reduce Animations</span>
      <input type="checkbox" id="settings-reduce-animations" class="settings-checkbox" />
    </label>

    <label class="settings-toggle-row" title="Show countdown timer above the cast button">
      <span class="settings-label">Show Cast Timer</span>
      <input type="checkbox" id="settings-show-cast-timer" class="settings-checkbox" />
    </label>
  `;
  return section;
}

// ---------------------------------------------------------------------------
// Public init
// ---------------------------------------------------------------------------

export function initSettingsTab() {
  const container = document.getElementById('tab-settings');
  if (!container) return;

  container.innerHTML = '';

  // Toast element (prepended by showToast on demand)
  const saveSection = buildSaveSection(container);
  const exportImportSection = buildExportImportSection();
  const resetSection = buildResetSection();
  const displaySection = buildDisplaySection();

  container.appendChild(saveSection);
  container.appendChild(exportImportSection);
  container.appendChild(resetSection);
  container.appendChild(displaySection);

  // --- Wire up Export ---
  const textarea = container.querySelector('#settings-save-data');
  const importFeedback = container.querySelector('#settings-import-feedback');

  container.querySelector('#settings-export-btn').addEventListener('click', () => {
    textarea.value = exportSave();
    textarea.select();
    importFeedback.textContent = '';
  });

  // --- Wire up Import ---
  container.querySelector('#settings-import-btn').addEventListener('click', () => {
    const str = textarea.value.trim();
    if (!str) {
      importFeedback.textContent = 'Paste a save string into the text area first.';
      importFeedback.className = 'settings-feedback settings-feedback--error';
      return;
    }
    const result = importSave(str);
    if (result.ok) {
      importFeedback.textContent = 'Save imported successfully. Reload the page to apply.';
      importFeedback.className = 'settings-feedback settings-feedback--ok';
      save();
    } else {
      importFeedback.textContent = `Import failed: ${result.reason}`;
      importFeedback.className = 'settings-feedback settings-feedback--error';
    }
  });

  // --- Wire up Reset ---
  const resetInput = container.querySelector('#settings-reset-confirm');
  const resetBtn = container.querySelector('#settings-reset-btn');

  resetInput.addEventListener('input', () => {
    resetBtn.disabled = resetInput.value !== 'RESET';
  });

  resetBtn.addEventListener('click', () => {
    if (resetInput.value !== 'RESET') return;
    resetSave();
    resetInput.value = '';
    resetBtn.disabled = true;
    showToast(container, 'Game reset. Reload the page to start fresh.');
  });

  // --- Wire up Number Format ---
  const numberFormatSelect = container.querySelector('#settings-number-format');
  numberFormatSelect.value = GameState.settings.numberFormat ?? 'standard';

  numberFormatSelect.addEventListener('change', () => {
    GameState.settings.numberFormat = numberFormatSelect.value;
    save();
  });

  // --- Wire up Reduce Animations ---
  const reduceAnimationsCheck = container.querySelector('#settings-reduce-animations');
  reduceAnimationsCheck.checked = GameState.settings.reduceAnimations ?? false;
  // Sync body class to persisted setting on mount.
  document.body.classList.toggle('reduce-animations', reduceAnimationsCheck.checked);

  reduceAnimationsCheck.addEventListener('change', () => {
    GameState.settings.reduceAnimations = reduceAnimationsCheck.checked;
    document.body.classList.toggle('reduce-animations', reduceAnimationsCheck.checked);
    save();
  });

  // --- Wire up Show Cast Timer ---
  const castTimerCheck = container.querySelector('#settings-show-cast-timer');
  castTimerCheck.checked = GameState.settings.showCastTimer ?? true;

  castTimerCheck.addEventListener('change', () => {
    GameState.settings.showCastTimer = castTimerCheck.checked;
    save();
  });

  // --- Bus: save:complete → brief confirmation toast ---
  Bus.on('save:complete', () => {
    showToast(container, 'Game saved.');
  });
}
