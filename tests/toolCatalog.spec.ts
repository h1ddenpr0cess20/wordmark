import test from "node:test";
import assert from "node:assert/strict";

// catalog.js pulls in static tool/config modules; provide minimal browser
// stubs so the import is headless.
const store: Record<string, string> = {};
globalThis.window = globalThis.window || ({} as Window & typeof globalThis);
globalThis.localStorage = {
  getItem(key: string) { return key in store ? store[key] : null; },
  setItem(key: string, value: string) { store[key] = String(value); },
  removeItem(key: string) { delete store[key]; },
} as unknown as Storage;

const {
  buildMcpToolEntry,
  insertMcpTool,
  findTool,
  findToolIndex,
  getUserMcpToolCount,
} = await import("../src/ts/services/api/tools/catalog.js");

const cast = <T>(v: unknown): T => v as T;

test("buildMcpToolEntry returns null without a label or url", () => {
  assert.equal(buildMcpToolEntry(cast(null)), null);
  assert.equal(buildMcpToolEntry(cast({ server_label: "x" })), null);
  assert.equal(buildMcpToolEntry(cast({ server_url: "http://x" })), null);
});

test("buildMcpToolEntry fills defaults and key from the label", () => {
  const entry = buildMcpToolEntry(cast({ server_label: "lab", server_url: "http://host/mcp" }));
  assert.ok(entry);
  assert.equal(entry!.key, "mcp:lab");
  assert.equal(entry!.type, "mcp");
  assert.equal(entry!.displayName, "lab"); // falls back to the label
  assert.equal(entry!.description, "User-configured MCP server");
  assert.equal(entry!.defaultEnabled, true);
  assert.equal(entry!.definition.require_approval, "always");
  assert.equal(entry!.definition.server_url, "http://host/mcp");
});

test("buildMcpToolEntry passes through explicit display fields", () => {
  const entry = buildMcpToolEntry(cast({
    server_label: "lab2",
    server_url: "http://host2",
    displayName: "My Server",
    description: "custom",
    require_approval: "never",
  }));
  assert.equal(entry!.displayName, "My Server");
  assert.equal(entry!.description, "custom");
  assert.equal(entry!.definition.require_approval, "never");
});

test("findTool/findToolIndex miss absent keys and hit inserted MCP tools", () => {
  const key = "mcp:__catalog_spec__";
  assert.equal(findToolIndex(key), -1);
  assert.equal(findTool(key), undefined);

  const before = getUserMcpToolCount();
  insertMcpTool(buildMcpToolEntry(cast({ server_label: "__catalog_spec__", server_url: "http://h" }))!);

  assert.equal(getUserMcpToolCount(), before + 1);
  const idx = findToolIndex(key);
  assert.notEqual(idx, -1);
  assert.equal(findTool(key)!.key, key);
});
