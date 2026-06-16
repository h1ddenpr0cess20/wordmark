import test from 'node:test';
import assert from 'node:assert/strict';

const {
  isCodeInterpreterName,
  looksLikeFileId,
  inferSubtype,
  extractFileId,
  buildAttachmentFromObject,
} = await import('../src/ts/services/streaming/codeInterpreterParse.js');

test('isCodeInterpreterName recognizes the known aliases only', () => {
  assert.equal(isCodeInterpreterName('code_interpreter'), true);
  assert.equal(isCodeInterpreterName('Python'), true);
  assert.equal(isCodeInterpreterName('code-interpreter'), true);
  assert.equal(isCodeInterpreterName('web_search'), false);
  assert.equal(isCodeInterpreterName(42), false);
});

test('looksLikeFileId matches provider file-id shapes', () => {
  assert.equal(looksLikeFileId('cfile_abc123'), true);
  assert.equal(looksLikeFileId('file_XYZ9'), true);
  assert.equal(looksLikeFileId('cfile_'), false);
  assert.equal(looksLikeFileId('random'), false);
  assert.equal(looksLikeFileId(null), false);
});

test('inferSubtype detects images by type or MIME, else file', () => {
  assert.equal(inferSubtype('image_file', null), 'image');
  assert.equal(inferSubtype(null, 'image/png'), 'image');
  assert.equal(inferSubtype('logs', 'text/plain'), 'file');
  assert.equal(inferSubtype(null, null), 'file');
});

test('extractFileId scans known id keys for a file-id-shaped value', () => {
  assert.equal(extractFileId({ file_id: 'cfile_a1' }), 'cfile_a1');
  assert.equal(extractFileId({ id: 'file_b2' }), 'file_b2');
  assert.equal(extractFileId({ id: 'not-an-id' }), null);
  assert.equal(extractFileId('nope'), null);
});

test('buildAttachmentFromObject builds an attachment or returns null', () => {
  const att = buildAttachmentFromObject(
    { file_id: 'cfile_a1', mime_type: 'image/png', filename: 'plot.png', bytes: 1024, container_id: 'c1', type: 'image' },
    'call-7',
  );
  assert.equal(att?.kind, 'attachment');
  assert.equal(att?.fileId, 'cfile_a1');
  assert.equal(att?.subtype, 'image');
  assert.equal(att?.mimeType, 'image/png');
  assert.equal(att?.filename, 'plot.png');
  assert.equal(att?.bytes, 1024);
  assert.equal(att?.containerId, 'c1');
  assert.equal(att?.callId, 'call-7');
  assert.equal(att?.status, 'pending');

  assert.equal(buildAttachmentFromObject({ foo: 'bar' }, null), null);
  // size falls back when bytes absent
  assert.equal(buildAttachmentFromObject({ id: 'file_z', size: 50 }, null)?.bytes, 50);
});
