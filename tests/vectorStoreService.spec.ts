import test from 'node:test';
import assert from 'node:assert/strict';
import { state, elements } from '../src/ts/init/state.js';
import { config } from '../src/config/config.js';

const originalFetch = global.fetch;
const originalWindow = global.window;
const originalLocalStorage = global.localStorage;

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

function setupEnvironment() {
  const showInfoCalls: unknown[] = [];
  global.window = {
    showInfo: (message: unknown) => {
      showInfoCalls.push(message);
    },
  } as unknown as Window & typeof globalThis;
  config.defaultService = 'openai';
  config.services.openai.apiKey = 'vector-key';
  config.services.openai.baseUrl = 'https://api.example.com';
  elements.serviceSelector = { value: 'openai' } as unknown as HTMLSelectElement;
  state.activeVectorStore = null;
  global.localStorage = createLocalStorage();
  return showInfoCalls;
}

test('filterSupportedFiles separates extensions correctly', async () => {
  const { filterSupportedFiles } = await import('../src/ts/services/vectorStore.js');

  const result = filterSupportedFiles([
    { name: 'document.pdf' },
    { name: 'image.bmp' },
    { name: 'notes.md' },
  ] as unknown as File[]);

  assert.equal(result.supported.length, 2);
  assert.equal(result.unsupported.length, 1);
  assert.equal(result.supported[0].name, 'document.pdf');
  assert.equal(result.unsupported[0].name, 'image.bmp');
});

test('uploadAndAttachFiles processes supported files and skips unsupported', async () => {
  const showInfoCalls = setupEnvironment();
  const { uploadAndAttachFiles } = await import('../src/ts/services/vectorStore.js');

  const fetchCalls: Array<{ url: string; options: { method?: string } }> = [];
  global.fetch = (async (url: string, options: { method?: string } = {}) => {
    fetchCalls.push({ url, options });
    if (url.endsWith('/vector_stores') && options.method === 'POST') {
      return { ok: true, json: async () => ({ id: 'vs-1' }) };
    }
    if (url.endsWith('/files') && options.method === 'POST') {
      return { ok: true, json: async () => ({ id: `file-${fetchCalls.length}` }) };
    }
    if (url.includes('/vector_stores/') && url.endsWith('/files') && options.method === 'POST') {
      return { ok: true, json: async () => ({ status: 'completed' }) };
    }
    throw new Error(`Unexpected fetch call to ${url}`);
  }) as unknown as typeof fetch;

  try {
    const files = [
      { name: 'ok.pdf' },
      { name: 'skip.exe' },
      { name: 'readme.md' },
    ] as unknown as File[];
    const result = await uploadAndAttachFiles(files, 'Docs');
    assert.equal(result.vectorStoreId, 'vs-1');
    assert.equal(result.attachments.length, 2);
    assert.equal(result.skipped, 1);
  } finally {
    global.fetch = originalFetch;
  }
});

test('uploadAndAttachFiles throws when no supported files remain', async () => {
  const showInfoCalls = setupEnvironment();
  const { uploadAndAttachFiles } = await import('../src/ts/services/vectorStore.js');

  global.fetch = (async () => {
    throw new Error('fetch should not be called');
  }) as unknown as typeof fetch;

  try {
    await assert.rejects(
      () => uploadAndAttachFiles([{ name: 'archive.exe' }] as unknown as File[]),
      /No supported files to upload/
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test('waitForFileProcessing resolves when status completed', async () => {
  setupEnvironment();
  const responses = [
    { status: 'processing' },
    { status: 'completed' },
  ];

  global.fetch = (async () => ({
    ok: true,
    json: async () => responses.shift(),
  })) as unknown as typeof fetch;

  const { waitForFileProcessing } = await import('../src/ts/services/vectorStore.js');

  try {
    const status = await waitForFileProcessing('vs-1', 'file-1', 5, 0);
    assert.equal(status.status, 'completed');
  } finally {
    global.fetch = originalFetch;
  }
});

test('waitForFileProcessing throws on failure status', async () => {
  setupEnvironment();
  global.fetch = (async () => ({
    ok: true,
    json: async () => ({ status: 'failed', last_error: { message: 'bad' } }),
  })) as unknown as typeof fetch;

  const { waitForFileProcessing } = await import('../src/ts/services/vectorStore.js');

  try {
    await assert.rejects(
      () => waitForFileProcessing('vs-2', 'file-9', 2, 0),
      /File processing failed/
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test('waitForFileProcessing times out when attempts exhausted', async () => {
  setupEnvironment();
  global.fetch = (async () => ({
    ok: true,
    json: async () => ({ status: 'processing' }),
  })) as unknown as typeof fetch;

  const { waitForFileProcessing } = await import('../src/ts/services/vectorStore.js');

  try {
    await assert.rejects(
      () => waitForFileProcessing('vs-3', 'file-1', 2, 0),
      /File processing timeout/
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test('vector store metadata helpers persist to localStorage', async () => {
  setupEnvironment();
  const {
    saveVectorStoreMetadata,
    getVectorStoreMetadata,
    removeVectorStoreMetadata,
    setActiveVectorStoreId,
    getActiveVectorStoreId,
    clearActiveVectorStore,
    initializeVectorStore,
    getActiveVectorStoreIds,
  } = await import('../src/ts/services/vectorStore.js');

  saveVectorStoreMetadata('vs-a', { name: 'Store A' });
  setActiveVectorStoreId('vs-a');

  const metadata = getVectorStoreMetadata();
  assert.equal(metadata['vs-a'].name, 'Store A');
  assert.equal(getActiveVectorStoreId(), 'vs-a');

  const ids = getActiveVectorStoreIds();
  assert.ok(ids.includes('vs-a'));

  clearActiveVectorStore();
  assert.equal(getActiveVectorStoreId(), null);

  global.localStorage.setItem('active_vector_store', 'vs-b');
  initializeVectorStore();
  assert.equal(state.activeVectorStore, 'vs-b');

  removeVectorStoreMetadata('vs-a');
  const afterRemoval = getVectorStoreMetadata();
  assert.equal(Object.keys(afterRemoval).length, 0);
});

test.after(() => {
  global.fetch = originalFetch;
  global.window = originalWindow;
  global.localStorage = originalLocalStorage;
});
