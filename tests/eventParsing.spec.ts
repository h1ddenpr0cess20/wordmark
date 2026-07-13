import test from 'node:test';
import assert from 'node:assert/strict';

const { previewLines, formatArgsBlock } = await import('../src/ts/services/streaming/eventParsing.js');

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

test('formatArgsBlock keeps a long single-line string value instead of dropping it', () => {
  const prompt = `A sprawling cyberpunk cityscape at dusk, ${'neon reflections on wet asphalt, '.repeat(40)}ultra detailed`;
  const block = formatArgsBlock(JSON.stringify({ prompt }));
  assert.ok(block.includes('A sprawling cyberpunk cityscape'), 'prompt start should be present');
  assert.ok(block.includes('neon reflections'), 'prompt body should be present, not dropped at the line boundary');
});

test('formatArgsBlock truncates past the budget with an ellipsis instead of losing the line', () => {
  const prompt = 'x'.repeat(5000);
  const block = formatArgsBlock(JSON.stringify({ prompt }));
  assert.ok(block.length < 4100, 'block should be capped near the budget');
  assert.ok(block.endsWith('…'), 'truncation should be marked');
  assert.ok(block.includes('x'.repeat(100)), 'a substantial prefix of the value should survive');
});

test('formatArgsBlock prefers a line-boundary cut when lines are short', () => {
  const args = Object.fromEntries(Array.from({ length: 400 }, (_, i) => [`key_${i}`, `value ${i}`]));
  const block = formatArgsBlock(JSON.stringify(args));
  const lines = block.split('\n');
  assert.equal(lines[lines.length - 1], '…', 'should end with a lone ellipsis line');
  assert.ok(lines[lines.length - 2].includes('key_'), 'preceding line should be an intact JSON line');
});

test('formatArgsBlock stubs data-URI values', () => {
  const dataUri = `data:image/png;base64,${'A'.repeat(500)}`;
  const block = formatArgsBlock(JSON.stringify({ prompt: 'make it blue', image_urls: [dataUri] }));
  assert.ok(block.includes('make it blue'));
  assert.ok(!block.includes('A'.repeat(100)), 'base64 payload should not be dumped');
  assert.ok(block.includes(`(${dataUri.length} chars)`), 'stub should note the original length');
});

test('formatArgsBlock keeps short data URIs and non-JSON args intact', () => {
  const shortUri = 'data:text/plain;base64,aGk=';
  const block = formatArgsBlock(JSON.stringify({ image_url: shortUri }));
  assert.ok(block.includes(shortUri));
  assert.equal(formatArgsBlock('plain text args'), 'plain text args');
  assert.equal(formatArgsBlock(''), '');
  assert.equal(formatArgsBlock('{}'), '');
});
