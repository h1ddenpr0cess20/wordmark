import test from "node:test";
import assert from "node:assert/strict";

// Fake FileReader to convert Blob to data URL deterministically
class FakeFileReader {
  readAsDataURL() {
    setImmediate(() => {
      this.result = "data:image/png;base64,QUJD";
      this.onloadend && this.onloadend();
    });
  }
}

// Reference-preserving fake IndexedDB (keeps Blob identity, unlike a JSON clone).
function createFakeIndexedDB() {
  const stores = new Map();
  const objectStoreNames = { contains: (name) => stores.has(name) };

  function makeRequest() { return { onsuccess: null, onerror: null }; }
  function fireSuccess(req, result) {
    setImmediate(() => req.onsuccess && req.onsuccess({ target: { result } }));
  }

  function createStore(name, opts = {}) {
    const data = new Map();
    const keyPath = opts.keyPath || "filename";
    return {
      put(record) {
        const req = makeRequest();
        const key = record[keyPath];
        data.set(key, record);
        fireSuccess(req, key);
        return req;
      },
      get(key) {
        const req = makeRequest();
        fireSuccess(req, data.get(key));
        return req;
      },
      delete(key) {
        const req = makeRequest();
        data.delete(key);
        fireSuccess(req, true);
        return req;
      },
    };
  }

  const db = {
    objectStoreNames,
    createObjectStore(name, opts) { const s = createStore(name, opts); stores.set(name, s); return s; },
    transaction() { return { objectStore: (n) => stores.get(n) }; },
  };

  return {
    open() {
      const req = { onsuccess: null, onerror: null, onupgradeneeded: null };
      setImmediate(() => {
        if (req.onupgradeneeded) req.onupgradeneeded({ target: { result: db } });
        if (req.onsuccess) req.onsuccess({ target: { result: db } });
      });
      return req;
    },
  };
}

globalThis.window = { addEventListener: () => {}, indexedDB: createFakeIndexedDB() };
globalThis.FileReader = FakeFileReader;

const {
  initImageDb,
  saveImageToDb,
  getImageBlobForUpload,
  getImageDataForUpload,
  debugImageLoading,
} = await import("../src/js/utils/imageStorage.js");

await initImageDb();

test("getImageBlobForUpload handles data URL input", async () => {
  await saveImageToDb("data:image/jpeg;base64,QUJD", "img1");
  const blob = await getImageBlobForUpload("img1");
  assert.ok(blob instanceof Blob);
  assert.equal(blob.type, "image/jpeg");
});

test("getImageBlobForUpload handles plain base64 input", async () => {
  await saveImageToDb("QUJD", "img2");
  const blob = await getImageBlobForUpload("img2");
  assert.ok(blob instanceof Blob);
  assert.equal(blob.type, "image/png");
});

test("getImageBlobForUpload returns Blob as-is", async () => {
  const original = new Blob([Uint8Array.from([1, 2, 3])], { type: "image/webp" });
  await saveImageToDb(original, "img3");
  const blob = await getImageBlobForUpload("img3");
  assert.equal(blob, original);
  assert.equal(blob.type, "image/webp");
});

test("getImageDataForUpload returns data URL directly", async () => {
  const dataUrl = "data:image/gif;base64,QUJD";
  await saveImageToDb(dataUrl, "img4");
  const out = await getImageDataForUpload("img4");
  assert.equal(out, dataUrl);
});

test("getImageDataForUpload converts Blob via FileReader", async () => {
  const blob = new Blob([Uint8Array.from([65, 66, 67])], { type: "image/png" });
  await saveImageToDb(blob, "img5");
  const out = await getImageDataForUpload("img5");
  assert.ok(out.startsWith("data:image/png;base64,"));
});

test("getImageDataForUpload formats plain base64 to data URL", async () => {
  await saveImageToDb("QUJD", "img6");
  const out = await getImageDataForUpload("img6");
  assert.equal(out, "data:image/png;base64,QUJD");
});

test("debugImageLoading summarizes image placeholders in assistant messages", async () => {
  globalThis.window.conversationHistory = [
    { id: "u1", role: "user", content: "no images here" },
    { id: "a1", role: "assistant", content: "Here [[IMAGE: a.png]] and [[IMAGE: b.png]]" },
    { id: "a2", role: "assistant", content: "Another [[IMAGE: c.jpg]]" },
  ];

  const diag = debugImageLoading(false);
  assert.equal(diag.messagesWithImages, 2);
  assert.equal(diag.totalImagePlaceholders, 3);
  assert.equal(diag.filenameSpecificPlaceholders, 3);
});
