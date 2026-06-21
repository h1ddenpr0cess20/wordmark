import test from "node:test";
import assert from "node:assert/strict";

// Fake FileReader to convert Blob to data URL deterministically
class FakeFileReader {
  result: string | null = null;
  onloadend: (() => void) | null = null;
  readAsDataURL() {
    setImmediate(() => {
      this.result = "data:image/png;base64,QUJD";
      this.onloadend && this.onloadend();
    });
  }
}

type FakeReq = {
  onsuccess: ((ev: { target: { result: unknown } }) => void) | null;
  onerror: ((ev: { target: { error: unknown } }) => void) | null;
  onupgradeneeded?: ((ev: { target: { result: unknown } }) => void) | null;
  result: unknown;
  error: unknown;
};

// Reference-preserving fake IndexedDB (keeps Blob identity, unlike a JSON clone).
function createFakeIndexedDB() {
  const stores = new Map<string, ReturnType<typeof createStore>>();
  const objectStoreNames = { contains: (name: string) => stores.has(name) };

  function makeRequest(): FakeReq {
    return { onsuccess: null, onerror: null, result: undefined, error: null };
  }
  function fireSuccess(req: FakeReq, result: unknown) {
    req.result = result;
    setImmediate(() => req.onsuccess && req.onsuccess({ target: { result } }));
  }

  function createStore(name: string, opts: { keyPath?: string } = {}) {
    const data = new Map<unknown, Record<string, unknown>>();
    const keyPath = opts.keyPath || "filename";
    return {
      put(record: Record<string, unknown>) {
        const req = makeRequest();
        const key = record[keyPath];
        data.set(key, record);
        fireSuccess(req, key);
        return req;
      },
      get(key: unknown) {
        const req = makeRequest();
        fireSuccess(req, data.get(key));
        return req;
      },
      delete(key: unknown) {
        const req = makeRequest();
        data.delete(key);
        fireSuccess(req, true);
        return req;
      },
    };
  }

  const db = {
    objectStoreNames,
    createObjectStore(name: string, opts?: { keyPath?: string }) { const s = createStore(name, opts); stores.set(name, s); return s; },
    transaction() {
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
    open() {
      const req: FakeReq = { onsuccess: null, onerror: null, onupgradeneeded: null, result: db, error: null };
      setImmediate(() => {
        if (req.onupgradeneeded) req.onupgradeneeded({ target: { result: db } });
        if (req.onsuccess) req.onsuccess({ target: { result: db } });
      });
      return req;
    },
  };
}

globalThis.window = { addEventListener: () => {}, indexedDB: createFakeIndexedDB() } as unknown as Window & typeof globalThis;
globalThis.FileReader = FakeFileReader as unknown as typeof FileReader;

const {
  initImageDb,
  saveImageToDb,
  getImageBlobForUpload,
  getImageDataForUpload,
} = await import("../src/ts/utils/storage/imageStorage.ts");

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
  assert.ok((out as string).startsWith("data:image/png;base64,"));
});

test("getImageDataForUpload formats plain base64 to data URL", async () => {
  await saveImageToDb("QUJD", "img6");
  const out = await getImageDataForUpload("img6");
  assert.equal(out, "data:image/png;base64,QUJD");
});

