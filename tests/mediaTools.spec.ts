import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis.window || {};

const {
  isVideoMimeType,
  detectMediaType,
  buildMediaRecordHtml,
  getMediaDisplayUrl,
} = await import('../src/ts/services/mediaTools.js');

type MediaRecord = Parameters<typeof buildMediaRecordHtml>[0];
const asRecord = (r: unknown): MediaRecord => r as MediaRecord;

test('isVideoMimeType matches only video/* mime types', () => {
  assert.equal(isVideoMimeType('video/mp4'), true);
  assert.equal(isVideoMimeType('VIDEO/WEBM'), true);
  assert.equal(isVideoMimeType('image/png'), false);
  assert.equal(isVideoMimeType(''), false);
  assert.equal(isVideoMimeType('application/octet-stream'), false);
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
