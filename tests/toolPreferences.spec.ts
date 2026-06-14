import test from "node:test";
import assert from "node:assert/strict";

// preferences.ts persists through the storage helpers (localStorage) and reads
// the live TOOL_CATALOG, so stub localStorage and register known test tools.
const store: Record<string, string> = {};
globalThis.window = globalThis.window || ({} as Window & typeof globalThis);
globalThis.localStorage = {
  getItem(key: string) { return key in store ? store[key] : null; },
  setItem(key: string, value: string) { store[key] = value; },
  removeItem(key: string) { delete store[key]; },
} as unknown as Storage;

const { addStaticTool } = await import("../src/ts/services/api/tools/catalog.js");
const {
  getToolPreference,
  isToolEnabled,
  setToolEnabled,
  setAllToolsEnabled,
  removeToolPreference,
} = await import("../src/ts/services/api/tools/preferences.js");

const onByDefault = "test:on";
const offByDefault = "test:off";

addStaticTool({
  key: onByDefault,
  type: "function",
  displayName: "On By Default",
  defaultEnabled: true,
  definition: { type: "function", name: "on_by_default" },
} as never);
addStaticTool({
  key: offByDefault,
  type: "function",
  displayName: "Off By Default",
  defaultEnabled: false,
  definition: { type: "function", name: "off_by_default" },
} as never);

test("getToolPreference returns the supplied default when nothing is stored", () => {
  assert.equal(getToolPreference("unstored", true), true);
  assert.equal(getToolPreference("unstored", false), false);
});

test("isToolEnabled is false for unknown keys and honors defaultEnabled", () => {
  assert.equal(isToolEnabled("not-in-catalog"), false);
  assert.equal(isToolEnabled(onByDefault), true);
  assert.equal(isToolEnabled(offByDefault), false);
});

test("setToolEnabled persists an explicit preference over the default", () => {
  setToolEnabled(onByDefault, false);
  assert.equal(isToolEnabled(onByDefault), false);
  assert.equal(getToolPreference(onByDefault, true), false);

  setToolEnabled(offByDefault, true);
  assert.equal(isToolEnabled(offByDefault), true);
});

test("setToolEnabled is a no-op for keys not in the catalog", () => {
  setToolEnabled("not-in-catalog", true);
  assert.equal(isToolEnabled("not-in-catalog"), false);
  // no explicit preference was recorded, so the default still governs
  assert.equal(getToolPreference("not-in-catalog", false), false);
});

test("removeToolPreference reverts a tool to its default", () => {
  setToolEnabled(onByDefault, false);
  assert.equal(isToolEnabled(onByDefault), false);
  removeToolPreference(onByDefault);
  assert.equal(isToolEnabled(onByDefault), true);
});

test("setAllToolsEnabled applies one state to every catalog tool", () => {
  setAllToolsEnabled(false);
  assert.equal(isToolEnabled(onByDefault), false);
  assert.equal(isToolEnabled(offByDefault), false);

  setAllToolsEnabled(true);
  assert.equal(isToolEnabled(onByDefault), true);
  assert.equal(isToolEnabled(offByDefault), true);
});
