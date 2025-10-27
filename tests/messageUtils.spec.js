import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis.window || {};

const { serializeMessagesForRequest } = await import('../src/js/services/api/messageUtils.js');

test('serializeMessagesForRequest includes input_image parts for inline attachments', () => {
  window.imageDataCache = new Map();
  window.generatedImages = [];

  const attachments = [{
    filename: 'upload-123.png',
    dataUrl: 'data:image/png;base64,QUJD',
    mimeType: 'image/png',
  }];

  const [serialized] = serializeMessagesForRequest([{
    role: 'user',
    content: 'Please describe this upload.',
    attachments,
  }]);

  assert.ok(Array.isArray(serialized.content), 'content should be an array for multimodal payloads');

  const imagePart = serialized.content.find(part => part.type === 'input_image');
  assert.ok(imagePart, 'expected an input_image part');
  assert.equal(imagePart.image_url, 'data:image/png;base64,QUJD');

  const textPart = serialized.content.find(part => part.type === 'input_text');
  assert.ok(textPart, 'expected an input_text part');
  assert.equal(textPart.text, 'Please describe this upload.');
});

test('serializeMessagesForRequest resolves gallery placeholders to input_image parts', () => {
  window.imageDataCache = new Map();
  window.generatedImages = [{
    filename: 'generated-456.png',
    url: 'data:image/png;base64,SElK',
  }];

  const [serialized] = serializeMessagesForRequest([{
    role: 'user',
    content: '[[IMAGE: generated-456.png]]\n\nMake variations.',
  }]);

  assert.ok(Array.isArray(serialized.content), 'content should be an array for multimodal payloads');

  const imagePart = serialized.content.find(part => part.type === 'input_image');
  assert.ok(imagePart, 'expected an input_image part for gallery reference');
  assert.equal(imagePart.image_url, 'data:image/png;base64,SElK');

  const textPart = serialized.content.find(part => part.type === 'input_text');
  assert.ok(textPart, 'expected text content to remain');
  assert.equal(textPart.text, 'Make variations.');
});
