import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { loadWindowScript } from './helpers/loadWindowScript.js';

function createLocalStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

function loadExportModule({ storage, windowOverrides = {}, document, URL: urlStub, globals = {} }) {
  const modulePath = path.resolve('src/js/services/export.js');
  return loadWindowScript(modulePath, {
    window: { ...windowOverrides },
    document,
    URL: urlStub,
    globals: {
      localStorage: storage,
      ...globals,
    },
  });
}

test('handleExportFormatChange normalises aliases and persists preference', () => {
  const storage = createLocalStorage();
  const exportFormatSelector = { value: 'markdown' };

  const windowObj = loadExportModule({
    storage,
    windowOverrides: {
      exportFormatSelector,
    },
  });

  const event = { target: exportFormatSelector };
  windowObj.handleExportFormatChange(event);

  assert.equal(storage.getItem('chatExportFormat'), 'md');
  assert.equal(exportFormatSelector.value, 'md');
});

test('initializeExportControls applies stored preference aliases', () => {
  const storage = createLocalStorage({
    chatExportFormat: 'plaintext',
  });
  const exportFormatSelector = { value: '' };

  const windowObj = loadExportModule({
    storage,
    windowOverrides: {
      exportFormatSelector,
    },
  });

  windowObj.initializeExportControls();
  assert.equal(exportFormatSelector.value, 'txt');
});

test('exportChat builds markdown export, dedupes reasoning, and triggers download', async () => {
  const storage = createLocalStorage();
  const exportFormatSelector = { value: 'markdown' };
  const includeThinking = { checked: true };
  const appendedNodes = [];
  const removedNodes = [];
  let capturedBlob = null;
  let clickedAnchor = null;

  const documentStub = {
    body: {
      appendChild(node) {
        appendedNodes.push(node);
      },
      removeChild(node) {
        removedNodes.push(node);
      },
    },
    getElementById(id) {
      if (id === 'include-thinking') {
        return includeThinking;
      }
      return null;
    },
    createElement(tag) {
      if (tag === 'a') {
        const anchor = {
          href: '',
          download: '',
          click() {
            clickedAnchor = this;
          },
        };
        return anchor;
      }
      return {};
    },
  };

  const urlCalls = {
    create: [],
    revoke: [],
  };

  const urlStub = {
    createObjectURL(blob) {
      capturedBlob = blob;
      urlCalls.create.push(blob);
      return 'blob:mock';
    },
    revokeObjectURL(url) {
      urlCalls.revoke.push(url);
    },
  };

  const windowObj = loadExportModule({
    storage,
    document: documentStub,
    URL: urlStub,
    windowOverrides: {
      exportFormatSelector,
      conversationHistory: [
        {
          role: 'user',
          content: 'Hello assistant',
          reasoning: [],
          timestamp: '2024-01-01T10:00:00Z',
        },
        {
          role: 'assistant',
          content: 'Hi human!',
          reasoning: ['First thought', 'First thought', 'Second thought'],
          timestamp: '2024-01-01T10:00:05Z',
        },
      ],
    },
  });

  windowObj.exportChat();

  assert.equal(storage.getItem('chatExportFormat'), 'md');
  assert.equal(appendedNodes.length, 1);
  assert.ok(clickedAnchor);
  assert.equal(appendedNodes[0], clickedAnchor);
  assert.equal(removedNodes.length, 1);
  assert.equal(removedNodes[0], clickedAnchor);
  assert.equal(clickedAnchor.href, 'blob:mock');
  assert.ok(clickedAnchor.download.endsWith('.md'));

  assert.equal(urlCalls.create.length, 1);
  assert.equal(urlCalls.revoke.length, 1);
  assert.equal(urlCalls.revoke[0], 'blob:mock');

  assert.ok(capturedBlob);
  const blobText = await capturedBlob.text();
  assert.ok(blobText.includes('# Chat Export ('));
  assert.ok(blobText.includes('### You'));
  assert.ok(blobText.includes('### Assistant'));
  assert.ok(blobText.includes('#### Reasoning'));

  const reasoningMatches = blobText.match(/First thought/g) || [];
  assert.equal(reasoningMatches.length, 1);
  assert.ok(blobText.includes('Second thought'));
});
