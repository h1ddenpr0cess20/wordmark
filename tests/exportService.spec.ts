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

function setupExportCapture(format: string) {
  globalThis.localStorage = createLocalStorage();
  const capture: { blob: Blob | null } = { blob: null };
  globalThis.document = {
    body: { appendChild() {}, removeChild() {} },
    getElementById() { return null; },
    createElement(tag: string) {
      if (tag === 'a') {
        return { href: '', download: '', click() {} };
      }
      let html = '';
      return {
        set innerHTML(value: string) { html = value; },
        get innerHTML() { return html; },
        querySelectorAll() { return []; },
      };
    },
  } as unknown as Document;
  globalThis.URL = {
    createObjectURL(blob: Blob) { capture.blob = blob; return 'blob:mock'; },
    revokeObjectURL() {},
  } as unknown as typeof URL;
  globalThis.window = {} as Window & typeof globalThis;
  elements.exportFormatSelector = { value: format } as unknown as HTMLSelectElement;
  return capture;
}

test('html export renders message markdown to HTML', async () => {
  const capture = setupExportCapture('html');
  state.conversationHistory = [
    {
      role: 'user',
      content: '# Heading\n\n**bold** with `code` and a list:\n\n- one\n- two',
      reasoning: [],
      timestamp: '2024-01-01T10:00:00Z',
    },
  ] as unknown as typeof state.conversationHistory;

  exportChat();

  assert.ok(capture.blob);
  const html = await (capture.blob as Blob).text();
  assert.ok(html.includes('<h1'));
  assert.ok(html.includes('<strong>bold</strong>'));
  assert.ok(html.includes('<code>code</code>'));
  assert.ok(html.includes('<li>one</li>'));
  assert.ok(html.includes('class="message user"'));
  assert.ok(html.includes('class="export-container"'));
});

test('html export escapes the sender label and uses the theme :root block', async () => {
  const capture = setupExportCapture('html');
  state.conversationHistory = [
    { role: 'assistant', content: 'hi', reasoning: [], timestamp: '', character: { name: '<b>Ada</b>' } },
  ] as unknown as typeof state.conversationHistory;

  exportChat();

  const html = await (capture.blob as Blob).text();
  assert.ok(html.includes('<span class="sender">&lt;b&gt;Ada&lt;/b&gt;</span>'));
  assert.ok(html.includes(':root {'));
  assert.ok(html.includes('--accent-color:'));
});

test('exports label party turns by character name across formats', async () => {
  const capture = setupExportCapture('md');
  state.conversationHistory = [
    { role: 'assistant', content: 'Greetings.', reasoning: [], timestamp: '', character: { name: 'Boole' } },
    { role: 'user', content: 'hello', reasoning: [], timestamp: '' },
  ] as unknown as typeof state.conversationHistory;

  exportChat();

  const md = await (capture.blob as Blob).text();
  assert.ok(md.includes('### Boole'));
  assert.ok(md.includes('### You'));
  assert.ok(!md.includes('### Assistant'));
});

test('exportChat quotes and escapes CSV cells containing delimiters and quotes', async () => {
  const capture = setupExportCapture('csv');
  state.conversationHistory = [
    {
      role: 'user',
      content: 'a,b "quoted"\nnew line',
      reasoning: [],
      timestamp: '2024-01-01T10:00:00Z',
    },
  ] as unknown as typeof state.conversationHistory;

  exportChat();

  assert.ok(capture.blob);
  const csv = await (capture.blob as Blob).text();
  assert.ok(csv.startsWith('"role","sender","content","reasoning","timestamp"'));
  assert.ok(csv.includes('"a,b ""quoted""\nnew line"'));
});
