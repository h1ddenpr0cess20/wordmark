import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadWindowScript } from './helpers/loadWindowScript.js';

const utilsPath = path.resolve('src/js/utils/utils.js');

// Load the script once for all tests; it attaches functions onto window
const windowObj = loadWindowScript(utilsPath, {
  // Provide a minimal document stub for functions that might touch the DOM
  document: {
    getElementById: () => null,
    querySelectorAll: () => [],
  },
});

test('sanitizeInput escapes angle brackets', () => {
  const { sanitizeInput } = windowObj;
  const raw = '<script>alert(1)</script>'; // eslint-disable-line no-script-url
  const sanitized = sanitizeInput(raw);
  assert.equal(sanitized, '&lt;script&gt;alert(1)&lt;/script&gt;');
});

test('stripBase64FromHistory removes base64 and inserts placeholders', () => {
  const { stripBase64FromHistory } = windowObj;

  // Seed conversation history
  windowObj.conversationHistory = [
    {
      id: 'm1',
      role: 'user',
      content: 'here is an image data:image/png;base64,QUJDREVGR0g= end',
    },
  ];

  const placeholders = ['[[IMAGE: file1.png]]', '[[IMAGE: file2.png]]'];
  stripBase64FromHistory('m1', placeholders);

  const updated = windowObj.conversationHistory[0].content;
  // Placeholders are present and base64 strings are removed
  assert.ok(updated.includes('[[IMAGE: file1.png]]'));
  assert.ok(updated.includes('[[IMAGE: file2.png]]'));
  assert.ok(!/data:image\/[^;]+;base64,\S+/.test(updated));
});

test('stripBase64FromHistory caches attachment data and clears inline copies', () => {
  const { stripBase64FromHistory } = windowObj;
  windowObj.imageDataCache = new Map();

  windowObj.conversationHistory = [
    {
      id: 'm2',
      role: 'user',
      content: '[[IMAGE: sample.png]] description text',
      attachments: [
        {
          filename: 'sample.png',
          dataUrl: 'data:image/png;base64,QUJDREVGRw==',
          mimeType: 'image/png',
        },
      ],
    },
  ];

  stripBase64FromHistory('m2', ['[[IMAGE: sample.png]]']);

  const entry = windowObj.conversationHistory[0];
  assert.equal(entry.attachments[0].dataUrl, null);
  assert.equal(entry.attachments[0].inlineDataRemoved, true);
  assert.equal(windowObj.imageDataCache.get('sample.png'), 'data:image/png;base64,QUJDREVGRw==');
});

test('debounce limits rapid invocations to a single call', async () => {
  const { debounce } = windowObj;
  let count = 0;
  const debounced = debounce(() => { count++; }, 50);
  for (let i = 0; i < 5; i++) debounced();
  // Wait longer than debounce interval
  await new Promise(r => setTimeout(r, 80));
  assert.equal(count, 1);
});

test('toggleThinking toggles collapsed state and scrolls on expand', async () => {
  function fakeClassList(initial = []) {
    const set = new Set(initial);
    return {
      contains: (c) => set.has(c),
      add: (c) => void set.add(c),
      remove: (c) => void set.delete(c),
      toggle: (c) => (set.has(c) ? set.delete(c) : set.add(c)),
      toString: () => Array.from(set).join(' '),
    };
  }

  const nodes = new Map();
  const dom = {
    readyState: 'complete',
    body: { style: {} },
    getElementById: (id) => nodes.get(id) || null,
    querySelector: () => null,
    querySelectorAll: () => [],
  };

  const win = loadWindowScript(utilsPath, { document: dom });

  const contentDiv = { scrollTop: 5 };
  const node = {
    id: 'thinking-1',
    classList: fakeClassList(['thinking-container', 'collapsed']),
    querySelector: (sel) => (sel === '.thinking-content' ? contentDiv : null),
  };
  nodes.set('thinking-1', node);

  // Expand (was collapsed)
  win.toggleThinking('thinking-1', { stopPropagation() {}, preventDefault() {} });
  assert.equal(node.classList.contains('collapsed'), false);
  // Allow scroll logic to run
  await new Promise(r => setTimeout(r, 120));
  assert.equal(contentDiv.scrollTop, 0);

  // Collapse
  win.toggleThinking('thinking-1');
  assert.equal(node.classList.contains('collapsed'), true);
});

test('debugThinkingContainers handles no containers without throwing', () => {
  const { debugThinkingContainers } = windowObj;
  // Just ensure it runs without throwing
  debugThinkingContainers();
});
