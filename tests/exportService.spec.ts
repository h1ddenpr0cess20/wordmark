import test from 'node:test';
import assert from 'node:assert/strict';
import { state, elements } from '../src/ts/init/state.js';

function createLocalStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    getItem(key: string) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  } as unknown as Storage;
}

// export.js reads window.exportFormatSelector / window.conversationHistory and the
// bare globals localStorage, document, URL. Provide them on globalThis before import.
globalThis.window = {} as Window & typeof globalThis;
globalThis.localStorage = createLocalStorage();

const { handleExportFormatChange, initializeExportControls, exportChat } =
  await import('../src/ts/services/export.js');

test('handleExportFormatChange normalises aliases and persists preference', () => {
  const storage = createLocalStorage();
  globalThis.localStorage = storage;
  const exportFormatSelector = { value: 'markdown' };
  elements.exportFormatSelector = exportFormatSelector as unknown as HTMLSelectElement;

  handleExportFormatChange({ target: exportFormatSelector } as unknown as Event);

  assert.equal(storage.getItem('chatExportFormat'), 'md');
  assert.equal(exportFormatSelector.value, 'md');
});

test('initializeExportControls applies stored preference aliases', () => {
  globalThis.localStorage = createLocalStorage({ chatExportFormat: 'plaintext' });
  const exportFormatSelector = { value: '' };
  elements.exportFormatSelector = exportFormatSelector as unknown as HTMLSelectElement;

  initializeExportControls();
  assert.equal(exportFormatSelector.value, 'txt');
});

test('exportChat builds markdown export, dedupes reasoning, and triggers download', async () => {
  const storage = createLocalStorage();
  globalThis.localStorage = storage;
  const exportFormatSelector = { value: 'markdown' };
  const includeThinking = { checked: true };
  type FakeAnchor = { href: string; download: string; click(): void };
  const appendedNodes: unknown[] = [];
  const removedNodes: unknown[] = [];
  let capturedBlob: Blob | null = null;
  let clickedAnchor: FakeAnchor | null = null;

  globalThis.document = {
    body: {
      appendChild(node: unknown) { appendedNodes.push(node); },
      removeChild(node: unknown) { removedNodes.push(node); },
    },
    getElementById(id: string) {
      return id === 'include-thinking' ? includeThinking : null;
    },
    createElement(tag: string) {
      if (tag === 'a') {
        const anchor: FakeAnchor = { href: '', download: '', click() { clickedAnchor = anchor; } };
        return anchor;
      }
      return {};
    },
  } as unknown as Document;

  const urlCalls: { create: unknown[]; revoke: unknown[] } = { create: [], revoke: [] };
  globalThis.URL = {
    createObjectURL(blob: Blob) { capturedBlob = blob; urlCalls.create.push(blob); return 'blob:mock'; },
    revokeObjectURL(url: string) { urlCalls.revoke.push(url); },
  } as unknown as typeof URL;

  globalThis.window = {} as Window & typeof globalThis;
  elements.exportFormatSelector = exportFormatSelector as unknown as HTMLSelectElement;
  state.conversationHistory = [
    { role: 'user', content: 'Hello assistant', reasoning: [], timestamp: '2024-01-01T10:00:00Z' },
    {
      role: 'assistant',
      content: 'Hi human!',
      reasoning: ['First thought', 'First thought', 'Second thought'],
      timestamp: '2024-01-01T10:00:05Z',
    },
  ] as unknown as typeof state.conversationHistory;

  exportChat();

  assert.equal(storage.getItem('chatExportFormat'), 'md');
  assert.equal(appendedNodes.length, 1);
  assert.ok(clickedAnchor);
  const anchor = clickedAnchor as FakeAnchor;
  assert.equal(appendedNodes[0], anchor);
  assert.equal(removedNodes.length, 1);
  assert.equal(removedNodes[0], anchor);
  assert.equal(anchor.href, 'blob:mock');
  assert.ok(anchor.download.endsWith('.md'));

  assert.equal(urlCalls.create.length, 1);
  assert.equal(urlCalls.revoke.length, 1);
  assert.equal(urlCalls.revoke[0], 'blob:mock');

  assert.ok(capturedBlob);
  const blobText = await (capturedBlob as Blob).text();
  assert.ok(blobText.includes('# Chat Export ('));
  assert.ok(blobText.includes('### You'));
  assert.ok(blobText.includes('### Assistant'));
  assert.ok(blobText.includes('#### Reasoning'));

  const reasoningMatches = blobText.match(/First thought/g) || [];
  assert.equal(reasoningMatches.length, 1);
  assert.ok(blobText.includes('Second thought'));
});
