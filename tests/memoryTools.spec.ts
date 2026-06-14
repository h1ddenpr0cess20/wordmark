import test from "node:test";
import assert from "node:assert/strict";

// The remember/forget tools persist via memoryStorage (localStorage) and that
// module emits CustomEvents on window; stub both so the handlers run headless.
const store: Record<string, string> = {};
globalThis.localStorage = {
  getItem(key: string) { return key in store ? store[key] : null; },
  setItem(key: string, value: string) { store[key] = String(value); },
  removeItem(key: string) { delete store[key]; },
} as unknown as Storage;
globalThis.CustomEvent = class { constructor(public type: string, public init?: unknown) {} } as never;
globalThis.window = { dispatchEvent() { return true; } } as unknown as Window & typeof globalThis;

const memStore = await import("../src/ts/utils/memoryStorage.js");
await import("../src/ts/services/memory.js"); // registers the handlers
const { toolImplementations } = await import("../src/ts/services/toolImplementations.js");

const remember = (args: unknown) => toolImplementations.remember(args);
const forget = (args: unknown) => toolImplementations.forget(args);

function reset(enabled: boolean) {
  for (const k of Object.keys(store)) delete store[k];
  memStore.getMemoryConfig(); // seed defaults
  memStore.setMemoryEnabled(enabled);
}

test("remember refuses when the memory feature is disabled", async () => {
  reset(false);
  assert.deepEqual(await remember({ memory: "x" }), { ok: false, message: "Memory feature disabled" });
});

test("remember stores a memory and reports the running total", async () => {
  reset(true);
  const res = await remember({ memory: "likes tea" });
  assert.equal(res.ok, true);
  assert.equal(res.stored, "likes tea");
  assert.equal(res.total, 1);
  assert.deepEqual(memStore.getMemories(), ["likes tea"]);
});

test("remember rejects non-string/blank memory content", async () => {
  reset(true);
  const res = await remember({ memory: 123 });
  assert.equal(res.ok, false);
  assert.equal(res.stored, undefined);
});

test("forget refuses when disabled or given no keyword", async () => {
  reset(false);
  assert.deepEqual(await forget({ keyword: "tea" }), { ok: false, message: "Memory feature disabled" });
  reset(true);
  assert.deepEqual(await forget({ keyword: "  " }), { ok: false, message: "Missing keyword" });
});

test("forget reports when nothing matches", async () => {
  reset(true);
  await remember({ memory: "likes coffee" });
  const res = await forget({ keyword: "tea" });
  assert.equal(res.ok, false);
  assert.equal(res.message, "No matching memory found");
  assert.deepEqual(res.matches, []);
});

test("forget removes the first case-insensitive substring match", async () => {
  reset(true);
  await remember({ memory: "likes Tea" });
  await remember({ memory: "owns a dog" });
  const res = await forget({ keyword: "TEA" });
  assert.equal(res.ok, true);
  assert.equal(res.removed, "likes Tea");
  assert.equal(res.removed_index, 0);
  assert.equal(res.remaining, 1);
  assert.deepEqual(memStore.getMemories(), ["owns a dog"]);
});
