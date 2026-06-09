import test from 'node:test';
import assert from 'node:assert/strict';
import { state } from '../src/ts/init/state.js';

globalThis.window = globalThis.window || {};

const {
  serializeMessagesForRequest,
  estimateTokens,
  estimateMessageTokens,
  windowMessagesByTokenBudget,
} = await import('../src/ts/services/api/messageUtils.js');

test('windowMessagesByTokenBudget returns all messages when budget is 0 (no limit)', () => {
  const messages = [
    { role: 'user', content: 'one' },
    { role: 'assistant', content: 'two' },
  ];
  const result = windowMessagesByTokenBudget(messages, 0);
  assert.deepEqual(result, messages);
  assert.notEqual(result, messages, 'should return a copy, not the same array');
});

test('windowMessagesByTokenBudget drops oldest messages first when over budget', () => {
  const big = 'x'.repeat(400); // ~100 tokens each + overhead
  const messages = [
    { role: 'user', content: big },      // oldest
    { role: 'assistant', content: big },
    { role: 'user', content: big },      // newest
  ];
  const result = windowMessagesByTokenBudget(messages, 220);
  assert.equal(result.length, 2, 'only the two newest should fit');
  assert.equal(result[0], messages[1]);
  assert.equal(result[1], messages[2]);
});

test('windowMessagesByTokenBudget always keeps the latest message even if it alone exceeds budget', () => {
  const huge = 'x'.repeat(4000); // ~1000 tokens
  const messages = [
    { role: 'user', content: 'older' },
    { role: 'user', content: huge },
  ];
  const result = windowMessagesByTokenBudget(messages, 10);
  assert.equal(result.length, 1);
  assert.equal(result[0], messages[1]);
});

test('estimateTokens and estimateMessageTokens use the ~4 chars/token heuristic', () => {
  assert.equal(estimateTokens('12345678'), 2);
  assert.equal(estimateTokens(''), 0);
  // 8 chars -> 2 tokens, + 4 overhead
  assert.equal(estimateMessageTokens({ role: 'user', content: '12345678' }), 6);
});

test('serializeMessagesForRequest includes input_image parts for inline attachments', () => {
  state.imageDataCache = new Map();
  state.generatedImages = [];

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

test('serializeMessagesForRequest passes through input_file parts for xAI file attachments', () => {
  state.imageDataCache = new Map();
  state.generatedImages = [];

  const [serialized] = serializeMessagesForRequest([{
    role: 'user',
    content: [
      { type: 'input_text', text: 'Summarize this document.' },
      { type: 'input_file', file_id: 'file-abc123' },
      { type: 'input_file', file_id: 'file-def456' },
    ],
  }]);

  assert.ok(Array.isArray(serialized.content), 'content should be an array');
  assert.equal(serialized.content.length, 3, 'should have three content parts');

  const textPart = serialized.content.find(part => part.type === 'input_text');
  assert.ok(textPart, 'expected an input_text part');
  assert.equal(textPart.text, 'Summarize this document.');

  const fileParts = serialized.content.filter(part => part.type === 'input_file');
  assert.equal(fileParts.length, 2, 'expected two input_file parts');
  assert.equal(fileParts[0].file_id, 'file-abc123');
  assert.equal(fileParts[1].file_id, 'file-def456');
});

test('serializeMessagesForRequest resolves gallery placeholders to input_image parts', () => {
  state.imageDataCache = new Map();
  state.generatedImages = [{
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
