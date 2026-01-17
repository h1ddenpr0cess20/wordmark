/**
 * Configuration file for the chatbot application
 * This file must be loaded before any other JavaScript files
 */

// Enable debug mode (set to false in production)
window.DEBUG = false;
// Enable verbose logging (set to false to reduce log noise)
window.VERBOSE_LOGGING = false;

// MCP client behavior to avoid browser CORS requirements on MCP endpoints.
// When true, the app will NOT make browser pings to MCP servers and will assume they are online.
// This removes any need for Access-Control-Allow-Origin on your MCP servers because
// the actual MCP connection is handled by the AI service (e.g., OpenAI Responses), not the browser.
window.MCP_ASSUME_ONLINE = true;

// Store any API keys (these should be set by the user in the UI and stored in localStorage)
// DO NOT hardcode actual API keys here

// Application version
window.APP_VERSION = '1.0.1';

// GitHub repository URL
window.GITHUB_URL = 'https://github.com/h1ddenpr0cess20/Wordmark';

// Cryptocurrency donation addresses
window.CRYPTO_DONATIONS = [
  {
    name: 'Bitcoin (BTC)',
    address: '34rgxUdtg3aM5Fm6Q3aMwT1qEuFYQmSzLd',
    symbol: 'BTC'
  },
  {
    name: 'Bitcoin Cash (BCH)',
    address: '13JUmyzZ3vnddCqiqwAvzHJaCmMcjVpJD1',
    symbol: 'BCH'
  },
  {
    name: 'Ethereum (ETH)',
    address: '0xE8ac85A7331F66e7795A64Ab51C8c5A5A85Ed761',
    symbol: 'ETH'

  }
    
];

// Default system prompts
window.DEFAULT_SYSTEM_PROMPT = "You are a helpful AI assistant. Provide clear, accurate, and concise information. Respond in a friendly, professional, and engaging manner. Adapt your tone to the user’s needs and always prioritize usefulness and clarity.";
window.DEFAULT_PERSONALITY = "a helpful and knowledgeable assistant named Wordmark";

// Prompt templates
// The {guideline} placeholder will be replaced with either a short-response guideline
// or an empty string based on the Verbose Mode toggle
window.PERSONALITY_PROMPT_TEMPLATE = 'Assume the personality of {personality}. Roleplay and never break character, but avoid mentioning your name randomly. {guideline} \n [current date and location, for reference when needed: {datetime}, {location}]';
window.CUSTOM_PROMPT_TEMPLATE = '{custom_prompt} \n (current date and location, for reference when needed: {datetime}, {location})';

// Optional guideline that encourages shorter responses
// When Verbose Mode is enabled, this should be set to an empty string by the UI
window.DEFAULT_SHORT_RESPONSE_GUIDELINE = 'Keep your responses relatively short and to the point unless the conversation context implies a longer response would be better (such as code, articles, poems, stories, etc.  use your best judgment).';
window.SHORT_RESPONSE_GUIDELINE = window.DEFAULT_SHORT_RESPONSE_GUIDELINE;


// Logo configuration
window.LOGO_STYLE = 'wordmark';

// Centralized, idempotent console logging setup with de-duplication
// Avoid double wrapping and repeated error listeners across reloads
(() => {
  if (!window.originalConsole) {
    window.originalConsole = {
      log: console.log,
      error: console.error,
      warn: console.warn,
      info: console.info
    };
  }

  // Lightweight dedupe cache to prevent duplicate console entries
  if (!window.__LOG_DEDUPE__) {
    window.__LOG_DEDUPE__ = {
      lastTimes: new Map(), // key -> timestamp
      suppressed: new Map(), // key -> count
      windowMs: 1500,
      maxEntries: 500
    };
  }

  function serializeArgs(args) {
    try {
      return JSON.stringify(args, (k, v) => {
        if (typeof v === 'function') return 'ƒ';
        if (v instanceof Error) return { name: v.name, message: v.message, stack: v.stack };
        return v;
      });
    } catch (_) {
      // Fallback: join string representations
      return args.map(a => {
        try { return typeof a === 'string' ? a : (a && a.toString ? a.toString() : String(a)); } catch { return '[unserializable]'; }
      }).join(' | ');
    }
  }

  function makeWrapper(method, gateVerbose) {
    const orig = window.originalConsole[method] || console[method];
    return function(...args) {
      // Apply verbose gating for log/info
      if (gateVerbose && !window.VERBOSE_LOGGING) return;

      // Build dedupe key
      const key = `${method}|${serializeArgs(args)}`;
      const now = Date.now();
      const { lastTimes, suppressed, windowMs, maxEntries } = window.__LOG_DEDUPE__;
      const last = lastTimes.get(key) || 0;

      if (now - last < windowMs) {
        suppressed.set(key, (suppressed.get(key) || 0) + 1);
        return;
      }

      // If there were suppressed duplicates, append a note to the previous log
      const count = suppressed.get(key) || 0;
      suppressed.delete(key);

      const timestamp = new Date().toISOString();
      if (count > 0) {
        orig.call(window.originalConsole, `[${timestamp}] [${method.toUpperCase()}]`, ...args, `(x${count} duplicates suppressed)`);
      } else {
        orig.call(window.originalConsole, `[${timestamp}] [${method.toUpperCase()}]`, ...args);
      }

      lastTimes.set(key, now);
      if (lastTimes.size > maxEntries) {
        // Simple pruning to keep memory bounded
        lastTimes.clear();
      }
    };
  }

  // Expose a single function to (re)apply console behavior based on flags
  window.applyConsoleLogging = function() {
    if (window.DEBUG) {
      console.log = makeWrapper('log', true);
      console.info = makeWrapper('info', true);
      console.warn = makeWrapper('warn', false);
      console.error = makeWrapper('error', false);
    } else {
      // Restore to original first
      console.log = window.originalConsole.log;
      console.info = window.originalConsole.info;
      console.warn = window.originalConsole.warn;
      console.error = window.originalConsole.error;

      // In production mode, suppress log/info unless explicitly enabled
      if (!localStorage.getItem('enableLogging')) {
        console.log = function() {};
        console.info = function() {};
      }
    }
  };

  // Initial application of console behavior
  window.applyConsoleLogging();

  // Handle uncaught errors once
  if (!window.__ERROR_HANDLER_INSTALLED__) {
    window.__ERROR_HANDLER_INSTALLED__ = true;
    window.addEventListener('error', function(event) {
      if (window.DEBUG) {
        const err = event && (event.error || event.message || 'Unknown error');
        console.error('Uncaught error:', err);
      }
    });
  }
})();

