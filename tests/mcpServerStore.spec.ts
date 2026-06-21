import test from "node:test";
import assert from "node:assert/strict";

const store: Record<string, string> = {};
globalThis.localStorage = {
  getItem(key: string) { return key in store ? store[key] : null; },
  setItem(key: string, value: string) { store[key] = String(value); },
  removeItem(key: string) { delete store[key]; },
} as unknown as Storage;

const { getMCPServers, addMCPServer, removeMCPServer } = await import("../src/ts/services/mcpServerStore.js");

type McpServer = Parameters<typeof addMCPServer>[0];

function reset() {
  for (const k of Object.keys(store)) delete store[k];
}

const server = (label: string): McpServer => ({
  server_label: label,
  server_url: `https://example.com/${label}`,
  displayName: label,
});

test("getMCPServers returns an empty array when nothing is stored", () => {
  reset();
  assert.deepEqual(getMCPServers(), []);
});

test("getMCPServers returns an empty array on unparseable data", () => {
  reset();
  store.mcp_servers = "{not json";
  assert.deepEqual(getMCPServers(), []);
});

test("addMCPServer persists and getMCPServers reads it back", () => {
  reset();
  assert.equal(addMCPServer(server("alpha")), true);
  const stored = getMCPServers();
  assert.equal(stored.length, 1);
  assert.equal(stored[0].server_label, "alpha");
  assert.equal(stored[0].server_url, "https://example.com/alpha");
});

test("addMCPServer appends without dropping existing servers", () => {
  reset();
  addMCPServer(server("alpha"));
  addMCPServer(server("beta"));
  assert.deepEqual(getMCPServers().map((s) => s.server_label), ["alpha", "beta"]);
});

test("addMCPServer rejects a duplicate label and leaves the store unchanged", () => {
  reset();
  addMCPServer(server("alpha"));
  assert.throws(() => addMCPServer(server("alpha")), /already exists/);
  assert.equal(getMCPServers().length, 1);
});

test("removeMCPServer drops only the matching label", () => {
  reset();
  addMCPServer(server("alpha"));
  addMCPServer(server("beta"));
  assert.equal(removeMCPServer("alpha"), true);
  assert.deepEqual(getMCPServers().map((s) => s.server_label), ["beta"]);
});

test("removeMCPServer is a no-op (still true) for an unknown label", () => {
  reset();
  addMCPServer(server("alpha"));
  assert.equal(removeMCPServer("missing"), true);
  assert.deepEqual(getMCPServers().map((s) => s.server_label), ["alpha"]);
});
