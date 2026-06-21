import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extractOutputText,
  extractReasoningText,
} from '../src/ts/services/streaming/finalizeExtract.js';

test('extractOutputText returns empty for non-record payloads', () => {
  assert.equal(extractOutputText(null), '');
  assert.equal(extractOutputText(undefined), '');
  assert.equal(extractOutputText('text'), '');
  assert.equal(extractOutputText(42), '');
});

test('extractOutputText joins output_text items, preferring text over content', () => {
  const payload = {
    output: [
      { type: 'output_text', text: 'Hello ' },
      { type: 'output_text', content: 'world' },
      { type: 'reasoning', text: 'ignored' },
      { type: 'output_text', text: '', content: '!' },
    ],
  };
  assert.equal(extractOutputText(payload), 'Hello world!');
});

test('extractOutputText handles output_text string and array shapes', () => {
  assert.equal(extractOutputText({ output_text: 'direct' }), 'direct');
  assert.equal(extractOutputText({ output_text: ['a', 'b', 'c'] }), 'abc');
});

test('extractOutputText returns empty when no recognizable text is present', () => {
  assert.equal(extractOutputText({}), '');
  assert.equal(extractOutputText({ output: [{ type: 'reasoning', text: 'x' }] }), '');
});

test('extractReasoningText returns empty for non-record payloads', () => {
  assert.equal(extractReasoningText(null), '');
  assert.equal(extractReasoningText('text'), '');
});

test('extractReasoningText reads a plain reasoning string', () => {
  assert.equal(extractReasoningText({ reasoning: 'because' }), 'because');
});

test('extractReasoningText joins a reasoning array of content objects', () => {
  const payload = { reasoning: [{ content: 'a' }, { content: 'b' }, { other: 'skip' }] };
  assert.equal(extractReasoningText(payload), 'ab');
});

test('extractReasoningText reads reasoning.output content', () => {
  const payload = { reasoning: { output: [{ content: 'step1' }, { content: 'step2' }] } };
  assert.equal(extractReasoningText(payload), 'step1step2');
});

test('extractReasoningText reads reasoning_content string and array shapes', () => {
  assert.equal(extractReasoningText({ reasoning_content: 'plain' }), 'plain');
  assert.equal(
    extractReasoningText({ reasoning_content: ['x', { text: 'y' }, { content: 'z' }, 5] }),
    'xyz',
  );
});

test('extractReasoningText falls back to reasoning.content after reasoning_content', () => {
  assert.equal(extractReasoningText({ reasoning: { content: 'fallback' } }), 'fallback');
  assert.equal(
    extractReasoningText({ reasoning: { content: 'low' }, reasoning_content: 'high' }),
    'high',
  );
});

test('extractReasoningText returns empty when nothing matches', () => {
  assert.equal(extractReasoningText({}), '');
  assert.equal(extractReasoningText({ reasoning: { unrelated: true } }), '');
});
