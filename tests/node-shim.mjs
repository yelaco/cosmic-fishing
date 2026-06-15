// Node verification shim — stubs browser globals so engine modules can be
// dynamically imported under `node` for export-existence checks.
// Usage: node --import ./tests/node-shim.mjs -e "import('./engine/save.js')..."

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
  clear: () => { store.clear(); },
};

const noop = () => {};
const makeEl = () => ({
  style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  setAttribute: noop, getAttribute: () => null, appendChild: noop, removeChild: noop,
  addEventListener: noop, removeEventListener: noop, querySelector: () => null,
  querySelectorAll: () => [], innerHTML: '', textContent: '', dataset: {},
});
globalThis.document = {
  getElementById: () => makeEl(),
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => makeEl(),
  body: makeEl(),
  addEventListener: noop,
  documentElement: makeEl(),
};
globalThis.window = globalThis;
globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 16);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
