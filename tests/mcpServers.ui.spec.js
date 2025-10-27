import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadWindowScript } from './helpers/loadWindowScript.js';

function createLocalStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

function createRemoveButton(label) {
  return {
    dataset: { serverLabel: label },
    listeners: {},
    addEventListener(event, callback) {
      this.listeners[event] = callback;
    },
    trigger(event) {
      if (this.listeners[event]) {
        this.listeners[event]({ currentTarget: this });
      }
    },
  };
}

function createListContainer() {
  return {
    _innerHTML: '',
    buttons: [],
    set innerHTML(html) {
      this._innerHTML = html;
      const matches = [...html.matchAll(/data-server-label="([^"]+)"/g)];
      this.buttons = matches.map(match => createRemoveButton(match[1]));
    },
    get innerHTML() {
      return this._innerHTML;
    },
    querySelectorAll(selector) {
      if (selector === '.mcp-server-remove') {
        return this.buttons;
      }
      return [];
    },
  };
}

function loadMcpModule({ storage, document, confirm: confirmFn, windowOverrides = {}, globals = {} }) {
  const modulePath = path.resolve('src/js/services/mcpServers.js');
  return loadWindowScript(modulePath, {
    window: { ...windowOverrides },
    document,
    globals: {
      localStorage: storage,
      confirm: confirmFn,
      ...globals,
    },
  });
}

test('addMCPServer persists unique servers and rejects duplicates', () => {
  const storage = createLocalStorage();
  const windowObj = loadMcpModule({ storage });

  const initialServers = windowObj.getMCPServers();
  assert.equal(Array.isArray(initialServers), true);
  assert.equal(initialServers.length, 0);

  const server = {
    displayName: 'Local Dev',
    server_label: 'local-dev',
    server_url: 'http://localhost:9404/mcp',
    require_approval: 'always',
  };

  const added = windowObj.addMCPServer(server);
  assert.equal(added, true);

  const stored = JSON.parse(storage.getItem('mcp_servers'));
  assert.equal(stored.length, 1);
  assert.equal(stored[0].server_label, 'local-dev');

  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    assert.throws(
      () => windowObj.addMCPServer(server),
      /already exists/
    );
  } finally {
    console.error = originalConsoleError;
  }

  const afterDuplicateAttempt = JSON.parse(storage.getItem('mcp_servers'));
  assert.equal(afterDuplicateAttempt.length, 1);
});

test('requestMcpServerRemoval removes confirmed servers and refreshes UI', () => {
  const servers = [
    {
      displayName: 'First Server',
      server_label: 'first',
      server_url: 'http://localhost:9001/mcp',
      require_approval: 'always',
    },
    {
      displayName: 'Second Server',
      server_label: 'second',
      server_url: 'http://localhost:9002/mcp',
      require_approval: 'always',
    },
  ];

  const storage = createLocalStorage({
    mcp_servers: JSON.stringify(servers),
  });

  const container = createListContainer();
  const notifications = [];
  const unregisterCalls = [];
  let refreshed = false;
  const confirmCalls = [];

  const documentStub = {
    getElementById(id) {
      if (id === 'mcp-servers-list') {
        return container;
      }
      return null;
    },
  };

  const confirmStub = (message) => {
    confirmCalls.push(message);
    return true;
  };

  const windowObj = loadMcpModule({
    storage,
    document: documentStub,
    confirm: confirmStub,
    windowOverrides: {
      showNotification(message, type) {
        notifications.push({ message, type });
      },
      responsesClient: {
        unregisterMcpServer(label) {
          unregisterCalls.push(label);
        },
      },
      refreshToolSettingsUI() {
        refreshed = true;
      },
    },
  });

  const removed = windowObj.requestMcpServerRemoval('first');
  assert.equal(removed, true);
  assert.equal(confirmCalls.length, 1);
  assert.match(confirmCalls[0], /First Server/);

  const stored = JSON.parse(storage.getItem('mcp_servers'));
  assert.equal(stored.length, 1);
  assert.equal(stored[0].server_label, 'second');

  assert.equal(unregisterCalls.length, 1);
  assert.equal(unregisterCalls[0], 'first');
  assert.equal(refreshed, true);

  assert.equal(container.innerHTML.includes('First Server'), false);
  assert.equal(container.innerHTML.includes('Second Server'), true);

  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].type, 'success');
});

test('requestMcpServerRemoval uses fallback label and does nothing when cancelled', () => {
  const servers = [
    {
      displayName: 'First Server',
      server_label: 'first',
      server_url: 'http://localhost:9001/mcp',
      require_approval: 'always',
    },
  ];

  const storage = createLocalStorage({
    mcp_servers: JSON.stringify(servers),
  });

  const notifications = [];
  const confirmCalls = [];
  const confirmStub = (message) => {
    confirmCalls.push(message);
    return false;
  };

  const windowObj = loadMcpModule({
    storage,
    confirm: confirmStub,
    windowOverrides: {
      showNotification(message, type) {
        notifications.push({ message, type });
      },
    },
  });

  const result = windowObj.requestMcpServerRemoval('missing', 'Fallback Server');
  assert.equal(result, false);
  assert.equal(confirmCalls.length, 1);
  assert.match(confirmCalls[0], /Fallback Server/);

  const stored = JSON.parse(storage.getItem('mcp_servers'));
  assert.equal(stored.length, 1);
  assert.equal(stored[0].server_label, 'first');
  assert.equal(notifications.length, 0);
});
