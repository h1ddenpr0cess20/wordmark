import test from "node:test";
import assert from "node:assert/strict";

declare global {
  // eslint-disable-next-line no-var
  var __mcpContainer: unknown;
}

function createLocalStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    getItem(key: string) { return store.has(key) ? store.get(key) : null; },
    setItem(key: string, value: string) { store.set(key, String(value)); },
    removeItem(key: string) { store.delete(key); },
    clear() { store.clear(); },
  } as unknown as Storage;
}

type FakeButton = { dataset: { serverLabel: string }; addEventListener(): void };

function createListContainer() {
  return {
    _innerHTML: "",
    buttons: [] as FakeButton[],
    set innerHTML(html: string) {
      this._innerHTML = html;
      const matches = [...html.matchAll(/data-server-label="([^"]+)"/g)];
      this.buttons = matches.map(label => ({ dataset: { serverLabel: label[1] }, addEventListener() {} }));
    },
    get innerHTML() { return this._innerHTML; },
    appendChild() {},
    querySelectorAll(selector: string) {
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

globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => { cb(0); return 0; }) as unknown as typeof requestAnimationFrame;
globalThis.window = globalThis.window || ({} as Window & typeof globalThis);
globalThis.document = {
  readyState: "complete",
  body: { appendChild() {} },
  head: { appendChild() {} },
  getElementById: (id: string) => (id === "mcp-servers-list" ? globalThis.__mcpContainer : null),
  createElement: () => makeStubEl(),
  addEventListener() {},
} as unknown as Document;

const { getMCPServers, addMCPServer, requestMcpServerRemoval } =
  await import("../src/ts/services/mcpServers.ts");

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
  let stored = JSON.parse(storage.getItem("mcp_servers")!);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].server_label, "local-dev");

  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    assert.throws(() => addMCPServer(server), /already exists/);
  } finally {
    console.error = originalConsoleError;
  }
  stored = JSON.parse(storage.getItem("mcp_servers")!);
  assert.equal(stored.length, 1);
});

test("requestMcpServerRemoval removes confirmed servers and refreshes UI", () => {
  const servers = [
    { displayName: "First Server", server_label: "first", server_url: "http://localhost:9001/mcp", require_approval: "always" },
    { displayName: "Second Server", server_label: "second", server_url: "http://localhost:9002/mcp", require_approval: "always" },
  ];
  globalThis.localStorage = createLocalStorage({ mcp_servers: JSON.stringify(servers) });
  globalThis.__mcpContainer = createListContainer();

  const confirmCalls: Array<string | undefined> = [];
  globalThis.confirm = (message?: string) => { confirmCalls.push(message); return true; };
  (globalThis.window as unknown as { icon: () => string }).icon = () => "";

  const removed = requestMcpServerRemoval("first");
  assert.equal(removed, true);
  assert.equal(confirmCalls.length, 1);
  assert.match(confirmCalls[0]!, /First Server/);

  const stored = JSON.parse(globalThis.localStorage.getItem("mcp_servers")!);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].server_label, "second");
});

test("requestMcpServerRemoval uses fallback label and does nothing when cancelled", () => {
  const servers = [
    { displayName: "First Server", server_label: "first", server_url: "http://localhost:9001/mcp", require_approval: "always" },
  ];
  globalThis.localStorage = createLocalStorage({ mcp_servers: JSON.stringify(servers) });
  globalThis.__mcpContainer = createListContainer();

  const confirmCalls: Array<string | undefined> = [];
  globalThis.confirm = (message?: string) => { confirmCalls.push(message); return false; };

  const result = requestMcpServerRemoval("missing", "Fallback Server");
  assert.equal(result, false);
  assert.equal(confirmCalls.length, 1);
  assert.match(confirmCalls[0]!, /Fallback Server/);

  const stored = JSON.parse(globalThis.localStorage.getItem("mcp_servers")!);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].server_label, "first");
});
