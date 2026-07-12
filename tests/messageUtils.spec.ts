import test from 'node:test';
import assert from 'node:assert/strict';
import { state } from '../src/ts/init/state.js';

globalThis.window = globalThis.window || {};

const {
  serializeMessagesForRequest,
} = await import('../src/ts/services/api/messageUtils.js');
const {
  estimateTokens,
  estimateMessageTokens,
  windowMessagesByTokenBudget,
} = await import('../src/ts/services/api/tokenBudget.js');

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
  const big = 'x'.repeat(400);
  const messages = [
    { role: 'user', content: big },
    { role: 'assistant', content: big },
    { role: 'user', content: big },
  ];
  const result = windowMessagesByTokenBudget(messages, 220);
  assert.equal(result.length, 2, 'only the two newest should fit');
  assert.equal(result[0], messages[1]);
  assert.equal(result[1], messages[2]);
});

test('windowMessagesByTokenBudget always keeps the latest message even if it alone exceeds budget', () => {
  const huge = 'x'.repeat(4000);
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
  assert.equal(estimateMessageTokens({ role: 'user', content: '12345678' }), 6);
});

test('estimateMessageTokens handles array, object, and empty content', () => {
  assert.equal(
    estimateMessageTokens({ role: 'assistant', content: [{ text: 'hello' }, { output: 'world' }] }),
    7,
  );
  assert.equal(estimateMessageTokens({ role: 'assistant', content: { text: 'abcd' } }), 5);
  assert.equal(estimateMessageTokens({ role: 'user' }), 4);
  assert.equal(estimateMessageTokens(null as never), 0);
  assert.equal(estimateMessageTokens('nope' as never), 0);
});

test('serializeMessagesForRequest returns [] for non-array input and drops invalid entries', () => {
  assert.deepEqual(serializeMessagesForRequest(undefined), []);
  assert.deepEqual(serializeMessagesForRequest('nope' as never), []);
  const result = serializeMessagesForRequest([null, 'x', { role: 'assistant', content: 'ok' }] as never);
  assert.equal(result.length, 1);
  assert.equal(result[0].content, 'ok');
});

test('serializeMessagesForRequest preserves envelope fields and passes assistant string content through', () => {
  const result = serializeMessagesForRequest([
    { role: 'assistant', type: 'message', name: 'bot', content: 'plain reply' },
  ]);
  assert.deepEqual(result[0], { role: 'assistant', type: 'message', name: 'bot', content: 'plain reply' });
});

test('serializeMessagesForRequest strips media placeholders from assistant content', () => {
  const result = serializeMessagesForRequest([
    { role: 'assistant', content: '[[MEDIA: generated-1.png]]\n[[IMAGE: generated-2.png]]\n\nHere is your image.' },
    { role: 'assistant', content: '[[MEDIA: generated-3.png]]' },
  ]);
  assert.equal(result[0].content, 'Here is your image.');
  assert.equal(result[1].content, '(generated media attached)');
});

test('serializeMessagesForRequest splices retrievedContext into user messages at request time', () => {
  const result = serializeMessagesForRequest([
    { role: 'user', content: 'summarize the doc', retrievedContext: 'Relevant context from attached documents:\n\n[From a.pdf]\nchunk' },
    { role: 'user', content: [{ type: 'input_text', text: 'hi' }], retrievedContext: 'ctx' },
  ]);
  assert.equal(result[0].content, 'summarize the doc\n\nRelevant context from attached documents:\n\n[From a.pdf]\nchunk');
  assert.deepEqual(result[1].content, [
    { type: 'input_text', text: 'hi' },
    { type: 'input_text', text: 'ctx' },
  ]);
});

test('serializeMessagesForRequest passes through tool-call fields', () => {
  const result = serializeMessagesForRequest([
    {
      type: 'function_call',
      arguments: '{"a":1}',
      call_id: 'c1',
      output: 'done',
      tool_call_id: 't1',
    },
  ]);
  assert.deepEqual(result[0], {
    type: 'function_call',
    arguments: '{"a":1}',
    call_id: 'c1',
    output: 'done',
    tool_call_id: 't1',
  });
});

test('serializeMessagesForRequest normalizes array string parts and copies object parts', () => {
  const objectPart = { type: 'output_text', text: 'kept' };
  const result = serializeMessagesForRequest([
    { role: 'assistant', content: ['loose string', objectPart] },
  ] as never);
  assert.deepEqual(result[0].content, [
    { type: 'output_text', text: 'loose string' },
    { type: 'output_text', text: 'kept' },
  ]);
  assert.notEqual(result[0].content[1], objectPart);
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
