import test from 'node:test';
import assert from 'node:assert/strict';

// requestClient.js reads the shared config singleton via clientConfig.js.
// Provide browser stubs, then drive the real config object.
globalThis.window = globalThis.window || {};
const requestClientStore: Record<string, string> = {};
globalThis.localStorage = {
  getItem(key: string) { return requestClientStore[key] || null; },
  setItem(key: string, value: string) { requestClientStore[key] = value; },
} as unknown as Storage;

const { config } = await import('../src/config/config.js');
const { buildRequestBody } = await import('../src/ts/services/api/requestClient.js');
const { buildHeaders } = await import('../src/ts/services/api/requestTransport.js');

config.defaultService = 'openai';
config.services.openai.apiKey = 'test-key';
config.services.xai.apiKey = 'test-xai-key';

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
  const reasoning = body.reasoning as { effort?: string; summary?: string };
  assert.equal(reasoning.effort, 'high', 'should set reasoning effort');
  assert.equal(reasoning.summary, 'auto', 'should set reasoning summary');
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
  const originalService = config.defaultService;
  config.defaultService = 'xai';

  const tools = [{ type: 'web_search' }];
  const body = buildRequestBody({
    inputMessages: [{ role: 'user', content: 'Hello' }],
    model: 'grok-beta',
    tools,
  });

  assert.equal(body.include, undefined, 'xAI should not include default fields');
  assert.equal(body.text, undefined, 'xAI should remove text.format when using server tools');

  // Restore
  config.defaultService = originalService;
});

test('buildRequestBody removes xAI text format when MCP tools are enabled', () => {
  const originalService = config.defaultService;
  config.defaultService = 'xai';

  const tools = [{ type: 'mcp', server_label: 'demo', server_url: 'https://example.com' }];
  const body = buildRequestBody({
    inputMessages: [{ role: 'user', content: 'Hello' }],
    model: 'grok-beta',
    tools,
  });

  assert.equal(body.text, undefined, 'xAI should remove text.format when MCP tools are present');

  config.defaultService = originalService;
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
