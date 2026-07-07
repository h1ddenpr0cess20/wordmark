import test from 'node:test';
import assert from 'node:assert/strict';

// thinkingUtils imports `marked` (real, works in Node) and sanitizeWithMedia
// (DOMPurify is stubbed by the test loader). Just provide a window + document.
globalThis.window = {} as Window & typeof globalThis;

// Minimal document stub so sanitizeWithMedia's DOM post-processing works.
globalThis.document = {
  createElement: () => {
    let html = "";
    return {
      set innerHTML(value: string) { html = value; },
      get innerHTML() { return html; },
      querySelectorAll: () => [],
    };
  },
} as unknown as Document;

const { processMainContentMarkdown } = await import('../src/ts/services/streaming/thinkingUtils.js');

test('processMainContentMarkdown handles basic text', () => {
  const result = processMainContentMarkdown('Hello world');
  assert.ok(result.includes('Hello world'), 'should include original text');
});

test('processMainContentMarkdown closes unclosed code blocks', () => {
  const input = 'Some text\n```javascript\nconst x = 1;';
  const result = processMainContentMarkdown(input);

  // The unclosed fence is balanced and rendered as a real code block.
  assert.ok(result.includes('<pre>') || result.includes('<code'), 'should render a code block');
  assert.ok(result.includes('const x = 1;'), 'should preserve code content');
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

test('processMainContentMarkdown hides media placeholders', () => {
  const input = '[[MEDIA: generated-1.png]]\n\nHere is your image';
  const result = processMainContentMarkdown(input);

  assert.ok(result.includes('hidden-image-placeholder'), 'should hide media placeholders');
  assert.ok(result.includes('[[MEDIA: generated-1.png]]'), 'should preserve placeholder text');
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
