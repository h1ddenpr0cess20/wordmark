import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis.window || {};
(globalThis.window as unknown as { atob: typeof atob }).atob = atob;

const {
  isVideoMimeType,
  detectMediaType,
  makeFilename,
  buildMediaRecordHtml,
  getMediaDisplayUrl,
  decodeDataUri,
} = await import('../src/ts/services/mediaTools.js');
const {
  inferMimeTypeFromFilename,
} = await import('../src/ts/services/mediaType.js');

type MediaRecord = Parameters<typeof buildMediaRecordHtml>[0];
const asRecord = (r: unknown): MediaRecord => r as MediaRecord;

test('isVideoMimeType matches only video/* mime types', () => {
  assert.equal(isVideoMimeType('video/mp4'), true);
  assert.equal(isVideoMimeType('VIDEO/WEBM'), true);
  assert.equal(isVideoMimeType('image/png'), false);
  assert.equal(isVideoMimeType(''), false);
  assert.equal(isVideoMimeType('application/octet-stream'), false);
});

test('inferMimeTypeFromFilename maps each known extension and defaults to image/png', () => {
  assert.equal(inferMimeTypeFromFilename('clip.mp4'), 'video/mp4');
  assert.equal(inferMimeTypeFromFilename('clip.m4v'), 'video/mp4');
  assert.equal(inferMimeTypeFromFilename('clip.mov'), 'video/quicktime');
  assert.equal(inferMimeTypeFromFilename('clip.webm'), 'video/webm');
  assert.equal(inferMimeTypeFromFilename('photo.jpg'), 'image/jpeg');
  assert.equal(inferMimeTypeFromFilename('photo.jpeg'), 'image/jpeg');
  assert.equal(inferMimeTypeFromFilename('photo.webp'), 'image/webp');
  assert.equal(inferMimeTypeFromFilename('anim.gif'), 'image/gif');
  assert.equal(inferMimeTypeFromFilename('photo.png'), 'image/png');
  // case-insensitive, and unknown/empty/missing extensions default to image/png
  assert.equal(inferMimeTypeFromFilename('CLIP.MP4'), 'video/mp4');
  assert.equal(inferMimeTypeFromFilename('document.txt'), 'image/png');
  assert.equal(inferMimeTypeFromFilename('noextension'), 'image/png');
  assert.equal(inferMimeTypeFromFilename(''), 'image/png');
  assert.equal(inferMimeTypeFromFilename(), 'image/png');
});

test('makeFilename picks the extension matching the mime type', () => {
  const cases: Array<[string, string]> = [
    ['image/jpeg', 'jpg'],
    ['image/webp', 'webp'],
    ['image/gif', 'gif'],
    ['image/png', 'png'],
    ['video/webm', 'webm'],
    ['video/quicktime', 'mov'],
    ['video/mp4', 'mp4'],
  ];
  for (const [mimeType, ext] of cases) {
    const name = makeFilename('shot', mimeType);
    assert.match(name, new RegExp(`^shot-\\d+-[a-z0-9]+\\.${ext}$`), `${mimeType} -> .${ext}`);
  }
});

test('makeFilename defaults unknown video mime types to mp4 and unknown image types to png', () => {
  assert.match(makeFilename('clip', 'video/x-matroska'), /\.mp4$/);
  assert.match(makeFilename('pic', 'application/octet-stream'), /\.png$/);
});

test('makeFilename falls back to the media-type prefix when none is given', () => {
  assert.match(makeFilename('', 'video/mp4'), /^video-\d+-[a-z0-9]+\.mp4$/);
  assert.match(makeFilename('', 'image/png'), /^image-\d+-[a-z0-9]+\.png$/);
});

test('makeFilename mints distinct names on successive calls', () => {
  const a = makeFilename('shot', 'image/png');
  const b = makeFilename('shot', 'image/png');
  assert.notEqual(a, b);
});

