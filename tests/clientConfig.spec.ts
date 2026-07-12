import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = globalThis.window || {};
const clientConfigStore: Record<string, string> = {};
globalThis.localStorage = {
  getItem(key: string) { return clientConfigStore[key] || null; },
  setItem(key: string, value: string) { clientConfigStore[key] = value; },
} as unknown as Storage;
globalThis.document = globalThis.document || {
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
};

const { config } = await import('../src/config/config.js');
const { elements } = await import('../src/ts/init/state.js');
const {
  getActiveServiceKey,
  getActiveModel,
  ensureApiKey,
  getBaseUrl,
  supportsReasoningEffort,
} = await import('../src/ts/services/api/clientConfig.js');

config.defaultService = 'openai';
config.services.openai.apiKey = 'sk-test-openai-key';

test('getActiveServiceKey returns default service', () => {
  const service = getActiveServiceKey();
  assert.equal(service, 'openai', 'should return default service');
});

test('getActiveServiceKey ignores disabled selected service', () => {
  const originalSelector = elements.serviceSelector;
  const originalEnabled = config.services.xai.enabled;
  elements.serviceSelector = { value: 'xai' } as unknown as HTMLSelectElement;
  config.services.xai.enabled = false;

  assert.equal(getActiveServiceKey(), 'openai', 'should fall back to enabled OpenAI service');

  elements.serviceSelector = originalSelector;
  config.services.xai.enabled = originalEnabled;
});

test('getActiveModel returns default model', () => {
  const model = getActiveModel();
  assert.equal(model, config.services.openai.defaultModel, 'should return active service default model');
});

test('ensureApiKey returns API key for active service', () => {
  const apiKey = ensureApiKey();
  assert.equal(apiKey, 'sk-test-openai-key', 'should return OpenAI API key');
});

test('ensureApiKey throws when API key is missing', () => {
  const originalKey = config.services.openai.apiKey;
  config.services.openai.apiKey = '';

  assert.throws(
    () => ensureApiKey(),
    /Add your.*API key/,
    'should throw when key is missing'
  );

  config.services.openai.apiKey = originalKey;
});

test('getBaseUrl returns base URL for active service', () => {
  const baseUrl = getBaseUrl();
  assert.equal(baseUrl, 'https://api.openai.com/v1', 'should return OpenAI base URL');
});

test('supportsReasoningEffort returns true for o-series models', () => {
  assert.equal(supportsReasoningEffort('o1-preview'), true, 'o1-preview should support reasoning');
  assert.equal(supportsReasoningEffort('o1-mini'), true, 'o1-mini should support reasoning');
  assert.equal(supportsReasoningEffort('o1'), true, 'o1 should support reasoning');
  assert.equal(supportsReasoningEffort('o3-mini'), true, 'o3-mini should support reasoning');
});

test('supportsReasoningEffort returns false for non-reasoning models', () => {
  assert.equal(supportsReasoningEffort('gpt-4o'), false, 'gpt-4o should not support reasoning');
  assert.equal(supportsReasoningEffort('gpt-4'), false, 'gpt-4 should not support reasoning');
  assert.equal(supportsReasoningEffort('grok-beta'), false, 'grok-beta (non-fast) should not support reasoning');
  assert.equal(supportsReasoningEffort('grok-fast'), true, 'grok-fast should support reasoning');
});

test('supportsReasoningEffort handles model with version suffix', () => {
  assert.equal(supportsReasoningEffort('o1-2024-12-17'), true, 'o1 with version should support reasoning');
});

test('supportsReasoningEffort uses active model when not specified', () => {
  const originalModel = config.services.openai.defaultModel;
  const originalSelector = elements.modelSelector;
  elements.modelSelector = null;

  config.services.openai.defaultModel = 'gpt-4o';
  assert.equal(supportsReasoningEffort(), false, 'gpt-4o should not support reasoning');

  config.services.openai.defaultModel = 'gpt-5-mini';
  assert.equal(supportsReasoningEffort(), true, 'gpt-5-mini should support reasoning');

  config.services.openai.defaultModel = originalModel;
  elements.modelSelector = originalSelector;
});
