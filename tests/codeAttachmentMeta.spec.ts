import test from 'node:test';
import assert from 'node:assert/strict';

const {
  fallbackFilename,
  formatBytes,
  describeAttachment,
  parseContentDispositionFilename,
  guessExtension,
} = await import('../src/ts/services/streaming/codeAttachmentMeta.js');

type Attachment = Parameters<typeof describeAttachment>[0];
const asAttachment = (a: unknown): Attachment => a as Attachment;

test('fallbackFilename prefers filename, then fileId, then positional default', () => {
  assert.equal(fallbackFilename(asAttachment({ filename: 'plot.png', fileId: 'f1' }), 0), 'plot.png');
  assert.equal(fallbackFilename(asAttachment({ fileId: 'file-abc' }), 0), 'file-abc');
  assert.equal(fallbackFilename(asAttachment({}), 2), 'code-output-3');
  assert.equal(fallbackFilename(asAttachment({}), null), 'code-output-1');
});

test('formatBytes renders human-readable sizes and rejects invalid input', () => {
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(2048), '2.0 KB');
  assert.equal(formatBytes(15 * 1024), '15 KB'); // >= 10 drops the decimal
  assert.equal(formatBytes(5 * 1024 * 1024), '5.0 MB');
  assert.equal(formatBytes(-1), null);
  assert.equal(formatBytes('x'), null);
  assert.equal(formatBytes(NaN), null);
});

test('describeAttachment joins present fields with bullets', () => {
  assert.equal(
    describeAttachment(asAttachment({ mimeType: 'image/png', bytes: 2048, fileId: 'f1' })),
    'image/png • 2.0 KB • f1',
  );
  assert.equal(describeAttachment(asAttachment({ mimeType: 'text/csv' })), 'text/csv');
  assert.equal(describeAttachment(asAttachment({})), '');
});

test('parseContentDispositionFilename handles both header forms', () => {
  assert.equal(parseContentDispositionFilename('attachment; filename="chart.png"'), 'chart.png');
  assert.equal(parseContentDispositionFilename("attachment; filename*=UTF-8''my%20file.csv"), 'my file.csv');
  assert.equal(parseContentDispositionFilename('attachment'), null);
  assert.equal(parseContentDispositionFilename(null), null);
});

test('guessExtension maps known MIME types and returns "" otherwise', () => {
  assert.equal(guessExtension('image/png'), '.png');
  assert.equal(guessExtension('image/jpeg'), '.jpg');
  assert.equal(guessExtension('application/json'), '.json');
  assert.equal(guessExtension('text/plain'), '.txt');
  assert.equal(guessExtension('application/octet-stream'), '');
  assert.equal(guessExtension(undefined), '');
});
