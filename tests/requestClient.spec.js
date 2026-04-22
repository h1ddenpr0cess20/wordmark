import test from 'node:test';
import assert from 'node:assert/strict';

// Mock global dependencies
globalThis.window = {
  config: {
    services: {
      openai: { apiKey: 'test-key', baseUrl: 'https://api.openai.com/v1' },
      xai: { apiKey: 'test-xai-key', baseUrl: 'https://api.x.ai/v1' }
    },
    defaultService: 'openai',
    getApiKey() {
      const service = this.defaultService;
      return this.services[service]?.apiKey || '';
    },
    getBaseUrl() {
      const service = this.defaultService;
      return this.services[service]?.baseUrl || '';
    },
  },
  handleStreamedResponse: async () => ({ response: {}, outputText: '', reasoningText: '' }),
  responsesClient: {
    toolHandlers: {}
  },
  toolImplementations: {},
  VERBOSE_LOGGING: false,
  shouldStopGeneration: false,
};

const { buildRequestBody, buildHeaders } = await import('../src/js/services/api/requestClient.js');

test('buildRequestBody includes basic required fields', () => {
  const body = buildRequestBody({
    inputMessages: [{ role: 'user', content: 'Hello' }],
    model: 'gpt-4o',
    stream: true,
  });

  assert.ok(body.model, 'should include model');
  assert.ok(body.input, 'should include input messages');
  assert.equal(body.store, true, 'should enable storing');
  assert.equal(body.stream, true, 'should enable streaming');
});

test('buildRequestBody includes reasoning for supported models', () => {
  const body = buildRequestBody({
    inputMessages: [{ role: 'user', content: 'Hello' }],
    model: 'o1-preview',
    reasoningEffort: 'high',
  });

  assert.ok(body.reasoning, 'should include reasoning config');
  assert.equal(body.reasoning.effort, 'high', 'should set reasoning effort');
  assert.equal(body.reasoning.summary, 'auto', 'should set reasoning summary');
});

test('buildRequestBody excludes reasoning for non-reasoning models', () => {
  const body = buildRequestBody({
    inputMessages: [{ role: 'user', content: 'Hello' }],
    model: 'gpt-4o',
    reasoningEffort: 'high',
  });

  assert.equal(body.reasoning, undefined, 'should not include reasoning for non-reasoning models');
});

test('buildRequestBody includes tools when provided', () => {
  const tools = [
    { type: 'function', name: 'get_weather' },
    { type: 'web_search' }
  ];

  const body = buildRequestBody({
    inputMessages: [{ role: 'user', content: 'Hello' }],
    model: 'gpt-4o',
    tools,
  });

  assert.ok(Array.isArray(body.tools), 'should include tools array');
  assert.equal(body.tools.length, 2, 'should include all tools');
});

test('buildRequestBody includes previousResponseId when provided', () => {
  const body = buildRequestBody({
    inputMessages: [{ role: 'user', content: 'Hello' }],
    model: 'gpt-4o',
    previousResponseId: 'resp_123',
  });

  assert.equal(body.previous_response_id, 'resp_123', 'should include previous response ID');
});

test('buildRequestBody handles xAI service quirks', () => {
  // Mock xAI as active service by changing defaultService
  const originalService = globalThis.window.config.defaultService;
  globalThis.window.config.defaultService = 'xai';

  const tools = [{ type: 'web_search' }];
  const body = buildRequestBody({
    inputMessages: [{ role: 'user', content: 'Hello' }],
    model: 'grok-beta',
    tools,
  });

  assert.equal(body.include, undefined, 'xAI should not include default fields');
  assert.equal(body.text, undefined, 'xAI should remove text.format when using server tools');

  // Restore
  globalThis.window.config.defaultService = originalService;
});

test('buildRequestBody removes xAI text format when MCP tools are enabled', () => {
  const originalService = globalThis.window.config.defaultService;
  globalThis.window.config.defaultService = 'xai';

  const tools = [{ type: 'mcp', server_label: 'demo', server_url: 'https://example.com' }];
  const body = buildRequestBody({
    inputMessages: [{ role: 'user', content: 'Hello' }],
    model: 'grok-beta',
    tools,
  });

  assert.equal(body.text, undefined, 'xAI should remove text.format when MCP tools are present');

  globalThis.window.config.defaultService = originalService;
});

test('buildHeaders includes Authorization header', () => {
  const headers = buildHeaders();

  assert.ok(headers['Content-Type'], 'should include Content-Type');
  assert.ok(headers.Authorization, 'should include Authorization');
  assert.ok(headers.Authorization.startsWith('Bearer '), 'should use Bearer token format');
});

test('buildHeaders includes Accept header for streaming', () => {
  const headers = buildHeaders();

  assert.equal(headers.Accept, 'text/event-stream', 'should accept SSE streams');
});
