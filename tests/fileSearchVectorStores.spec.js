import test from 'node:test';
import assert from 'node:assert/strict';

// runTurn reads the shared config singleton via clientConfig.js. Each test
// resets globalThis.window/localStorage, but config is a module singleton, so
// seed the active OpenAI service key once up front.
globalThis.window = globalThis.window || {};
globalThis.localStorage = globalThis.localStorage || {
  getItem: () => null, setItem: () => {}, removeItem: () => {},
};
const { config } = await import('../src/config/config.js');
config.defaultService = 'openai';
config.services.openai.apiKey = 'test-key';
config.services.openai.baseUrl = 'https://api.openai.com/v1';

test('file_search attaches provided vectorStoreId when no stored IDs exist', async (t) => {
  // Fresh globals per test
  globalThis.window = {
    handleStreamedResponse: async () => ({ response: {}, outputText: '', reasoningText: '' }),
    responsesClient: { toolHandlers: {} },
    toolImplementations: {},
    VERBOSE_LOGGING: false,
    shouldStopGeneration: false,
  };

  // Minimal localStorage polyfill
  const kv = new Map();
  globalThis.localStorage = {
    getItem: (k) => (kv.has(k) ? kv.get(k) : null),
    setItem: (k, v) => kv.set(k, String(v)),
    removeItem: (k) => kv.delete(k),
  };

  // Enable file_search tool
  localStorage.setItem('wordmark_tool_preferences', JSON.stringify({ 'builtin:file_search': true }));

  // Ensure no stored vector stores
  localStorage.removeItem('wordmark_vector_stores');
  localStorage.removeItem('active_vector_store');

  // Capture request body sent to fetch
  let capturedBody = null;
  globalThis.fetch = async (_endpoint, options) => {
    try {
      capturedBody = JSON.parse(options.body);
    } catch {
      capturedBody = null;
    }
    return {
      ok: true,
      json: async () => ({ output_text: '', output: [] }),
    };
  };

  const { runTurn } = await import('../src/js/services/api/requestClient.js');

  await runTurn({
    inputMessages: [{ role: 'user', content: 'Search docs' }],
    model: 'gpt-4o',
    stream: false,
    vectorStoreId: 'vs_123',
  });

  assert.ok(capturedBody, 'request body should be captured');
  const fileSearchTool = Array.isArray(capturedBody.tools)
    ? capturedBody.tools.find(t => t && t.type === 'file_search')
    : null;
  assert.ok(fileSearchTool, 'file_search tool should be included');
  assert.deepEqual(fileSearchTool.vector_store_ids, ['vs_123'], 'should include only the provided vector store id');
});

test('file_search attaches all active vector stores from storage when none provided explicitly', async (t) => {
  // Fresh globals per test
  globalThis.window = {
    handleStreamedResponse: async () => ({ response: {}, outputText: '', reasoningText: '' }),
    responsesClient: { toolHandlers: {} },
    toolImplementations: {},
    VERBOSE_LOGGING: false,
    shouldStopGeneration: false,
  };

  // Minimal localStorage polyfill
  const kv = new Map();
  globalThis.localStorage = {
    getItem: (k) => (kv.has(k) ? kv.get(k) : null),
    setItem: (k, v) => kv.set(k, String(v)),
    removeItem: (k) => kv.delete(k),
  };

  // Enable file_search tool
  localStorage.setItem('wordmark_tool_preferences', JSON.stringify({ 'builtin:file_search': true }));

  // Seed stored vector stores (metadata + active)
  localStorage.setItem('wordmark_vector_stores', JSON.stringify({
    vs_A: { name: 'A' },
    vs_B: { name: 'B' },
  }));
  localStorage.setItem('active_vector_store', 'vs_C');

  // Capture request body
  let capturedBody = null;
  globalThis.fetch = async (_endpoint, options) => {
    try {
      capturedBody = JSON.parse(options.body);
    } catch {
      capturedBody = null;
    }
    return {
      ok: true,
      json: async () => ({ output_text: '', output: [] }),
    };
  };

  // Import after env is prepared
  const { runTurn } = await import('../src/js/services/api/requestClient.js');

  await runTurn({
    inputMessages: [{ role: 'user', content: 'Search docs' }],
    model: 'gpt-4o',
    stream: false,
    // no vectorStoreId passed
  });

  assert.ok(capturedBody, 'request body should be captured');
  const fileSearchTool = Array.isArray(capturedBody.tools)
    ? capturedBody.tools.find(t => t && t.type === 'file_search')
    : null;
  assert.ok(fileSearchTool, 'file_search tool should be included');
  // MAX_ACTIVE_VECTOR_STORES is 2, so only the active store + 1 from metadata
  const ids = new Set(fileSearchTool.vector_store_ids);
  assert.equal(ids.size, 2, 'should include two vector store ids (capped by MAX_ACTIVE_VECTOR_STORES)');
  assert.ok(ids.has('vs_C'), 'includes vs_C (active)');
});

test('file_search dedupes and merges storage + explicit vectorStoreId', async (t) => {
  // Fresh globals per test
  globalThis.window = {
    handleStreamedResponse: async () => ({ response: {}, outputText: '', reasoningText: '' }),
    responsesClient: { toolHandlers: {} },
    toolImplementations: {},
    VERBOSE_LOGGING: false,
    shouldStopGeneration: false,
  };

  // Minimal localStorage polyfill
  const kv = new Map();
  globalThis.localStorage = {
    getItem: (k) => (kv.has(k) ? kv.get(k) : null),
    setItem: (k, v) => kv.set(k, String(v)),
    removeItem: (k) => kv.delete(k),
  };

  // Enable file_search tool
  localStorage.setItem('wordmark_tool_preferences', JSON.stringify({ 'builtin:file_search': true }));

  // Seed metadata with vs_A and vs_C
  localStorage.setItem('wordmark_vector_stores', JSON.stringify({
    vs_A: { name: 'A' },
    vs_C: { name: 'C' },
  }));
  localStorage.setItem('active_vector_store', 'vs_B');

  // Capture request body
  let capturedBody = null;
  globalThis.fetch = async (_endpoint, options) => {
    try {
      capturedBody = JSON.parse(options.body);
    } catch {
      capturedBody = null;
    }
    return {
      ok: true,
      json: async () => ({ output_text: '', output: [] }),
    };
  };

  const { runTurn } = await import('../src/js/services/api/requestClient.js');

  await runTurn({
    inputMessages: [{ role: 'user', content: 'Search docs' }],
    model: 'gpt-4o',
    stream: false,
    vectorStoreId: 'vs_C', // duplicate of metadata; should be deduped
  });

  assert.ok(capturedBody, 'request body should be captured');
  const fileSearchTool = Array.isArray(capturedBody.tools)
    ? capturedBody.tools.find(t => t && t.type === 'file_search')
    : null;
  assert.ok(fileSearchTool, 'file_search tool should be included');
  const ids = new Set(fileSearchTool.vector_store_ids);
  assert.equal(ids.size, 3, 'should include three unique vector store ids');
  assert.ok(ids.has('vs_A'), 'includes vs_A (metadata)');
  assert.ok(ids.has('vs_B'), 'includes vs_B (active)');
  assert.ok(ids.has('vs_C'), 'includes vs_C (explicit and metadata, deduped)');
});
