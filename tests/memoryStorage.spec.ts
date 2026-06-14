import test from "node:test";
import assert from "node:assert/strict";

// memoryStorage persists via localStorage and emits CustomEvents on window;
// stub both so the module runs headless and quietly.
const store: Record<string, string> = {};
globalThis.localStorage = {
  getItem(key: string) { return key in store ? store[key] : null; },
  setItem(key: string, value: string) { store[key] = String(value); },
  removeItem(key: string) { delete store[key]; },
} as unknown as Storage;
globalThis.CustomEvent = class { constructor(public type: string, public init?: unknown) {} } as never;
globalThis.window = { dispatchEvent() { return true; } } as unknown as Window & typeof globalThis;

const mem = await import("../src/ts/utils/memoryStorage.js");

function reset() {
  for (const k of Object.keys(store)) delete store[k];
}

test("getMemoryConfig seeds defaults (disabled, limit 25)", () => {
  reset();
  const cfg = mem.getMemoryConfig();
  assert.deepEqual(cfg, { enabled: false, limit: 25 });
});

test("addMemory rejects non-strings and blank input", () => {
  reset();
  assert.deepEqual(mem.addMemory(123 as never), { ok: false, reason: "invalid" });
  assert.deepEqual(mem.addMemory("   "), { ok: false, reason: "empty" });
  assert.deepEqual(mem.getMemories(), []);
});

test("addMemory stores trimmed text and caps length at 600 chars", () => {
  reset();
  const res = mem.addMemory("  likes tea  ");
  assert.deepEqual(res, { ok: true, count: 1 });
  assert.deepEqual(mem.getMemories(), ["likes tea"]);

  mem.addMemory("x".repeat(1000));
  const stored = mem.getMemories();
  assert.equal(stored[1].length, 600);
});

test("addMemory evicts oldest entries beyond the configured limit", () => {
  reset();
  mem.setMemoryLimit(3);
  ["a", "b", "c", "d", "e"].forEach(v => mem.addMemory(v));
  assert.deepEqual(mem.getMemories(), ["c", "d", "e"]);
});

test("setMemoryLimit floors negatives at 1 and trims existing memories", () => {
  reset();
  ["a", "b", "c", "d"].forEach(v => mem.addMemory(v));
  mem.setMemoryLimit(-5); // negative is floored to 1
  assert.equal(mem.getMemoryConfig().limit, 1);
  assert.deepEqual(mem.getMemories(), ["d"]);
});

test("setMemoryLimit treats 0 as 'use default' (25), not a real cap", () => {
  // parseInt("0") || 25 -> 25, since 0 is falsy; documents the existing quirk.
  reset();
  ["a", "b", "c"].forEach(v => mem.addMemory(v));
  mem.setMemoryLimit(0);
  assert.equal(mem.getMemoryConfig().limit, 25);
  assert.deepEqual(mem.getMemories(), ["a", "b", "c"]);
});

test("removeMemoryAt validates the index", () => {
  reset();
  ["a", "b", "c"].forEach(v => mem.addMemory(v));
  assert.deepEqual(mem.removeMemoryAt(5), { ok: false, reason: "range" });
  assert.deepEqual(mem.removeMemoryAt(-1), { ok: false, reason: "range" });
  assert.deepEqual(mem.removeMemoryAt(1), { ok: true, count: 2 });
  assert.deepEqual(mem.getMemories(), ["a", "c"]);
});

test("clearAllMemories empties storage", () => {
  reset();
  mem.addMemory("a");
  assert.deepEqual(mem.clearAllMemories(), { ok: true });
  assert.deepEqual(mem.getMemories(), []);
});

test("getMemories drops falsy entries and survives malformed JSON", () => {
  reset();
  mem.getMemoryConfig(); // seed defaults
  localStorage.setItem("memories", JSON.stringify(["a", "", null, "b"]));
  assert.deepEqual(mem.getMemories(), ["a", "b"]);
  localStorage.setItem("memories", "{not json");
  assert.deepEqual(mem.getMemories(), []);
});

test("getMemoriesForPrompt is empty unless enabled with content", () => {
  reset();
  mem.addMemory("likes tea");
  assert.equal(mem.getMemoriesForPrompt(), ""); // disabled by default

  mem.setMemoryEnabled(true);
  const block = mem.getMemoriesForPrompt();
  assert.match(block, /Details remembered about the user/);
  assert.match(block, /- likes tea/);

  mem.clearAllMemories();
  assert.equal(mem.getMemoriesForPrompt(), ""); // enabled but empty
});