// OpenAI API Configuration

window.config = {
    // Default service to use
    defaultService: 'openai',
    
    // Enable OpenAI function calling
    enableFunctionCalling: true,
    
    // Configure services (add more as needed)
    services: {
        // Standard OpenAI service
        openai: {
            baseUrl: 'https://api.openai.com/v1',
            apiKey: '',
            models: [
                'gpt-5.2',
                'gpt-5.1',
                'gpt-5.1-codex',
                'gpt-5.1-codex-mini',
                'gpt-5-codex',
                'gpt-5',
                'gpt-5-mini',
                'gpt-5-nano',
                'gpt-5-chat',
                'gpt-4o',
                'gpt-4o-mini',
                'gpt-4.1',
                'gpt-4.1-mini',
                'gpt-4.1-nano',
                'o3-mini',
                'o4-mini',
                'o3-pro',
                'o3'
            ],
            defaultModel: 'gpt-5-mini',
            organization: null // OpenAI organization ID (if applicable)
        },

        // LM Studio - Local server with OpenAI-compatible API
        lmstudio: {
            baseUrl: 'http://localhost:1234/v1',
            apiKey: '', // Typically not required for LM Studio
            models: [], // Initialize as empty, will be populated dynamically
            defaultModel: 'openai/gpt-oss-20b',
            modelsFetching: false,

            // Fetch and update LM Studio models (response expected like { "data": [ { "id": "openai/gpt-oss-20b", ... }, ... ] })
            async fetchAndUpdateModels() {
                this.modelsFetching = true;
                let apiRoot = this.baseUrl.replace(/\/+$/, ''); // normalize trailing slash
                const endpoint = `${apiRoot}/models`;
                console.info(`Fetching LM Studio models from: ${endpoint}`);
                let fetchError = false;
                try {
                    const response = await fetch(endpoint);
                    if (!response.ok) {
                        console.error(`Error fetching LM Studio models: ${response.status} ${response.statusText}. Response:`, await response.text());
                        this.models = ['Error: Could not fetch models'];
                        fetchError = true;
                    } else {
                        const data = await response.json();
                        // LM Studio returns { "data": [ { "id": "model-id", ... }, ... ] } similar to OpenAI list
                        if (data && Array.isArray(data.data)) {
                            this.models = data.data.map(item => item.id).filter(Boolean).sort();
                        } else if (Array.isArray(data)) {
                            // fallback: array of string ids
                            this.models = data.slice().sort();
                        } else if (Array.isArray(data.models)) {
                            this.models = data.models.slice().sort();
                        } else {
                            console.error('Unexpected LM Studio /models response format:', data);
                            this.models = ['Error: Invalid server response'];
                            fetchError = true;
                        }

                        if (this.models.length === 0) {
                            this.models = ['No models found on server'];
                        } else {
                            const validModels = this.models.filter(m => !m.startsWith('Error:') && !m.startsWith('No models'));
                            if (validModels.length > 0 && !this.models.includes(this.defaultModel)) {
                                console.info(`Default model '${this.defaultModel}' not found in fetched LM Studio models. Available models:`, validModels);
                            }
                        }
                        console.info('Successfully updated LM Studio models:', this.models);
                    }
                } catch (error) {
                    console.error('Failed to fetch or parse LM Studio models:', error);
                    this.models = [`Error: Failed to connect to LM Studio`];
                    fetchError = true;
                } finally {
                    this.modelsFetching = false;
                }

                // Attempt to update UI
                if (typeof window.uiHooks !== 'undefined' && typeof window.uiHooks.updateLmStudioModelsDropdown === 'function') {
                    window.uiHooks.updateLmStudioModelsDropdown(fetchError);
                } else {
                    console.warn('window.uiHooks.updateLmStudioModelsDropdown function not found. UI will not be updated with new LM Studio models.');
                }
            },
        },

        // Ollama - Local server with OpenAI-compatible Responses API
        ollama: {
            baseUrl: 'http://localhost:11434/v1',
            apiKey: '', // Typically not required for Ollama
            models: [], // Initialize as empty, will be populated dynamically
            defaultModel: 'qwen3',
            modelsFetching: false,

            // Fetch and update Ollama models (OpenAI-compatible /v1/models, fallback to /api/tags)
            async fetchAndUpdateModels() {
                this.modelsFetching = true;
                let apiRoot = this.baseUrl.replace(/\/+$/, ''); // normalize trailing slash
                const endpoint = `${apiRoot}/models`;
                console.info(`Fetching Ollama models from: ${endpoint}`);
                let fetchError = false;

                const parseModels = (data) => {
                    if (data && Array.isArray(data.data)) {
                        return data.data.map(item => item.id).filter(Boolean).sort();
                    }
                    if (Array.isArray(data)) {
                        return data.slice().sort();
                    }
                    if (data && Array.isArray(data.models)) {
                        return data.models
                            .map(item => {
                                if (typeof item === 'string') return item;
                                if (item && typeof item === 'object') return item.id || item.name || item.model;
                                return null;
                            })
                            .filter(Boolean)
                            .sort();
                    }
                    return null;
                };

                let models = null;
                try {
                    const response = await fetch(endpoint);
                    if (!response.ok) {
                        console.error(`Error fetching Ollama models: ${response.status} ${response.statusText}. Response:`, await response.text());
                    } else {
                        const data = await response.json();
                        models = parseModels(data);
                        if (!models) {
                            console.error('Unexpected Ollama /models response format:', data);
                        }
                    }
                } catch (error) {
                    console.error('Failed to fetch or parse Ollama models:', error);
                }

                if (!models) {
                    const tagsRoot = apiRoot.replace(/\/v1$/, '');
                    const tagsEndpoint = `${tagsRoot}/api/tags`;
                    console.info(`Falling back to Ollama tags endpoint: ${tagsEndpoint}`);
                    try {
                        const response = await fetch(tagsEndpoint);
                        if (!response.ok) {
                            console.error(`Error fetching Ollama tags: ${response.status} ${response.statusText}. Response:`, await response.text());
                        } else {
                            const data = await response.json();
                            models = parseModels(data);
                            if (!models) {
                                console.error('Unexpected Ollama /api/tags response format:', data);
                            }
                        }
                    } catch (error) {
                        console.error('Failed to fetch or parse Ollama tags:', error);
                    }
                }

                if (!Array.isArray(models)) {
                    this.models = ['Error: Could not fetch models'];
                    fetchError = true;
                } else if (models.length === 0) {
                    this.models = ['No models found on server'];
                } else {
                    this.models = models;
                    const validModels = this.models.filter(m => !m.startsWith('Error:') && !m.startsWith('No models'));
                    if (validModels.length > 0 && !this.models.includes(this.defaultModel)) {
                        console.info(`Default model '${this.defaultModel}' not found in fetched Ollama models. Available models:`, validModels);
                    }
                }

                this.modelsFetching = false;

                // Attempt to update UI
                if (typeof window.uiHooks !== 'undefined' && typeof window.uiHooks.updateLmStudioModelsDropdown === 'function') {
                    window.uiHooks.updateLmStudioModelsDropdown(fetchError);
                } else {
                    console.warn('window.uiHooks.updateLmStudioModelsDropdown function not found. UI will not be updated with new Ollama models.');
                }
            },
        },

        // xAI (Grok) service
        xai: {
            baseUrl: 'https://api.x.ai/v1',
            apiKey: '',
            models: [
                'grok-4-1-fast-reasoning',
                'grok-4-1-fast-non-reasoning',
                'grok-4',
                'grok-4-fast',
                'grok-4-fast-non-reasoning',
                'grok-code-fast-1'
            ],
            defaultModel: 'grok-4-1-fast-non-reasoning'
        },
    },

    // Helper function to get the active service configuration
    getActiveService: function() {
        return this.services[this.defaultService];
    },
    
    // Helper to get the API key for the current service
    getApiKey: function() {
        // First, check if the API key is available in the active service (which will be updated by apiKeys.js)
        return this.getActiveService().apiKey;
    },
    
    // Helper to get the base URL for the current service
    getBaseUrl: function() {
        // Special case for LM Studio - use the stored URL if available
        if (this.defaultService === 'lmstudio' && typeof window.getLmStudioServerUrl === 'function') {
            return window.getLmStudioServerUrl();
        }
        return this.getActiveService().baseUrl;
    },
    
    // Helper to get the default model for the current service
    getDefaultModel: function() {
        const activeService = this.getActiveService();
        return activeService.defaultModel;
    },
    
    // Helper to get available models for the current service
    getAvailableModels: function() {
        return this.getActiveService().models;
    },
    
};
