import test from 'node:test';
import assert from 'node:assert/strict';

const { base64ToBlob } = await import('../src/ts/utils/storage/imageStorage.js');

test('base64ToBlob decodes bytes and sets the MIME type', async () => {
  // "hi" -> base64 "aGk="
  const blob = base64ToBlob('aGk=', 'text/plain');
  assert.equal(blob.type, 'text/plain');
  assert.equal(blob.size, 2);
  assert.equal(await blob.text(), 'hi');
});

test('base64ToBlob round-trips arbitrary bytes', async () => {
  const bytes = new Uint8Array([0, 1, 2, 254, 255]);
  const base64 = Buffer.from(bytes).toString('base64');
  const blob = base64ToBlob(base64, 'application/octet-stream');
  assert.equal(blob.type, 'application/octet-stream');
  const out = new Uint8Array(await blob.arrayBuffer());
  assert.deepEqual([...out], [...bytes]);
});

test('base64ToBlob throws on invalid base64', () => {
  assert.throws(() => base64ToBlob('not base64!!', 'image/png'));
});
