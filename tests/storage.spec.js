import test from "node:test";
import assert from "node:assert/strict";

// In-memory localStorage stub installed before importing the module under test.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
};

const {
  STORAGE_KEYS,
  apiKeyStorageKey,
  toolApiKeyStorageKey,
  readJSON,
  writeJSON,
  readString,
  writeString,
  removeKey,
} = await import("../src/ts/utils/storage.ts");

test("dynamic key builders preserve the existing key format", () => {
  assert.equal(apiKeyStorageKey("openai"), "wordmark_api_key_openai");
  assert.equal(apiKeyStorageKey("xai"), "wordmark_api_key_xai");
  assert.equal(toolApiKeyStorageKey("openai"), "wordmark_tool_api_key_openai");
});

test("registry values match the historically persisted key strings", () => {
  // These must not drift — they are what existing installs already wrote.
  assert.equal(STORAGE_KEYS.mcpServers, "mcp_servers");
  assert.equal(STORAGE_KEYS.toolPreferences, "wordmark_tool_preferences");
  assert.equal(STORAGE_KEYS.vectorStores, "wordmark_vector_stores");
  assert.equal(STORAGE_KEYS.activeVectorStore, "active_vector_store");
  assert.equal(STORAGE_KEYS.memories, "memories");
  assert.equal(STORAGE_KEYS.selectedTheme, "selectedTheme");
});

test("writeJSON then readJSON round-trips a value", () => {
  store.clear();
  writeJSON("k", { a: 1, b: [2, 3] });
  assert.equal(store.get("k"), '{"a":1,"b":[2,3]}');
  assert.deepEqual(readJSON("k", null), { a: 1, b: [2, 3] });
});

test("readJSON returns the fallback for a missing key", () => {
  store.clear();
  assert.deepEqual(readJSON("absent", []), []);
  assert.deepEqual(readJSON("absent", { x: 1 }), { x: 1 });
});

test("readJSON returns the fallback (never throws) on corrupt JSON", () => {
  store.clear();
  store.set("bad", "{not valid json");
  assert.deepEqual(readJSON("bad", {}), {});
});

test("writeJSON propagates storage errors to the caller", () => {
  const original = globalThis.localStorage.setItem;
  globalThis.localStorage.setItem = () => { throw new Error("quota"); };
  try {
    assert.throws(() => writeJSON("k", { a: 1 }), /quota/);
  } finally {
    globalThis.localStorage.setItem = original;
  }
});

test("readString / writeString / removeKey operate on raw strings", () => {
  store.clear();
  assert.equal(readString("s"), null);
  writeString("s", "hello");
  assert.equal(readString("s"), "hello");
  removeKey("s");
  assert.equal(readString("s"), null);
});
