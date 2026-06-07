import test from "node:test";
import assert from "node:assert/strict";

// memoryStorage.js + components/memory.js are ES modules. Set up the browser
// globals they touch before importing them.
function makeLocalStorage() {
  const store = new Map();
  return {
    getItem(k) { return store.has(k) ? store.get(k) : null; },
    setItem(k, v) { store.set(k, String(v)); },
    removeItem(k) { store.delete(k); },
    clear() { store.clear(); },
  };
}

globalThis.localStorage = makeLocalStorage();
globalThis.confirm = () => true;
globalThis.window = {
  addEventListener() {},
  dispatchEvent() { return true; },
};

function makeElement(initial = {}) {
  return {
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
    innerHTML: "",
  };
}

function installDom(elems) {
  globalThis.document = {
    getElementById: (id) => elems[id] || null,
    createElement: () => makeElement(),
  };
}

const storage = await import("../src/js/utils/memoryStorage.js");
const { initMemorySettings } = await import("../src/js/components/memory.js");

test("initMemorySettings attaches listeners and toggling updates enabled", () => {
  storage.clearAllMemories();
  storage.setMemoryEnabled(false);
  const elems = {
    "memory-toggle": makeElement({ id: "memory-toggle", checked: false }),
    "memory-limit": makeElement({ id: "memory-limit", value: "25" }),
    "clear-memories": makeElement({ id: "clear-memories" }),
    "memory-list": makeElement({ id: "memory-list" }),
  };
  installDom(elems);

  assert.equal(storage.getMemoryConfig().enabled, false);

  initMemorySettings();

  elems["memory-toggle"].checked = true;
  elems["memory-toggle"].dispatch("change");
  assert.equal(storage.getMemoryConfig().enabled, true);

  elems["memory-limit"].value = "5";
  elems["memory-limit"].dispatch("change");
  assert.equal(storage.getMemoryConfig().limit, 5);
});

test("manual add memory respects 600-char limit", () => {
  const elems = {
    "memory-toggle": makeElement({ id: "memory-toggle", checked: true }),
    "memory-limit": makeElement({ id: "memory-limit", value: "25" }),
    "clear-memories": makeElement({ id: "clear-memories" }),
    "memory-list": makeElement({ id: "memory-list" }),
    "memory-add-input": makeElement({ id: "memory-add-input" }),
    "memory-add-button": makeElement({ id: "memory-add-button" }),
  };
  installDom(elems);

  storage.setMemoryEnabled(true);
  storage.clearAllMemories();
  initMemorySettings();

  elems["memory-add-input"].value = "x".repeat(650);
  elems["memory-add-button"].dispatch("click");
  const mems = storage.getMemories();
  assert.equal(mems.length, 1);
  assert.equal(mems[0].length, 600);
});
