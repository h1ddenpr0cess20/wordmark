import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadWindowScript } from './helpers/loadWindowScript.js';

// Minimal fake IndexedDB for tests
function createFakeIndexedDB() {
  const stores = new Map();
  const objectStoreNames = { contains: (name) => stores.has(name) };

  function makeRequest() {
    const req = { onsuccess: null, onerror: null }; return req;
  }
  function fireSuccess(req, result) {
    setImmediate(() => req.onsuccess && req.onsuccess({ target: { result } }));
  }
  function fireError(req, error) {
    setImmediate(() => req.onerror && req.onerror({ target: { error } }));
  }

  function createStore(name, opts = {}) {
    const data = new Map();
    const keyPath = opts.keyPath || 'id';
    return {
      put(record) {
        const req = makeRequest();
        const key = record[keyPath] || (record[keyPath] = Date.now().toString());
        data.set(key, JSON.parse(JSON.stringify(record)));
        fireSuccess(req, key);
        return req;
      },
      add(record) { return this.put(record); },
      get(key) {
        const req = makeRequest();
        fireSuccess(req, JSON.parse(JSON.stringify(data.get(key))));
        return req;
      },
      delete(key) {
        const req = makeRequest();
        data.delete(key);
        fireSuccess(req, true);
        return req;
      },
      openCursor() {
        const req = makeRequest();
        const values = Array.from(data.values());
        let idx = 0;
        function makeCursor() {
          if (idx >= values.length) return null;
          const value = JSON.parse(JSON.stringify(values[idx]));
          return {
            value,
            continue() {
              idx++;
              setImmediate(() => req.onsuccess && req.onsuccess({ target: { result: makeCursor() } }));
            },
          };
        }
        fireSuccess(req, makeCursor());
        return req;
      },
    };
  }

  const db = {
    objectStoreNames,
    createObjectStore(name, opts) { const s = createStore(name, opts); stores.set(name, s); return s; },
    transaction(names, mode) {
      return {
        objectStore: (n) => stores.get(n),
      };
    },
  };

  return {
    open(name, version) {
      const req = { onsuccess: null, onerror: null, onupgradeneeded: null };
      setImmediate(() => {
        if (req.onupgradeneeded) req.onupgradeneeded({ target: { result: db } });
        if (req.onsuccess) req.onsuccess({ target: { result: db } });
      });
      return req;
    },
    _db: db,
    _stores: stores,
  };
}

const file = path.resolve('src/js/utils/conversationStorage.js');

test('conversation storage: init, save, load, getAll, rename, delete', async () => {
  const fakeIDB = createFakeIndexedDB();
  const win = loadWindowScript(file, {
    window: { addEventListener: (ev, cb) => { if (ev === 'DOMContentLoaded') cb(); }, indexedDB: fakeIDB },
  });

  await win.initConversationDb();
  const convo = { id: 'c1', name: 'First', messages: [{ role: 'user', content: 'hi' }] };
  const id = await win.saveConversationToDb(convo);
  assert.equal(id, 'c1');

  const loaded = await win.loadConversationFromDb('c1');
  assert.equal(loaded.name, 'First');

  const all = await win.getAllConversationsFromDb();
  assert.equal(Array.isArray(all), true);
  assert.equal(all.length, 1);

  const renamed = await win.renameConversationInDb('c1', 'Renamed');
  assert.equal(renamed, true);
  const loaded2 = await win.loadConversationFromDb('c1');
  assert.equal(loaded2.name, 'Renamed');

  const deleted = await win.deleteConversationFromDb('c1');
  assert.equal(deleted, true);

  // After deletion, loading should reject
  let threw = false;
  try { await win.loadConversationFromDb('c1'); } catch (e) { threw = true; }
  assert.equal(threw, true);
});
