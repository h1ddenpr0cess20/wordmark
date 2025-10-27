import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadWindowScript } from './helpers/loadWindowScript.js';

// Simple base64 helpers for tests
const atobPoly = (str) => Buffer.from(str, 'base64').toString('binary');

// Fake FileReader to convert Blob to data URL deterministically
class FakeFileReader {
  readAsDataURL(blob) {
    setImmediate(() => {
      this.result = 'data:image/png;base64,QUJD';
      this.onloadend && this.onloadend();
    });
  }
}

function makeWindowStub() {
  return {
    addEventListener: () => {},
  };
}

const imagePath = path.resolve('src/js/utils/imageStorage.js');
const windowObj = loadWindowScript(imagePath, {
  window: makeWindowStub(),
  FileReader: FakeFileReader,
  atob: atobPoly,
  document: {
    addEventListener() {},
  },
});

test('getImageBlobForUpload handles data URL input', async () => {
  windowObj.loadImageFromDb = async () => ({ data: 'data:image/jpeg;base64,QUJD' });
  const blob = await windowObj.getImageBlobForUpload('img1');
  assert.ok(blob instanceof Blob);
  assert.equal(blob.type, 'image/jpeg');
});

test('getImageBlobForUpload handles plain base64 input', async () => {
  windowObj.loadImageFromDb = async () => ({ data: 'QUJD' });
  const blob = await windowObj.getImageBlobForUpload('img2');
  assert.ok(blob instanceof Blob);
  assert.equal(blob.type, 'image/png');
});

test('getImageBlobForUpload returns Blob as-is', async () => {
  const original = new Blob([Uint8Array.from([1,2,3])], { type: 'image/webp' });
  windowObj.loadImageFromDb = async () => ({ data: original });
  const blob = await windowObj.getImageBlobForUpload('img3');
  assert.equal(blob, original);
  assert.equal(blob.type, 'image/webp');
});

test('getImageDataForUpload returns data URL directly', async () => {
  const dataUrl = 'data:image/gif;base64,QUJD';
  windowObj.loadImageFromDb = async () => ({ data: dataUrl });
  const out = await windowObj.getImageDataForUpload('img4');
  assert.equal(out, dataUrl);
});

test('getImageDataForUpload converts Blob via FileReader', async () => {
  const blob = new Blob([Uint8Array.from([65,66,67])], { type: 'image/png' });
  windowObj.loadImageFromDb = async () => ({ data: blob });
  const out = await windowObj.getImageDataForUpload('img5');
  assert.ok(out.startsWith('data:image/png;base64,'));
});

test('getImageDataForUpload formats plain base64 to data URL', async () => {
  windowObj.loadImageFromDb = async () => ({ data: 'QUJD' });
  const out = await windowObj.getImageDataForUpload('img6');
  assert.equal(out, 'data:image/png;base64,QUJD');
});

test('debugImageLoading summarizes image placeholders in assistant messages', async () => {
  const win = loadWindowScript(imagePath, {
    window: { addEventListener: (ev, cb) => {} },
    document: { addEventListener() {} },
  });
  win.conversationHistory = [
    { id: 'u1', role: 'user', content: 'no images here' },
    { id: 'a1', role: 'assistant', content: 'Here [[IMAGE: a.png]] and [[IMAGE: b.png]]' },
    { id: 'a2', role: 'assistant', content: 'Another [[IMAGE: c.jpg]]' },
  ];

  const diag = win.debugImageLoading(false);
  assert.equal(diag.messagesWithImages, 2);
  assert.equal(diag.totalImagePlaceholders, 3);
  assert.equal(diag.filenameSpecificPlaceholders, 3);
});
