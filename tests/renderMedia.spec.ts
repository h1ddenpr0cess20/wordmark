import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><body></body>');
globalThis.window = dom.window as unknown as Window & typeof globalThis;
globalThis.document = dom.window.document;

const {
  createMissingMediaPlaceholder,
  findMediaRecord,
  resolveMediaSource,
  createMediaElement,
  hydrateMediaUrls,
} = await import('../src/ts/services/history/renderMedia.js');
const { state } = await import('../src/ts/init/state.js');

type ConversationRecord = Parameters<typeof findMediaRecord>[0];
type GeneratedImage = NonNullable<Parameters<typeof resolveMediaSource>[0]>;

const convo = (images: unknown[]): ConversationRecord =>
  ({ images } as unknown as ConversationRecord);
const record = (over: Record<string, unknown>): GeneratedImage =>
  (over as unknown as GeneratedImage);

type MediaRecord = Parameters<typeof createMediaElement>[0];
const mediaRecord = (over: Record<string, unknown>): MediaRecord =>
  (over as unknown as MediaRecord);

test('createMissingMediaPlaceholder labels by media type and escapes the filename', () => {
  const img = createMissingMediaPlaceholder('cat.png');
  assert.match(img, /Image could not be loaded: cat\.png/);

  const video = createMissingMediaPlaceholder('clip.mp4', 'video');
  assert.match(video, /Video could not be loaded: clip\.mp4/);

  const evil = createMissingMediaPlaceholder('<script>x</script>.png');
  assert.ok(!evil.includes('<script>'));
  assert.match(evil, /&lt;script&gt;/);
});

test('findMediaRecord returns the matching record or null', () => {
  const c = convo([{ filename: 'a.png' }, { filename: 'b.png' }]);
  assert.equal(findMediaRecord(c, 'b.png')?.filename, 'b.png');
  assert.equal(findMediaRecord(c, 'missing.png'), null);
});

test('findMediaRecord tolerates a conversation with no images array', () => {
  assert.equal(findMediaRecord(convo(undefined as unknown as unknown[]), 'a.png'), null);
});

test('resolveMediaSource returns empty for a null record', () => {
  assert.equal(resolveMediaSource(null, 'a.png', new Map()), '');
});

test('resolveMediaSource prefers a non-empty inline url', () => {
  const src = resolveMediaSource(record({ url: 'https://example.com/a.png' }), 'a.png', new Map());
  assert.equal(src, 'https://example.com/a.png');
});

test('resolveMediaSource falls back to the cached blob when stored in the DB', () => {
  const cache = new Map<string, string | Blob>([['pic.jpg', 'QUJD']]);
  const src = resolveMediaSource(record({ url: '   ', isStoredInDb: true }), 'pic.jpg', cache);
  assert.equal(src, 'data:image/jpeg;base64,QUJD');
});

test('resolveMediaSource returns empty when not stored or not cached', () => {
  assert.equal(resolveMediaSource(record({ url: '' }), 'a.png', new Map()), '');
  assert.equal(resolveMediaSource(record({ url: '', isStoredInDb: true }), 'a.png', new Map()), '');
});

test('createMediaElement builds a <video> with controls and dataset for video records', () => {
  const el = createMediaElement(
    mediaRecord({ mediaType: 'video', filename: 'clip.mp4', prompt: 'a clip', timestamp: 42 }),
    'blob:vid',
    'msg-1',
  ) as HTMLVideoElement;

  assert.equal(el.tagName, 'VIDEO');
  assert.equal(el.getAttribute('src'), 'blob:vid');
  assert.equal(el.className, 'generated-video-thumbnail');
  assert.equal(el.controls, true);
  assert.equal(el.dataset.mediaType, 'video');
  assert.equal(el.dataset.filename, 'clip.mp4');
  assert.equal(el.dataset.messageId, 'msg-1');
  assert.equal(el.dataset.prompt, 'a clip');
  assert.equal(el.dataset.timestamp, '42');
});

test('createMediaElement builds an <img> with prompt alt and dataset for image records', () => {
  const el = createMediaElement(
    mediaRecord({ mediaType: 'image', filename: 'cat.png', prompt: 'a cat', timestamp: 7 }),
    'blob:img',
    'msg-2',
  ) as HTMLImageElement;

  assert.equal(el.tagName, 'IMG');
  assert.equal(el.getAttribute('src'), 'blob:img');
  assert.equal(el.alt, 'a cat');
  assert.equal(el.className, 'generated-image-thumbnail');
  assert.equal(el.dataset.mediaType, 'image');
  assert.equal(el.dataset.filename, 'cat.png');
  assert.equal(el.dataset.messageId, 'msg-2');
  assert.equal(el.dataset.timestamp, '7');
});

test('createMediaElement falls back to a default alt and empty dataset when fields are missing', () => {
  const el = createMediaElement(mediaRecord({ mediaType: 'image' }), 'blob:x') as HTMLImageElement;

  assert.equal(el.alt, 'Generated Image');
  assert.equal(el.dataset.filename, '');
  assert.equal(el.dataset.messageId, '');
  assert.equal(el.dataset.prompt, '');
  assert.equal(el.dataset.timestamp, '');
});

test('hydrateMediaUrls resolves a url onto preloaded records and mirrors it into the data cache', () => {
  state.imageDataCache = new Map();
  const records = [
    record({ filename: 'pic.jpg', isStoredInDb: true }),
    record({ filename: 'kept.png', url: 'https://example.com/kept.png', isStoredInDb: true }),
    record({ filename: 'absent.png', isStoredInDb: true }),
  ] as unknown as GeneratedImage[];
  const cache = new Map<string, string | Blob>([['pic.jpg', 'QUJD'], ['kept.png', 'QUJD']]);

  hydrateMediaUrls(records, cache);

  assert.equal(records[0].url, 'data:image/jpeg;base64,QUJD');
  assert.equal(state.imageDataCache.get('pic.jpg'), 'data:image/jpeg;base64,QUJD');
  assert.equal(records[1].url, 'https://example.com/kept.png', 'an existing url is left alone');
  assert.equal(state.imageDataCache.has('kept.png'), false);
  assert.equal(records[2].url, undefined, 'a record with nothing preloaded stays unresolved');
});

test('hydrateMediaUrls skips records with no filename', () => {
  state.imageDataCache = new Map();
  const records = [record({ isStoredInDb: true })] as unknown as GeneratedImage[];
  hydrateMediaUrls(records, new Map([['', 'QUJD']]));
  assert.equal(records[0].url, undefined);
});
