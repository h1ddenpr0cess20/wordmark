import test from "node:test";
import assert from "node:assert/strict";

const store: Record<string, string> = {};
globalThis.localStorage = {
  getItem(key: string) { return key in store ? store[key] : null; },
  setItem(key: string, value: string) { store[key] = String(value); },
  removeItem(key: string) { delete store[key]; },
} as unknown as Storage;

const { state } = await import("../src/ts/init/state.js");
const {
  MAX_ACTIVE_VECTOR_STORES,
  saveVectorStoreMetadata,
  getVectorStoreMetadata,
  removeVectorStoreMetadata,
  getActiveVectorStoreId,
  setActiveVectorStoreId,
  clearActiveVectorStore,
  getActiveVectorStoreIds,
} = await import("../src/ts/services/vectorStoreMetadata.js");

const META_KEY = "wordmark_vector_stores";

function reset() {
  for (const k of Object.keys(store)) delete store[k];
  (state as { activeVectorStore: string | null }).activeVectorStore = null;
}

function seed(meta: Record<string, { lastUsed: number }>) {
  store[META_KEY] = JSON.stringify(meta);
}

test("MAX_ACTIVE_VECTOR_STORES is 2", () => {
  assert.equal(MAX_ACTIVE_VECTOR_STORES, 2);
});

test("getVectorStoreMetadata returns {} when empty or unparseable", () => {
  reset();
  assert.deepEqual(getVectorStoreMetadata(), {});
  store[META_KEY] = "{not json";
  assert.deepEqual(getVectorStoreMetadata(), {});
});

test("saveVectorStoreMetadata round-trips fields and stamps lastUsed", () => {
  reset();
  saveVectorStoreMetadata("vs_1", { name: "Docs", fileCount: 3 });
  const meta = getVectorStoreMetadata();
  assert.equal(meta.vs_1.name, "Docs");
  assert.equal(meta.vs_1.fileCount, 3);
  assert.equal(typeof meta.vs_1.lastUsed, "number");
});

test("removeVectorStoreMetadata deletes one entry and no-ops when nothing stored", () => {
  reset();
  seed({ vs_1: { lastUsed: 1 }, vs_2: { lastUsed: 2 } });
  removeVectorStoreMetadata("vs_1");
  assert.deepEqual(Object.keys(getVectorStoreMetadata()), ["vs_2"]);
  reset();
  assert.doesNotThrow(() => removeVectorStoreMetadata("vs_x"));
});

test("set/get/clear active vector store id persists to state and localStorage", () => {
  reset();
  setActiveVectorStoreId("vs_active");
  assert.equal(getActiveVectorStoreId(), "vs_active");
  assert.equal(store.active_vector_store, "vs_active");
  clearActiveVectorStore();
  assert.equal(getActiveVectorStoreId(), null);
  assert.equal("active_vector_store" in store, false);
});

test("getActiveVectorStoreId falls back to localStorage when state is empty", () => {
  reset();
  store.active_vector_store = "vs_persisted";
  assert.equal(getActiveVectorStoreId(), "vs_persisted");
});

test("getActiveVectorStoreIds lists the active store first, then by recency, capped", () => {
  reset();
  seed({ a: { lastUsed: 100 }, b: { lastUsed: 300 }, c: { lastUsed: 200 } });
  setActiveVectorStoreId("a");
  assert.deepEqual(getActiveVectorStoreIds(), ["a", "b"]);
});

test("getActiveVectorStoreIds without an active store returns the two most recent", () => {
  reset();
  seed({ a: { lastUsed: 100 }, b: { lastUsed: 300 }, c: { lastUsed: 200 } });
  assert.deepEqual(getActiveVectorStoreIds(), ["b", "c"]);
});

test("saveVectorStoreMetadata evicts the least-recently-used beyond the cap", () => {
  reset();
  seed({ old: { lastUsed: 100 }, mid: { lastUsed: 200 } });
  saveVectorStoreMetadata("fresh", {});
  const keys = Object.keys(getVectorStoreMetadata()).sort();
  assert.deepEqual(keys, ["fresh", "mid"]);
});

test("saveVectorStoreMetadata keeps the active store even if it is least-recently-used", () => {
  reset();
  seed({ oldActive: { lastUsed: 100 }, mid: { lastUsed: 200 } });
  setActiveVectorStoreId("oldActive");
  saveVectorStoreMetadata("fresh", {});
  const keys = Object.keys(getVectorStoreMetadata()).sort();
  assert.deepEqual(keys, ["fresh", "oldActive"]);
});
