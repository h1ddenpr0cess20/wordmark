import test from "node:test";
import assert from "node:assert/strict";

// mcpServers.js imports the notifications module and attaches its API to window.
// Provide browser-global stubs before importing it. showNotification is a real
// import that no-ops without a DOM, so these tests verify storage/UI behavior
// rather than intercepting the toast.
function createLocalStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    removeItem(key) { store.delete(key); },
    clear() { store.clear(); },
  };
}

function createListContainer() {
  return {
    _innerHTML: "",
    buttons: [],
    set innerHTML(html) {
      this._innerHTML = html;
      const matches = [...html.matchAll(/data-server-label="([^"]+)"/g)];
      this.buttons = matches.map(label => ({ dataset: { serverLabel: label[1] }, addEventListener() {} }));
    },
    get innerHTML() { return this._innerHTML; },
    appendChild() {},
    querySelectorAll(selector) {
      return selector === ".mcp-server-remove" ? this.buttons : [];
    },
  };
}

function makeStubEl() {
  return {
    className: "", dataset: {}, textContent: "", innerHTML: "", id: "",
    children: [],
    classList: { add() {}, remove() {}, contains() { return false; } },
    setAttribute() {},
    appendChild() {},
    removeChild() {},
    addEventListener() {},
    querySelectorAll() { return []; },
  };
}

globalThis.requestAnimationFrame = (cb) => cb();
globalThis.window = globalThis.window || {};
globalThis.document = {
  readyState: "complete",
  body: { appendChild() {} },
  head: { appendChild() {} },
  getElementById: (id) => (id === "mcp-servers-list" ? globalThis.__mcpContainer : null),
  createElement: () => makeStubEl(),
  // mcpServers now imports the responsesClient facade, which transitively loads
  // apiKeys.js; its DOMContentLoaded self-init needs addEventListener present.
  addEventListener() {},
};

const { getMCPServers, addMCPServer, requestMcpServerRemoval } =
  await import("../src/ts/services/mcpServers.js");

test("addMCPServer persists unique servers and rejects duplicates", () => {
  const storage = createLocalStorage();
  globalThis.localStorage = storage;

  assert.deepEqual(getMCPServers(), []);

  const server = {
    displayName: "Local Dev",
    server_label: "local-dev",
    server_url: "http://localhost:9404/mcp",
    require_approval: "always",
  };

  assert.equal(addMCPServer(server), true);
  let stored = JSON.parse(storage.getItem("mcp_servers"));
  assert.equal(stored.length, 1);
  assert.equal(stored[0].server_label, "local-dev");

  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    assert.throws(() => addMCPServer(server), /already exists/);
  } finally {
    console.error = originalConsoleError;
  }
  stored = JSON.parse(storage.getItem("mcp_servers"));
  assert.equal(stored.length, 1);
});

test("requestMcpServerRemoval removes confirmed servers and refreshes UI", () => {
  const servers = [
    { displayName: "First Server", server_label: "first", server_url: "http://localhost:9001/mcp", require_approval: "always" },
    { displayName: "Second Server", server_label: "second", server_url: "http://localhost:9002/mcp", require_approval: "always" },
  ];
  globalThis.localStorage = createLocalStorage({ mcp_servers: JSON.stringify(servers) });
  globalThis.__mcpContainer = createListContainer();

  const confirmCalls = [];
  globalThis.confirm = (message) => { confirmCalls.push(message); return true; };
  // unregisterMcpServer + refreshToolSettingsUI are now reached through static
  // ESM imports (no window seam to spy on); assert the observable effect: the
  // server is removed from storage. The real refreshToolSettingsUI no-ops here
  // because there is no tools container in the DOM.
  globalThis.window.icon = () => "";

  const removed = requestMcpServerRemoval("first");
  assert.equal(removed, true);
  assert.equal(confirmCalls.length, 1);
  assert.match(confirmCalls[0], /First Server/);

  const stored = JSON.parse(globalThis.localStorage.getItem("mcp_servers"));
  assert.equal(stored.length, 1);
  assert.equal(stored[0].server_label, "second");
});

test("requestMcpServerRemoval uses fallback label and does nothing when cancelled", () => {
  const servers = [
    { displayName: "First Server", server_label: "first", server_url: "http://localhost:9001/mcp", require_approval: "always" },
  ];
  globalThis.localStorage = createLocalStorage({ mcp_servers: JSON.stringify(servers) });
  globalThis.__mcpContainer = createListContainer();

  const confirmCalls = [];
  globalThis.confirm = (message) => { confirmCalls.push(message); return false; };

  const result = requestMcpServerRemoval("missing", "Fallback Server");
  assert.equal(result, false);
  assert.equal(confirmCalls.length, 1);
  assert.match(confirmCalls[0], /Fallback Server/);

  const stored = JSON.parse(globalThis.localStorage.getItem("mcp_servers"));
  assert.equal(stored.length, 1);
  assert.equal(stored[0].server_label, "first");
});
