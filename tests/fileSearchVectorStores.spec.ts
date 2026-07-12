import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis.window || {};
globalThis.localStorage = globalThis.localStorage || {
  getItem: () => null, setItem: () => {}, removeItem: () => {},
};
const { config } = await import('../src/config/config.js');
config.defaultService = 'openai';
config.services.openai.apiKey = 'test-key';
config.services.openai.baseUrl = 'https://api.openai.com/v1';

test('file_search attaches provided vectorStoreId when no stored IDs exist', async (t) => {
  globalThis.window = {
    handleStreamedResponse: async () => ({ response: {}, outputText: '', reasoningText: '' }),
    responsesClient: { toolHandlers: {} },
    toolImplementations: {},
    VERBOSE_LOGGING: false,
    shouldStopGeneration: false,
  } as unknown as Window & typeof globalThis;

  const kv = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (k: string) => (kv.has(k) ? kv.get(k) : null),
    setItem: (k: string, v: string) => { kv.set(k, String(v)); },
    removeItem: (k: string) => { kv.delete(k); },
  } as unknown as Storage;

  localStorage.setItem('wordmark_tool_preferences', JSON.stringify({ 'builtin:file_search': true }));

  localStorage.removeItem('wordmark_vector_stores');
  localStorage.removeItem('active_vector_store');

  let capturedBody: { tools?: Array<{ type?: string; vector_store_ids?: string[] }> } | null = null;
  globalThis.fetch = (async (_endpoint: unknown, options: RequestInit) => {
    try {
      capturedBody = JSON.parse(options.body as string);
    } catch {
      capturedBody = null;
    }
    return {
      ok: true,
      json: async () => ({ output_text: '', output: [] }),
    };
  }) as unknown as typeof fetch;

  const { runTurn } = await import('../src/ts/services/api/requestClient.js');

  await runTurn({
    inputMessages: [{ role: 'user', content: 'Search docs' }],
    model: 'gpt-4o',
    stream: false,
    vectorStoreId: 'vs_123',
  });

  assert.ok(capturedBody, 'request body should be captured');
  const body = capturedBody as { tools?: Array<{ type?: string; vector_store_ids?: string[] }> };
  const fileSearchTool = Array.isArray(body.tools)
    ? body.tools.find(t => t && t.type === 'file_search')
    : null;
  assert.ok(fileSearchTool, 'file_search tool should be included');
  assert.deepEqual(fileSearchTool.vector_store_ids, ['vs_123'], 'should include only the provided vector store id');
});

test('file_search attaches all active vector stores from storage when none provided explicitly', async (t) => {
  globalThis.window = {
    handleStreamedResponse: async () => ({ response: {}, outputText: '', reasoningText: '' }),
    responsesClient: { toolHandlers: {} },
    toolImplementations: {},
    VERBOSE_LOGGING: false,
    shouldStopGeneration: false,
  } as unknown as Window & typeof globalThis;

  const kv = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (k: string) => (kv.has(k) ? kv.get(k) : null),
    setItem: (k: string, v: string) => { kv.set(k, String(v)); },
    removeItem: (k: string) => { kv.delete(k); },
  } as unknown as Storage;

  localStorage.setItem('wordmark_tool_preferences', JSON.stringify({ 'builtin:file_search': true }));

  localStorage.setItem('wordmark_vector_stores', JSON.stringify({
    vs_A: { name: 'A' },
    vs_B: { name: 'B' },
  }));
  localStorage.setItem('active_vector_store', 'vs_C');

  let capturedBody: { tools?: Array<{ type?: string; vector_store_ids?: string[] }> } | null = null;
  globalThis.fetch = (async (_endpoint: unknown, options: RequestInit) => {
    try {
      capturedBody = JSON.parse(options.body as string);
    } catch {
      capturedBody = null;
    }
    return {
      ok: true,
      json: async () => ({ output_text: '', output: [] }),
    };
  }) as unknown as typeof fetch;

  const { runTurn } = await import('../src/ts/services/api/requestClient.js');

  await runTurn({
    inputMessages: [{ role: 'user', content: 'Search docs' }],
    model: 'gpt-4o',
    stream: false,
  });

  assert.ok(capturedBody, 'request body should be captured');
  const body = capturedBody as { tools?: Array<{ type?: string; vector_store_ids?: string[] }> };
  const fileSearchTool = Array.isArray(body.tools)
    ? body.tools.find(t => t && t.type === 'file_search')
    : null;
  assert.ok(fileSearchTool, 'file_search tool should be included');
  const ids = new Set(fileSearchTool.vector_store_ids);
  assert.equal(ids.size, 2, 'should include two vector store ids (capped by MAX_ACTIVE_VECTOR_STORES)');
  assert.ok(ids.has('vs_C'), 'includes vs_C (active)');
});

test('file_search dedupes and merges storage + explicit vectorStoreId', async (t) => {
  globalThis.window = {
    handleStreamedResponse: async () => ({ response: {}, outputText: '', reasoningText: '' }),
    responsesClient: { toolHandlers: {} },
    toolImplementations: {},
    VERBOSE_LOGGING: false,
    shouldStopGeneration: false,
  } as unknown as Window & typeof globalThis;

  const kv = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (k: string) => (kv.has(k) ? kv.get(k) : null),
    setItem: (k: string, v: string) => { kv.set(k, String(v)); },
    removeItem: (k: string) => { kv.delete(k); },
  } as unknown as Storage;

  localStorage.setItem('wordmark_tool_preferences', JSON.stringify({ 'builtin:file_search': true }));

  localStorage.setItem('wordmark_vector_stores', JSON.stringify({
    vs_A: { name: 'A' },
    vs_C: { name: 'C' },
  }));
  localStorage.setItem('active_vector_store', 'vs_B');

  let capturedBody: { tools?: Array<{ type?: string; vector_store_ids?: string[] }> } | null = null;
  globalThis.fetch = (async (_endpoint: unknown, options: RequestInit) => {
    try {
      capturedBody = JSON.parse(options.body as string);
    } catch {
      capturedBody = null;
    }
    return {
      ok: true,
      json: async () => ({ output_text: '', output: [] }),
    };
  }) as unknown as typeof fetch;

  const { runTurn } = await import('../src/ts/services/api/requestClient.js');

  await runTurn({
    inputMessages: [{ role: 'user', content: 'Search docs' }],
    model: 'gpt-4o',
    stream: false,
    vectorStoreId: 'vs_C',
  });

  assert.ok(capturedBody, 'request body should be captured');
  const body = capturedBody as { tools?: Array<{ type?: string; vector_store_ids?: string[] }> };
  const fileSearchTool = Array.isArray(body.tools)
    ? body.tools.find(t => t && t.type === 'file_search')
    : null;
  assert.ok(fileSearchTool, 'file_search tool should be included');
  const ids = new Set(fileSearchTool.vector_store_ids);
  assert.equal(ids.size, 3, 'should include three unique vector store ids');
  assert.ok(ids.has('vs_A'), 'includes vs_A (metadata)');
  assert.ok(ids.has('vs_B'), 'includes vs_B (active)');
  assert.ok(ids.has('vs_C'), 'includes vs_C (explicit and metadata, deduped)');
});
