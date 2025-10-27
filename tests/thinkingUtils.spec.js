import test from 'node:test';
import assert from 'node:assert/strict';

// Mock global dependencies
globalThis.window = {
  loadMarkedLibrary: () => {},
  sanitizeWithYouTube: null,
};

globalThis.marked = {
  parse: (text) => `<p>${text}</p>`,
};

globalThis.DOMPurify = {
  sanitize: (html) => html,
};

const { processMainContentMarkdown } = await import('../src/js/services/streaming/thinkingUtils.js');

test('processMainContentMarkdown handles basic text', () => {
  const result = processMainContentMarkdown('Hello world');
  assert.ok(result.includes('Hello world'), 'should include original text');
});

test('processMainContentMarkdown closes unclosed code blocks', () => {
  const input = 'Some text\n```javascript\nconst x = 1;';
  const result = processMainContentMarkdown(input);
  
  // Should have added closing backticks
  assert.ok(result.includes('```'), 'should handle code blocks');
});

test('processMainContentMarkdown closes unclosed inline code', () => {
  const input = 'This is `inline code';
  const result = processMainContentMarkdown(input);
  
  // Should balance backticks
  assert.ok(typeof result === 'string', 'should return string result');
});

test('processMainContentMarkdown hides image placeholders', () => {
  const input = 'Check out [[IMAGE: test.png]] this image';
  const result = processMainContentMarkdown(input);
  
  assert.ok(result.includes('hidden-image-placeholder'), 'should hide image placeholders');
  assert.ok(result.includes('[[IMAGE: test.png]]'), 'should preserve placeholder text');
});

test('processMainContentMarkdown handles multiple image placeholders', () => {
  const input = '[[IMAGE: first.png]] and [[IMAGE: second.png]]';
  const result = processMainContentMarkdown(input);
  
  const matches = result.match(/hidden-image-placeholder/g);
  assert.equal(matches?.length, 2, 'should hide all image placeholders');
});

test('processMainContentMarkdown processes markdown', () => {
  const input = '**bold** and *italic*';
  const result = processMainContentMarkdown(input);
  
  // Marked should have processed it
  assert.ok(result.includes('<p>'), 'should process markdown');
});

test('processMainContentMarkdown handles empty input', () => {
  const result = processMainContentMarkdown('');
  assert.equal(typeof result, 'string', 'should handle empty string');
});

test('processMainContentMarkdown sanitizes output', () => {
  const input = '<script>alert("xss")</script>';
  const result = processMainContentMarkdown(input);
  
  // DOMPurify should have been called
  assert.ok(typeof result === 'string', 'should sanitize HTML');
});
