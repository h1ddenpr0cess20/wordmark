import test from 'node:test';
import assert from 'node:assert/strict';

type FakeReq = {
  onsuccess: ((ev: { target: { result: unknown } }) => void) | null;
  onerror: ((ev: { target: { error: unknown } }) => void) | null;
  onupgradeneeded?: ((ev: { target: { result: unknown } }) => void) | null;
  result: unknown;
  error: unknown;
};

// Minimal fake IndexedDB for tests
function createFakeIndexedDB() {
  const stores = new Map<string, ReturnType<typeof createStore>>();
  const objectStoreNames = { contains: (name: string) => stores.has(name) };

  function makeRequest(): FakeReq {
    const req: FakeReq = { onsuccess: null, onerror: null, result: undefined, error: null }; return req;
  }
  function fireSuccess(req: FakeReq, result: unknown) {
    req.result = result;
    setImmediate(() => req.onsuccess && req.onsuccess({ target: { result } }));
  }
  function fireError(req: FakeReq, error: unknown) {
    req.error = error;
    setImmediate(() => req.onerror && req.onerror({ target: { error } }));
  }

  function createStore(name: string, opts: { keyPath?: string } = {}) {
    const data = new Map<unknown, Record<string, unknown>>();
    const keyPath = opts.keyPath || 'id';
    return {
      put(record: Record<string, unknown>) {
        const req = makeRequest();
        const key = record[keyPath] || (record[keyPath] = Date.now().toString());
        data.set(key, JSON.parse(JSON.stringify(record)));
        fireSuccess(req, key);
        return req;
      },
      add(record: Record<string, unknown>) { return this.put(record); },
      get(key: unknown) {
        const req = makeRequest();
        fireSuccess(req, JSON.parse(JSON.stringify(data.get(key))));
        return req;
      },
      delete(key: unknown) {
        const req = makeRequest();
        data.delete(key);
        fireSuccess(req, true);
        return req;
      },
      openCursor() {
        const req = makeRequest();
        const values = Array.from(data.values());
        let idx = 0;
        function makeCursor(): { value: unknown; continue(): void } | null {
          if (idx >= values.length) return null;
          const value = JSON.parse(JSON.stringify(values[idx]));
          return {
            value,
            continue() {
              idx++;
              const next = makeCursor();
              req.result = next;
              setImmediate(() => req.onsuccess && req.onsuccess({ target: { result: next } }));
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
    createObjectStore(name: string, opts?: { keyPath?: string }) { const s = createStore(name, opts); stores.set(name, s); return s; },
    transaction(_names?: unknown, _mode?: unknown) {
      return {
        objectStore: (n: string) => stores.get(n),
      };
    },
  };

  return {
    open(_name?: unknown, _version?: unknown) {
      const req: FakeReq = { onsuccess: null, onerror: null, onupgradeneeded: null, result: db, error: null };
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

// Provide a window with a fake IndexedDB before importing the ES module.
globalThis.window = { addEventListener: () => {}, indexedDB: createFakeIndexedDB() } as unknown as Window & typeof globalThis;

const {
  initConversationDb,
  saveConversationToDb,
  loadConversationFromDb,
  getAllConversationsFromDb,
  renameConversationInDb,
  deleteConversationFromDb,
} = await import('../src/ts/utils/storage/conversationStorage.js');

test('conversation storage: init, save, load, getAll, rename, delete', async () => {
  await initConversationDb();
  const convo = { id: 'c1', name: 'First', messages: [{ role: 'user', content: 'hi' }] };
  const id = await saveConversationToDb(convo);
  assert.equal(id, 'c1');

  const loaded = await loadConversationFromDb('c1');
  assert.equal(loaded.name, 'First');

  const all = await getAllConversationsFromDb();
  assert.equal(Array.isArray(all), true);
  assert.equal(all.length, 1);

  const renamed = await renameConversationInDb('c1', 'Renamed');
  assert.equal(renamed, true);
  const loaded2 = await loadConversationFromDb('c1');
  assert.equal(loaded2.name, 'Renamed');

  const deleted = await deleteConversationFromDb('c1');
  assert.equal(deleted, true);

  // After deletion, loading should reject
  let threw = false;
  try { await loadConversationFromDb('c1'); } catch (e) { threw = true; }
  assert.equal(threw, true);
});
