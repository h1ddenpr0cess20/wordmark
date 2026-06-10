import test from "node:test";
import assert from "node:assert/strict";

// memoryStorage.js + components/memory.js are ES modules. Set up the browser
// globals they touch before importing them.
function makeLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem(k: string) { return store.has(k) ? store.get(k) : null; },
    setItem(k: string, v: string) { store.set(k, String(v)); },
    removeItem(k: string) { store.delete(k); },
    clear() { store.clear(); },
  } as unknown as Storage;
}

globalThis.localStorage = makeLocalStorage();
globalThis.confirm = () => true;
globalThis.window = {
  addEventListener() {},
  dispatchEvent() { return true; },
} as unknown as Window & typeof globalThis;

type FakeEl = {
  listeners: Record<string, Array<(e: unknown) => void>>;
  addEventListener(type: string, cb: (e: unknown) => void): void;
  dispatch(type: string): void;
  setAttribute(): void;
  appendChild(): void;
  innerHTML: string;
  [key: string]: unknown;
};

function makeElement(initial: Record<string, unknown> = {}): FakeEl {
  return {
    ...initial,
    listeners: {},
    addEventListener(type: string, cb: (e: unknown) => void) {
      this.listeners[type] = this.listeners[type] || [];
      this.listeners[type].push(cb);
    },
    dispatch(type: string) {
      (this.listeners[type] || []).forEach(fn => fn({ target: this }));
    },
    setAttribute() {},
    appendChild() {},
    innerHTML: "",
  };
}

function installDom(elems: Record<string, FakeEl>) {
  globalThis.document = {
    getElementById: (id: string) => elems[id] || null,
    createElement: () => makeElement(),
  } as unknown as Document;
}

const storage = await import("../src/ts/utils/memoryStorage.ts");
const { initMemorySettings } = await import("../src/ts/components/memory.ts");

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
