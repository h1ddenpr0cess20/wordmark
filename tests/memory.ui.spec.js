import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadWindowScript } from './helpers/loadWindowScript.js';

// Create simple DOM element stubs
function makeElement(initial = {}) {
  const el = {
    ...initial,
    listeners: {},
    addEventListener(type, cb) {
      this.listeners[type] = this.listeners[type] || [];
      this.listeners[type].push(cb);
    },
    dispatch(type) {
      (this.listeners[type] || []).forEach(fn => fn({ target: this }));
    },
    setAttribute() {},
    appendChild() {},
    innerHTML: '',
  };
  return el;
}

// Prepare required globals and stubs
const elems = {
  toggle: makeElement({ id: 'memory-toggle', checked: false }),
  limit: makeElement({ id: 'memory-limit', value: '25' }),
  clear: makeElement({ id: 'clear-memories' }),
  list: makeElement({ id: 'memory-list' }),
};

const documentStub = {
  getElementById(id) {
    if (id === 'memory-toggle') return elems.toggle;
    if (id === 'memory-limit') return elems.limit;
    if (id === 'clear-memories') return elems.clear;
    if (id === 'memory-list') return elems.list;
    return null;
  },
  createElement() { return makeElement(); },
};

// Load memory storage first for functions used by UI
const storagePath = path.resolve('src/js/utils/memoryStorage.js');
const windowWithStorage = loadWindowScript(storagePath, {
  globals: {
    localStorage: {
      _s: new Map(),
      getItem(k) { return this._s.has(k) ? this._s.get(k) : null; },
      setItem(k, v) { this._s.set(k, String(v)); },
      removeItem(k) { this._s.delete(k); },
      clear() { this._s.clear(); },
    },
  },
});

// Now load the memory UI logic
const uiPath = path.resolve('src/js/components/memory.js');
const windowObj = loadWindowScript(uiPath, {
  document: documentStub,
  window: windowWithStorage, // share same window object
  globals: {
    confirm: () => true,
  },
});

test('initMemorySettings attaches listeners and toggling updates enabled', () => {
  // Sanity: initially disabled
  let cfg = windowObj.getMemoryConfig();
  assert.equal(cfg.enabled, false);

  // Initialize
  windowObj.initMemorySettings();

  // Toggle on via event
  elems.toggle.checked = true;
  elems.toggle.dispatch('change');
  cfg = windowObj.getMemoryConfig();
  assert.equal(cfg.enabled, true);

  // Change limit via event
  elems.limit.value = '5';
  elems.limit.dispatch('change');
  cfg = windowObj.getMemoryConfig();
  assert.equal(cfg.limit, 5);
});

test('manual add memory respects 600-char limit', () => {
  const elemsManual = {
    toggle: makeElement({ id: 'memory-toggle', checked: true }),
    limit: makeElement({ id: 'memory-limit', value: '25' }),
    clear: makeElement({ id: 'clear-memories' }),
    list: makeElement({ id: 'memory-list' }),
    addInput: makeElement({ id: 'memory-add-input' }),
    addBtn: makeElement({ id: 'memory-add-button' }),
  };

  const docStub = {
    getElementById(id) {
      if (id === 'memory-toggle') return elemsManual.toggle;
      if (id === 'memory-limit') return elemsManual.limit;
      if (id === 'clear-memories') return elemsManual.clear;
      if (id === 'memory-list') return elemsManual.list;
      if (id === 'memory-add-input') return elemsManual.addInput;
      if (id === 'memory-add-button') return elemsManual.addBtn;
      return null;
    },
    createElement() { return makeElement(); },
  };

  const storagePath = path.resolve('src/js/utils/memoryStorage.js');
  const winStorage = loadWindowScript(storagePath, {
    globals: {
      localStorage: {
        _s: new Map(),
        getItem(k) { return this._s.has(k) ? this._s.get(k) : null; },
        setItem(k, v) { this._s.set(k, String(v)); },
        removeItem(k) { this._s.delete(k); },
        clear() { this._s.clear(); },
      },
    },
  });

  const uiPath = path.resolve('src/js/components/memory.js');
  const winObj = loadWindowScript(uiPath, {
    document: docStub,
    window: winStorage,
  });

  winObj.setMemoryEnabled(true);
  winObj.clearAllMemories();
  winObj.initMemorySettings();

  elemsManual.addInput.value = 'x'.repeat(650);
  elemsManual.addBtn.dispatch('click');
  const mems = winObj.getMemories();
  assert.equal(mems.length, 1);
  assert.equal(mems[0].length, 600);
});
