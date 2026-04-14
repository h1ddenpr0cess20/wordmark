/**
 * Responses client configuration helpers.
 * Provides access to defaults and active service/model selectors.
 */

export const DEFAULT_MODEL = 'grok-4-1-fast-non-reasoning';
export const DEFAULT_VERBOSITY = 'medium';
export const DEFAULT_REASONING_EFFORT = 'low';

export function getActiveModel() {
  if (window.modelSelector && window.modelSelector.value) {
    return window.modelSelector.value;
  }
  if (window.config && typeof window.config.getDefaultModel === 'function') {
    return window.config.getDefaultModel();
  }
  return DEFAULT_MODEL;
}

export function getActiveServiceKey() {
  if (window.serviceSelector && window.serviceSelector.value) {
    return window.serviceSelector.value;
  }
  if (window.config && typeof window.config.defaultService === 'string') {
    return window.config.defaultService;
  }
  return 'xai';
}

export function ensureApiKey() {
  if (!window.config || typeof window.config.getApiKey !== 'function') {
    throw new Error('API configuration is unavailable.');
  }
  const activeServiceKey = getActiveServiceKey();
  const key = window.config.getApiKey();
  const trimmed = typeof key === 'string' ? key.trim() : '';
  if (trimmed) {
    return trimmed;
  }
  if (activeServiceKey === 'lmstudio' || activeServiceKey === 'ollama') {
    return null;
  }
  const friendlyName = (() => {
    if (activeServiceKey === 'xai') return 'xAI';
    return activeServiceKey
      ? activeServiceKey.charAt(0).toUpperCase() + activeServiceKey.slice(1)
      : 'xAI';
  })();
  throw new Error(`Add your ${friendlyName} API key in Settings → API Keys.`);
}

export function getBaseUrl() {
  if (!window.config || typeof window.config.getBaseUrl !== 'function') {
    throw new Error('API base URL is not configured.');
  }
  const baseUrl = window.config.getBaseUrl();
  if (!baseUrl) {
    throw new Error('API base URL is empty.');
  }
  return baseUrl.replace(/\/+$/, '');
}

export function supportsReasoningEffort(modelName = null) {
  const model = ((modelName || getActiveModel() || '') + '').toLowerCase();
  if (!model) {
    return true;
  }
  if (model.startsWith('grok')) {
    return model.includes('fast');
  }
  return true;
}