test('detectMediaType honors an explicit media type first', () => {
  assert.equal(detectMediaType({ mediaType: 'Video' }), 'video');
  assert.equal(detectMediaType({ mediaType: ' image ' }), 'image');
  // explicit but invalid value falls through to other signals
  assert.equal(detectMediaType({ mediaType: 'audio', mimeType: 'video/mp4' }), 'video');
});

test('detectMediaType infers from mime type then filename then url', () => {
  assert.equal(detectMediaType({ mimeType: 'video/webm' }), 'video');
  assert.equal(detectMediaType({ mimeType: 'image/png' }), 'image');
  assert.equal(detectMediaType({ filename: 'clip.mov' }), 'video');
  assert.equal(detectMediaType({ filename: 'photo.jpg' }), 'image');
  assert.equal(detectMediaType({ url: 'data:video/mp4;base64,AAAA' }), 'video');
  assert.equal(detectMediaType({}), 'image');
});

test('buildMediaRecordHtml renders an img for images and a video for videos', () => {
  const imgHtml = buildMediaRecordHtml(
    asRecord({ url: 'https://example.com/a.png', filename: 'a.png', prompt: 'a cat', timestamp: 't1' }),
  );
  assert.match(imgHtml, /^<img /);
  assert.match(imgHtml, /class="generated-image-thumbnail"/);
  assert.match(imgHtml, /data-media-type="image"/);
  assert.match(imgHtml, /alt="a cat"/);

  const videoHtml = buildMediaRecordHtml(
    asRecord({ url: 'https://example.com/a.mp4', filename: 'a.mp4', mediaType: 'video', prompt: 'a dog', timestamp: 't2' }),
  );
  assert.match(videoHtml, /^<video /);
  assert.match(videoHtml, /class="generated-video-thumbnail"/);
  assert.match(videoHtml, /data-media-type="video"/);
  assert.match(videoHtml, /controls/);
});

test('buildMediaRecordHtml escapes attacker-controlled fields', () => {
  const html = buildMediaRecordHtml(
    asRecord({
      url: 'https://example.com/x.png"><script>alert(1)</script>',
      filename: 'evil".png',
      prompt: '"><img src=x onerror=alert(1)>',
      timestamp: 't"3',
    }),
  );
  // No raw quote-breakouts or tags survive into the markup
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('onerror=alert(1)>'));
  assert.ok(!html.includes('"><'));
  assert.match(html, /&lt;script&gt;|&lt;img/);
  assert.match(html, /&quot;/);
});

test('getMediaDisplayUrl passes through usable urls and wraps bare base64', () => {
  assert.equal(getMediaDisplayUrl(''), '');
  assert.equal(getMediaDisplayUrl('https://example.com/a.png'), 'https://example.com/a.png');
  assert.equal(getMediaDisplayUrl('data:image/png;base64,AAAA'), 'data:image/png;base64,AAAA');
  assert.equal(getMediaDisplayUrl('blob:foo'), 'blob:foo');
  assert.equal(getMediaDisplayUrl('/local/path.png'), '/local/path.png');
  // a bare base64 payload is wrapped using the filename-inferred mime type
  assert.equal(getMediaDisplayUrl('QUJD', 'pic.jpg'), 'data:image/jpeg;base64,QUJD');
  assert.equal(getMediaDisplayUrl('QUJD', 'clip.webm'), 'data:video/webm;base64,QUJD');
});

test('decodeDataUri decodes payload and preserves the declared mime type', async () => {
  const blob = decodeDataUri('data:image/png;base64,QUJD');
  assert.equal(blob.type, 'image/png');
  assert.equal(await blob.text(), 'ABC');
});

test('decodeDataUri defaults the mime type when the header omits one', async () => {
  const blob = decodeDataUri('data:;base64,QUJD');
  assert.equal(blob.type, 'application/octet-stream');
  assert.equal(await blob.text(), 'ABC');
});

test('decodeDataUri throws a clear error on malformed base64', () => {
  assert.throws(
    () => decodeDataUri('data:image/png;base64,@@@@'),
    /Malformed data URI/,
  );
});
