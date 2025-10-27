import test from 'node:test';
import assert from 'node:assert/strict';

const originalFetch = global.fetch;
const originalWindow = global.window;
const originalLocalStorage = global.localStorage;

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

function setupEnvironment() {
  const showInfoCalls = [];
  global.window = {
    config: {
      getApiKey: () => 'vector-key',
      getBaseUrl: () => 'https://api.example.com',
    },
    serviceSelector: { value: 'openai' },
    showInfo: (message) => {
      showInfoCalls.push(message);
    },
    activeVectorStore: null,
  };
  global.localStorage = createLocalStorage();
  return showInfoCalls;
}

test('filterSupportedFiles separates extensions correctly', async () => {
  const { filterSupportedFiles } = await import('../src/js/services/vectorStore.js');

  const result = filterSupportedFiles([
    { name: 'document.pdf' },
    { name: 'image.bmp' },
    { name: 'notes.md' },
  ]);

  assert.equal(result.supported.length, 2);
  assert.equal(result.unsupported.length, 1);
  assert.equal(result.supported[0].name, 'document.pdf');
  assert.equal(result.unsupported[0].name, 'image.bmp');
});

test('uploadAndAttachFiles processes supported files and skips unsupported', async () => {
  const showInfoCalls = setupEnvironment();
  const { uploadAndAttachFiles } = await import('../src/js/services/vectorStore.js');

  const fetchCalls = [];
  global.fetch = async (url, options = {}) => {
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
  };

  try {
    const files = [
      { name: 'ok.pdf' },
      { name: 'skip.exe' },
      { name: 'readme.md' },
    ];
    const result = await uploadAndAttachFiles(files, 'Docs');
    assert.equal(result.vectorStoreId, 'vs-1');
    assert.equal(result.attachments.length, 2);
    assert.equal(result.skipped, 1);
    assert.equal(showInfoCalls.length, 1);
    assert.match(showInfoCalls[0], /Skipped 1 unsupported file/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('uploadAndAttachFiles throws when no supported files remain', async () => {
  const showInfoCalls = setupEnvironment();
  const { uploadAndAttachFiles } = await import('../src/js/services/vectorStore.js');

  global.fetch = async () => {
    throw new Error('fetch should not be called');
  };

  try {
    await assert.rejects(
      () => uploadAndAttachFiles([{ name: 'archive.exe' }]),
      /No supported files to upload/
    );
    assert.equal(showInfoCalls.length, 1);
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

  global.fetch = async () => ({
    ok: true,
    json: async () => responses.shift(),
  });

  const { waitForFileProcessing } = await import('../src/js/services/vectorStore.js');

  try {
    const status = await waitForFileProcessing('vs-1', 'file-1', 5, 0);
    assert.equal(status.status, 'completed');
  } finally {
    global.fetch = originalFetch;
  }
});

test('waitForFileProcessing throws on failure status', async () => {
  setupEnvironment();
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ status: 'failed', last_error: { message: 'bad' } }),
  });

  const { waitForFileProcessing } = await import('../src/js/services/vectorStore.js');

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
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ status: 'processing' }),
  });

  const { waitForFileProcessing } = await import('../src/js/services/vectorStore.js');

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
  } = await import('../src/js/services/vectorStore.js');

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
  assert.equal(global.window.activeVectorStore, 'vs-b');

  removeVectorStoreMetadata('vs-a');
  const afterRemoval = getVectorStoreMetadata();
  assert.equal(Object.keys(afterRemoval).length, 0);
});

test.after(() => {
  global.fetch = originalFetch;
  global.window = originalWindow;
  global.localStorage = originalLocalStorage;
});
