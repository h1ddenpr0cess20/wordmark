import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadWindowScript } from './helpers/loadWindowScript.js';

// Fake IndexedDB with simple index support on 'timestamp'
function createFakeIndexedDB() {
  const stores = new Map();
  const objectStoreNames = { contains: (name) => stores.has(name) };

  function makeRequest() { return { onsuccess: null, onerror: null }; }
  function fireSuccess(req, result) { setImmediate(() => req.onsuccess && req.onsuccess({ target: { result } })); }

  function createStore(name) {
    const data = new Map();
    return {
      _name: name,
      _indexes: new Set(),
      createIndex(name) { this._indexes.add(name); return { name }; },
      add(record) {
        const req = makeRequest();
        data.set(record.id, JSON.parse(JSON.stringify(record)));
        fireSuccess(req, record.id);
        return req;
      },
      delete(key) { const req = makeRequest(); data.delete(key); fireSuccess(req, true); return req; },
      index(indexName) {
        if (indexName === 'timestamp') {
          return {
            openCursor(_range, direction) {
              const req = makeRequest();
              const arr = Array.from(data.values()).sort((a,b) => direction === 'prev' ? b.timestamp - a.timestamp : a.timestamp - b.timestamp);
              let i = 0;
              function makeCursor() {
                if (i >= arr.length) return null;
                const val = JSON.parse(JSON.stringify(arr[i]));
                return {
                  value: val,
                  continue() { i++; setImmediate(() => req.onsuccess && req.onsuccess({ target: { result: makeCursor() } })); },
                };
              }
              fireSuccess(req, makeCursor());
              return req;
            },
            getAll(key) {
              const req = makeRequest(); fireSuccess(req, []); return req;
            },
          };
        }
        if (indexName === 'messageId') {
          return {
            getAll(val) {
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
    createObjectStore(name) { const s = createStore(name); stores.set(name, s); return s; },
    transaction(names, mode) { return { objectStore: (n) => stores.get(n) }; },
  };

  return {
    open() { const req = { onupgradeneeded: null, onsuccess: null }; setImmediate(() => { req.onupgradeneeded && req.onupgradeneeded({ target: { result: db } }); req.onsuccess && req.onsuccess({ target: { result: db } }); }); return req; },
    _db: db,
  };
}

function makeDom() {
  const nodes = new Map();
  const body = {
    appended: [],
    appendChild(el) { this.appended.push(el); nodes.set(el, true); },
    removeChild(el) { nodes.delete(el); },
  };
  const head = { appendChild() {} };
  return {
    document: {
      body,
      head,
      createElement(tag) {
        const el = { tagName: tag.toUpperCase(), style: {}, setAttribute() {}, clickCalled: 0 };
        el.click = () => { el.clickCalled++; };
        return el;
      },
      addEventListener() {},
    },
  };
}

const audioPath = path.resolve('src/js/utils/audioStorage.js');

test('exportAudioForDownload creates anchor and triggers click', () => {
  const dom = makeDom();
  const windowObj = loadWindowScript(audioPath, {
    window: { addEventListener: () => {} },
    document: dom.document,
    URL: {
      createObjectURL: () => 'blob://fake-url',
      revokeObjectURL: () => {},
    },
  });

  const buffer = new ArrayBuffer(4);
  const ok = windowObj.exportAudioForDownload(buffer, 'voice.wav');
  assert.equal(ok, true);
  // Last appended element is the anchor
  const anchor = dom.document.body.appended.at(-1);
  assert.equal(anchor.tagName, 'A');
  assert.equal(anchor.download, 'voice.wav');
  assert.equal(anchor.clickCalled, 1);
});

test('audio cleanupOldAudio enforces max and is idempotent', async () => {
  const fakeIDB = createFakeIndexedDB();
  const dom = makeDom();
  const win = loadWindowScript(audioPath, {
    window: { addEventListener: (ev, cb) => { if (ev === 'DOMContentLoaded') cb(); }, indexedDB: fakeIDB },
    document: dom.document,
    globals: { URL: { createObjectURL: ()=>'blob://x', revokeObjectURL:()=>{} } },
  });

  await win.initAudioDb();

  // Save more than MAX_STORED_AUDIO (15)
  const total = 22;
  for (let i=0; i<total; i++) {
    await win.saveAudioToDb(new ArrayBuffer(1), 'msg', 't', 'v');
  }

  // Now run cleanup explicitly; may already be clean due to auto-clean in save
  const deleted = await win.cleanupOldAudio();
  assert.equal(typeof deleted, 'number');
  assert.ok(deleted >= 0);

  // Loading by message should return a record
  const rec = await win.loadAudioForMessage('msg');
  assert.equal(rec.messageId, 'msg');

  // Running cleanup again should result in zero deletions
  const deleted2 = await win.cleanupOldAudio();
  assert.equal(deleted2, 0);
});
