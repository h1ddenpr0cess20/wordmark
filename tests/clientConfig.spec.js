import test from 'node:test';
import assert from 'node:assert/strict';

// Mock global dependencies
globalThis.window = {
  config: {
    services: {
      xai: {
        apiKey: 'xai-test-key',
        baseUrl: 'https://api.x.ai/v1',
        models: ['grok-beta'],
      },
      lmstudio: {
        baseUrl: 'http://localhost:1234/v1',
        models: [],
      },
    },
    defaultService: 'xai',
    defaultModel: 'grok-4-1-fast-non-reasoning',
    getApiKey() {
      const service = this.defaultService;
      return this.services[service]?.apiKey || '';
    },
    getBaseUrl() {
      const service = this.defaultService;
      return this.services[service]?.baseUrl || '';
    },
    getDefaultModel() {
      return this.defaultModel;
    },
  },
};

// Mock localStorage
globalThis.localStorage = {
  storage: {},
  getItem(key) {
    return this.storage[key] || null;
  },
  setItem(key, value) {
    this.storage[key] = value;
  },
};

const {
  getActiveServiceKey,
  getActiveModel,
  ensureApiKey,
  getBaseUrl,
  supportsReasoningEffort,
} = await import('../src/js/services/api/clientConfig.js');

test('getActiveServiceKey returns default service', () => {
  const service = getActiveServiceKey();
  assert.equal(service, 'xai', 'should return default service');
});

test('getActiveModel returns default model', () => {
  const model = getActiveModel();
  assert.equal(model, 'grok-4-1-fast-non-reasoning', 'should return default model');
});

test('ensureApiKey returns API key for active service', () => {
  const apiKey = ensureApiKey();
  assert.equal(apiKey, 'xai-test-key', 'should return xAI API key');
});

test('ensureApiKey throws when API key is missing', () => {
  const originalKey = window.config.services.xai.apiKey;
  window.config.services.xai.apiKey = '';

  assert.throws(
    () => ensureApiKey(),
    /Add your.*API key/,
    'should throw when key is missing'
  );

  // Restore
  window.config.services.xai.apiKey = originalKey;
});

test('getBaseUrl returns base URL for active service', () => {
  const baseUrl = getBaseUrl();
  assert.equal(baseUrl, 'https://api.x.ai/v1', 'should return xAI base URL');
});

test('supportsReasoningEffort returns true for o-series models', () => {
  assert.equal(supportsReasoningEffort('o1-preview'), true, 'o1-preview should support reasoning');
  assert.equal(supportsReasoningEffort('o1-mini'), true, 'o1-mini should support reasoning');
  assert.equal(supportsReasoningEffort('o1'), true, 'o1 should support reasoning');
  assert.equal(supportsReasoningEffort('o3-mini'), true, 'o3-mini should support reasoning');
});

test('supportsReasoningEffort returns false for non-reasoning models', () => {
  assert.equal(supportsReasoningEffort('grok-beta'), false, 'grok-beta (non-fast) should not support reasoning');
  assert.equal(supportsReasoningEffort('grok-fast'), true, 'grok-fast should support reasoning');
});

test('supportsReasoningEffort handles model with version suffix', () => {
  assert.equal(supportsReasoningEffort('o1-2024-12-17'), true, 'o1 with version should support reasoning');
});

test('supportsReasoningEffort uses active model when not specified', () => {
  const originalModel = window.config.defaultModel;

  window.config.defaultModel = 'grok-4-1-fast-non-reasoning';
  assert.equal(supportsReasoningEffort(), true, 'grok-fast should support reasoning');

  window.config.defaultModel = 'grok-beta';
  assert.equal(supportsReasoningEffort(), false, 'grok-beta should not support reasoning');

  // Restore
  window.config.defaultModel = originalModel;
});
