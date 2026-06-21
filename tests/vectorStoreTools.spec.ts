import test, { mock } from "node:test";
import assert from "node:assert/strict";

/**
 * Unit tests for applyVectorStoreIds. The module reads the active store ids from
 * services/vectorStore.ts, which is replaced with a controllable fake via
 * `mock.module` (requires `--experimental-test-module-mocks`, wired in npm test).
 */

let activeIdsResult: () => string[] = () => [];

mock.module(new URL("../src/ts/services/vectorStore.ts", import.meta.url).href, {
  namedExports: { getActiveVectorStoreIds: () => activeIdsResult() },
});

const { applyVectorStoreIds } = await import("../src/ts/services/api/vectorStoreTools.ts");

type ToolDefinition = Parameters<typeof applyVectorStoreIds>[0][number];
const tool = (over: Record<string, unknown>): ToolDefinition => over as unknown as ToolDefinition;

const fileSearch = () => tool({ type: "file_search" });
const webSearch = () => tool({ type: "web_search" });

test("returns enabledTools unchanged when it is absent", () => {
  activeIdsResult = () => [];
  assert.equal(applyVectorStoreIds(undefined as unknown as ToolDefinition[]), undefined);
});

test("stamps active ids onto file_search and leaves other tools alone", () => {
  activeIdsResult = () => ["vs_1", "vs_2"];
  const out = applyVectorStoreIds([fileSearch(), webSearch()]);
  assert.equal(out.length, 2);
  assert.deepEqual((out[0] as Record<string, unknown>).vector_store_ids, ["vs_1", "vs_2"]);
  assert.equal((out[1] as Record<string, unknown>).vector_store_ids, undefined);
});

test("merges the explicit id with the active set and de-duplicates", () => {
  activeIdsResult = () => ["vs_1"];
  const out = applyVectorStoreIds([fileSearch()], "vs_1");
  assert.deepEqual((out[0] as Record<string, unknown>).vector_store_ids, ["vs_1"]);

  activeIdsResult = () => ["vs_1"];
  const out2 = applyVectorStoreIds([fileSearch()], "vs_2");
  assert.deepEqual((out2[0] as Record<string, unknown>).vector_store_ids, ["vs_1", "vs_2"]);
});

test("uses the explicit id when there are no active stores", () => {
  activeIdsResult = () => [];
  const out = applyVectorStoreIds([fileSearch()], "vs_only");
  assert.deepEqual((out[0] as Record<string, unknown>).vector_store_ids, ["vs_only"]);
});

test("drops file_search when no stores are active", () => {
  activeIdsResult = () => [];
  const out = applyVectorStoreIds([fileSearch(), webSearch()]);
  assert.equal(out.length, 1);
  assert.equal(out[0].type, "web_search");
});

test("ignores falsy/blank active ids", () => {
  activeIdsResult = () => ["", "vs_real"] as string[];
  const out = applyVectorStoreIds([fileSearch()]);
  assert.deepEqual((out[0] as Record<string, unknown>).vector_store_ids, ["vs_real"]);
});

test("survives getActiveVectorStoreIds throwing, falling back to the explicit id", () => {
  activeIdsResult = () => { throw new Error("storage unavailable"); };
  const warn = mock.method(console, "warn", () => {});
  try {
    const out = applyVectorStoreIds([fileSearch()], "vs_explicit");
    assert.deepEqual((out[0] as Record<string, unknown>).vector_store_ids, ["vs_explicit"]);
    assert.equal(warn.mock.callCount(), 1);
  } finally {
    warn.mock.restore();
  }
});
