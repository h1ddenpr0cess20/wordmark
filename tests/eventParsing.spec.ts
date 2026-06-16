import test from 'node:test';
import assert from 'node:assert/strict';

const { previewLines } = await import('../src/ts/services/streaming/eventParsing.js');

test('previewLines returns all lines when at or under the limit', () => {
  assert.deepEqual(previewLines('a\nb\nc', 3), ['a', 'b', 'c']);
  assert.deepEqual(previewLines('a\nb', 5), ['a', 'b']);
});

test('previewLines caps and appends a "more lines" marker when over the limit', () => {
  assert.deepEqual(previewLines('a\nb\nc\nd\ne', 2), ['a', 'b', '… (3 more lines)']);
});

test('previewLines handles single-line and empty input', () => {
  assert.deepEqual(previewLines('solo', 1), ['solo']);
  assert.deepEqual(previewLines('', 5), ['']);
});
