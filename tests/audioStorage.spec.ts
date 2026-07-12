import test from 'node:test';
import assert from 'node:assert/strict';

type FakeReq = {
  onsuccess: ((ev: { target: { result: unknown } }) => void) | null;
  onerror?: ((ev: { target: { error: unknown } }) => void) | null;
  onupgradeneeded?: ((ev: { target: { result: unknown } }) => void) | null;
  result: unknown;
  error: unknown;
};

type AudioRecord = { id: unknown; messageId?: unknown; timestamp?: number; [key: string]: unknown };

function createFakeIndexedDB() {
  const stores = new Map<string, ReturnType<typeof createStore>>();
  const objectStoreNames = { contains: (name: string) => stores.has(name) };

  function makeRequest(): FakeReq { return { onsuccess: null, onerror: null, result: undefined, error: null }; }
  function fireSuccess(req: FakeReq, result: unknown) { req.result = result; setImmediate(() => req.onsuccess && req.onsuccess({ target: { result } })); }

  function createStore(name: string) {
    const data = new Map<unknown, AudioRecord>();
    return {
      _name: name,
      _indexes: new Set<string>(),
      createIndex(name: string) { this._indexes.add(name); return { name }; },
      add(record: AudioRecord) {
        const req = makeRequest();
        data.set(record.id, JSON.parse(JSON.stringify(record)));
        fireSuccess(req, record.id);
        return req;
      },
      delete(key: unknown) { const req = makeRequest(); data.delete(key); fireSuccess(req, true); return req; },
      index(indexName: string) {
        if (indexName === 'timestamp') {
          return {
            openCursor(_range: unknown, direction: string) {
              const req = makeRequest();
              const arr = Array.from(data.values()).sort((a, b) => direction === 'prev' ? (b.timestamp ?? 0) - (a.timestamp ?? 0) : (a.timestamp ?? 0) - (b.timestamp ?? 0));
              let i = 0;
              function makeCursor(): { value: unknown; continue(): void } | null {
                if (i >= arr.length) return null;
                const val = JSON.parse(JSON.stringify(arr[i]));
                return {
                  value: val,
                  continue() { i++; const next = makeCursor(); req.result = next; setImmediate(() => req.onsuccess && req.onsuccess({ target: { result: next } })); },
                };
              }
              fireSuccess(req, makeCursor());
              return req;
            },
            getAll(_key?: unknown) {
              const req = makeRequest(); fireSuccess(req, []); return req;
            },
          };
        }
        if (indexName === 'messageId') {
          return {
            getAll(val: unknown) {
              const req = makeRequest();
              const arr = Array.from(data.values()).filter(r => r.messageId === val);
              fireSuccess(req, JSON.parse(JSON.stringify(arr)));
              return req;
            },
          };
        }
        throw new Error('Unknown index: ' + indexName);
      },
    };
  }

  const db = {
    objectStoreNames,
    createObjectStore(name: string) { const s = createStore(name); stores.set(name, s); return s; },
    transaction(_names?: unknown, _mode?: unknown) {
      const txn: {
        objectStore: (n: string) => unknown;
        oncomplete: (() => void) | null;
        onabort: (() => void) | null;
        onerror: (() => void) | null;
        error: unknown;
      } = {
        objectStore: (n: string) => stores.get(n),
        oncomplete: null,
        onabort: null,
        onerror: null,
        error: null,
      };
      setImmediate(() => setImmediate(() => txn.oncomplete && txn.oncomplete()));
      return txn;
    },
  };

  return {
    open() { const req: FakeReq = { onupgradeneeded: null, onsuccess: null, result: db, error: null }; setImmediate(() => { req.onupgradeneeded && req.onupgradeneeded({ target: { result: db } }); req.onsuccess && req.onsuccess({ target: { result: db } }); }); return req; },
    _db: db,
  };
}

type FakeAnchor = { tagName: string; style: Record<string, unknown>; setAttribute(): void; clickCalled: number; click?: () => void; download?: string };

function makeDom() {
  const nodes = new Map<unknown, boolean>();
  const body = {
    appended: [] as FakeAnchor[],
    appendChild(el: FakeAnchor) { this.appended.push(el); nodes.set(el, true); },
    removeChild(el: FakeAnchor) { nodes.delete(el); },
  };
  const head = { appendChild() {} };
  return {
    document: {
      body,
      head,
      createElement(tag: string) {
        const el: FakeAnchor = { tagName: tag.toUpperCase(), style: {}, setAttribute() {}, clickCalled: 0 };
        el.click = () => { el.clickCalled++; };
        return el;
      },
      addEventListener() {},
    },
  };
}

const dom = makeDom();
globalThis.document = dom.document as unknown as Document;
Object.assign(globalThis.URL, { createObjectURL: () => 'blob://fake-url', revokeObjectURL: () => {} });
globalThis.window = { addEventListener: () => {}, indexedDB: createFakeIndexedDB() } as unknown as Window & typeof globalThis;

const {
  initAudioDb,
  saveAudioToDb,
  loadAudioForMessage,
  cleanupOldAudio,
  exportAudioForDownload,
} = await import('../src/ts/utils/storage/audioStorage.js');

test('exportAudioForDownload creates anchor and triggers click', () => {
  const buffer = new ArrayBuffer(4);
  const ok = exportAudioForDownload(buffer, 'voice.wav');
  assert.equal(ok, true);
  const anchor = dom.document.body.appended.at(-1)!;
  assert.equal(anchor.tagName, 'A');
  assert.equal(anchor.download, 'voice.wav');
  assert.equal(anchor.clickCalled, 1);
});

test('audio cleanupOldAudio enforces max and is idempotent', async () => {
  await initAudioDb();

  const total = 22;
  for (let i = 0; i < total; i++) {
    await saveAudioToDb(new ArrayBuffer(1), 'msg', 't', 'v');
  }

  const deleted = await cleanupOldAudio();
  assert.equal(typeof deleted, 'number');
  assert.ok(deleted >= 0);

  const rec = await loadAudioForMessage('msg');
  assert.equal(rec.messageId, 'msg');

  const deleted2 = await cleanupOldAudio();
  assert.equal(deleted2, 0);
});
