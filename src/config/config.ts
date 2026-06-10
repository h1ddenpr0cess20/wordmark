/**
 * Configuration for the chatbot application.
 *
 * This is an ES module: it exports the static config object and prompt/version
 * constants. Mutable runtime logging flags live on the shared `state` object
 * (state.debug / state.verboseLogging / state.shortResponseGuideline) so they
 * can be toggled at runtime from anywhere.
 */
import { state } from "../ts/init/state.ts";
import { uiHooks } from "../ts/init/uiHooks.ts";
import type { Config, ModelListItem } from "../types/config.ts";

// Console logging setup lives in utils/logger.ts. Importing it here (config is
// the first app module evaluated) applies the logging behavior before the rest
// of the app loads, preserving the original setup order. Re-exported so existing
// importers (e.g. the debug settings toggle) keep their import path.
export { applyConsoleLogging } from "../ts/utils/logger.ts";

// MCP client behavior to avoid browser CORS requirements on MCP endpoints.
// When true, the app will NOT make browser pings to MCP servers and will assume
// they are online. This removes any need for Access-Control-Allow-Origin on MCP
// servers because the actual MCP connection is handled by the AI service (e.g.
// OpenAI Responses), not the browser.
export const MCP_ASSUME_ONLINE = true;

// Application version. Single source of truth is package.json ("version");
// `__APP_VERSION__` is injected from it at build time by vite.config.js (and by
// tests/helpers/registerLoaders.mjs for the test runner). Bump package.json only.
export const APP_VERSION = __APP_VERSION__;

// GitHub repository URL
export const GITHUB_URL = "https://github.com/h1ddenpr0cess20/Wordmark";

// Default system prompts
export const DEFAULT_SYSTEM_PROMPT = "You are a helpful AI assistant. Provide clear, accurate, and concise information. Respond in a friendly, professional, and engaging manner. Adapt your tone to the user’s needs and always prioritize usefulness and clarity.";
export const DEFAULT_PERSONALITY = "a helpful and knowledgeable assistant named Wordmark";

// Prompt templates
// The {guideline} placeholder will be replaced with either a short-response
// guideline or an empty string based on the Verbose Mode toggle.
export const PERSONALITY_PROMPT_TEMPLATE = "Assume the personality of {personality}. Roleplay and never break character, but avoid mentioning your name randomly. {guideline} \n [current date and location, for reference when needed: {datetime}, {location}]";
export const CUSTOM_PROMPT_TEMPLATE = "{custom_prompt} \n (current date and location, for reference when needed: {datetime}, {location})";

// Optional guideline that encourages shorter responses.
// When Verbose Mode is enabled, the UI sets state.shortResponseGuideline to "".
export const DEFAULT_SHORT_RESPONSE_GUIDELINE = "Keep your responses relatively short and to the point unless the conversation context implies a longer response would be better (such as code, articles, poems, stories, etc.  use your best judgment).";

// Logo configuration
export const LOGO_STYLE = "wordmark";

// Seed the mutable runtime guideline with its default text.
state.shortResponseGuideline = DEFAULT_SHORT_RESPONSE_GUIDELINE;

// OpenAI API Configuration
export const config: Config = {
    // Default service to use
    defaultService: "openai",

    // Enable OpenAI function calling
    enableFunctionCalling: true,

    // Configure services (add more as needed)
    services: {
        // Standard OpenAI service
        openai: {
            baseUrl: "https://api.openai.com/v1",
            apiKey: "",
            models: [],
            defaultModel: "gpt-5.4",
            organization: null, // OpenAI organization ID (if applicable)
            modelsFetching: false,

            _isChatModel(modelId) {
                const lowered = modelId.toLowerCase();
                const prefixes = ["gpt-", "o1", "o3", "o4"];
                if (!prefixes.some(p => modelId.startsWith(p))) return false;

                const blocked = ["preview", "audio", "computer-use", "transcribe", "tts", "image", "search", "realtime"];
                if (blocked.some(f => lowered.includes(f))) return false;

                // Exclude dated versions (e.g. gpt-4o-2024-08-06)
                if (/-\d{4}-\d{2}-\d{2}$/.test(lowered)) return false;

                return true;
            },

            async fetchAndUpdateModels() {
                // Ensure key is loaded from localStorage if not yet on config
                if (!this.apiKey) {
                    const stored = localStorage.getItem("wordmark_api_key_openai");
                    if (stored) this.apiKey = stored;
                }
                if (!this.apiKey) {
                    this.models = ["Set API key to load models"];
                    return;
                }
                this.modelsFetching = true;
                const endpoint = `${this.baseUrl.replace(/\/+$/, "")}/models`;
                console.info(`Fetching OpenAI models from: ${endpoint}`);
                try {
                    const response = await fetch(endpoint, {
                        headers: { "Authorization": `Bearer ${this.apiKey}` },
                    });
                    if (!response.ok) {
                        console.error(`Error fetching OpenAI models: ${response.status}`);
                        this.models = ["Error: Could not fetch models"];
                    } else {
                        const data = await response.json();
                        if (data && Array.isArray(data.data)) {
                            this.models = data.data
                                .map((item: ModelListItem) => item.id)
                                .filter((id: unknown): id is string => typeof id === "string" && this._isChatModel?.(id) === true)
                                .sort();
                        } else {
                            this.models = ["Error: Invalid response"];
                        }
                        if (this.models.length === 0) {
                            this.models = ["No models found"];
                        }
                    }
                } catch (error) {
                    console.error("Failed to fetch OpenAI models:", error);
                    this.models = ["Error: Failed to connect"];
                } finally {
                    this.modelsFetching = false;
                }

                if (typeof uiHooks.updateModelsDropdown === "function") {
                    uiHooks.updateModelsDropdown(this.models[0]?.startsWith("Error"));
                }
            },
        },

        // LM Studio - Local server with OpenAI-compatible API
        lmstudio: {
            baseUrl: "http://localhost:1234/v1",
            apiKey: "", // Typically not required for LM Studio
            models: [], // Initialize as empty, will be populated dynamically
            defaultModel: "google/gemma-4-12b-qat",
            modelsFetching: false,

            // Fetch and update LM Studio models (response expected like { "data": [ { "id": "openai/gpt-oss-20b", ... }, ... ] })
            async fetchAndUpdateModels() {
                this.modelsFetching = true;
                let apiRoot = this.baseUrl.replace(/\/+$/, ""); // normalize trailing slash
                const endpoint = `${apiRoot}/models`;
                console.info(`Fetching LM Studio models from: ${endpoint}`);
                let fetchError = false;
                try {
                    const response = await fetch(endpoint);
                    if (!response.ok) {
                        console.error(`Error fetching LM Studio models: ${response.status} ${response.statusText}. Response:`, await response.text());
                        this.models = ["Error: Could not fetch models"];
                        fetchError = true;
                    } else {
                        const data = await response.json();
                        // LM Studio returns { "data": [ { "id": "model-id", ... }, ... ] } similar to OpenAI list
                        const isEmbeddingModel = (id: string) => /embed/i.test(id);
                        if (data && Array.isArray(data.data)) {
                            this.models = data.data.map((item: ModelListItem) => item.id).filter((id: unknown): id is string => typeof id === "string" && !isEmbeddingModel(id)).sort();
                        } else if (Array.isArray(data)) {
                            // fallback: array of string ids
                            this.models = data.filter((id: string) => !isEmbeddingModel(id)).sort();
                        } else if (Array.isArray(data.models)) {
                            this.models = data.models.filter((id: string) => !isEmbeddingModel(id)).sort();
                        } else {
                            console.error("Unexpected LM Studio /models response format:", data);
                            this.models = ["Error: Invalid server response"];
                            fetchError = true;
                        }

                        if (this.models.length === 0) {
                            this.models = ["No models found on server"];
                        } else {
                            const validModels = this.models.filter(m => !m.startsWith("Error:") && !m.startsWith("No models"));
                            if (validModels.length > 0 && !this.models.includes(this.defaultModel)) {
                                console.info(`Default model '${this.defaultModel}' not found in fetched LM Studio models. Available models:`, validModels);
                            }
                        }
                        console.info("Successfully updated LM Studio models:", this.models);
                    }
                } catch (error) {
                    console.error("Failed to fetch or parse LM Studio models:", error);
                    this.models = [`Error: Failed to connect to LM Studio`];
                    fetchError = true;
                } finally {
                    this.modelsFetching = false;
                }

                // Attempt to update UI
                if (typeof uiHooks.updateModelsDropdown === "function") {
                    uiHooks.updateModelsDropdown(fetchError);
                } else {
                    console.warn("uiHooks.updateModelsDropdown not registered. UI will not be updated with new LM Studio models.");
                }
            },
        },

        // Ollama - Local server with OpenAI-compatible Responses API
        ollama: {
            baseUrl: "http://localhost:11434/v1",
            apiKey: "", // Typically not required for Ollama
            models: [], // Initialize as empty, will be populated dynamically
            defaultModel: "qwen3",
            modelsFetching: false,

            // Fetch and update Ollama models (OpenAI-compatible /v1/models, fallback to /api/tags)
            async fetchAndUpdateModels() {
                this.modelsFetching = true;
                let apiRoot = this.baseUrl.replace(/\/+$/, ""); // normalize trailing slash
                const endpoint = `${apiRoot}/models`;
                console.info(`Fetching Ollama models from: ${endpoint}`);
                let fetchError = false;

                const isEmbeddingModel = (id: string) => /embed/i.test(id);
                const parseModels = (data: any): string[] | null => {
                    if (data && Array.isArray(data.data)) {
                        return data.data.map((item: ModelListItem) => item.id).filter((id: unknown): id is string => typeof id === "string" && !isEmbeddingModel(id)).sort();
                    }
                    if (Array.isArray(data)) {
                        return data.filter((id: string) => !isEmbeddingModel(id)).sort();
                    }
                    if (data && Array.isArray(data.models)) {
                        return data.models
                            .map((item: string | ModelListItem) => {
                                if (typeof item === "string") return item;
                                if (item && typeof item === "object") return item.id || item.name || item.model;
                                return null;
                            })
                            .filter((id: unknown): id is string => typeof id === "string" && !isEmbeddingModel(id))
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
                            console.error("Unexpected Ollama /models response format:", data);
                        }
                    }
                } catch (error) {
                    console.error("Failed to fetch or parse Ollama models:", error);
                }

                if (!models) {
                    const tagsRoot = apiRoot.replace(/\/v1$/, "");
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
                                console.error("Unexpected Ollama /api/tags response format:", data);
                            }
                        }
                    } catch (error) {
                        console.error("Failed to fetch or parse Ollama tags:", error);
                    }
                }

                if (!Array.isArray(models)) {
                    this.models = ["Error: Could not fetch models"];
                    fetchError = true;
                } else if (models.length === 0) {
                    this.models = ["No models found on server"];
                } else {
                    this.models = models;
                    const validModels = this.models.filter(m => !m.startsWith("Error:") && !m.startsWith("No models"));
                    if (validModels.length > 0 && !this.models.includes(this.defaultModel)) {
                        console.info(`Default model '${this.defaultModel}' not found in fetched Ollama models. Available models:`, validModels);
                    }
                }

                this.modelsFetching = false;

                // Attempt to update UI
                if (typeof uiHooks.updateModelsDropdown === "function") {
                    uiHooks.updateModelsDropdown(fetchError);
                } else {
                    console.warn("uiHooks.updateModelsDropdown not registered. UI will not be updated with new Ollama models.");
                }
            },
        },

        // xAI (Grok) service
        xai: {
            baseUrl: "https://api.x.ai/v1",
            apiKey: "",
            models: [],
            defaultModel: "grok-4-1-fast-non-reasoning",
            modelsFetching: false,

            _isChatModel(modelId) {
                const lowered = modelId.toLowerCase();
                if (!lowered.startsWith("grok-")) return false;
                const blocked = ["imagine", "image", "video", "voice", "vision"];
                return !blocked.some(f => lowered.includes(f));
            },

            async fetchAndUpdateModels() {
                // Ensure key is loaded from localStorage if not yet on config
                if (!this.apiKey) {
                    const stored = localStorage.getItem("wordmark_api_key_xai");
                    if (stored) this.apiKey = stored;
                }
                if (!this.apiKey) {
                    this.models = ["Set API key to load models"];
                    return;
                }
                this.modelsFetching = true;
                const endpoint = `${this.baseUrl.replace(/\/+$/, "")}/models`;
                console.info(`Fetching xAI models from: ${endpoint}`);
                try {
                    const response = await fetch(endpoint, {
                        headers: { "Authorization": `Bearer ${this.apiKey}` },
                    });
                    if (!response.ok) {
                        console.error(`Error fetching xAI models: ${response.status}`);
                        this.models = ["Error: Could not fetch models"];
                    } else {
                        const data = await response.json();
                        if (data && Array.isArray(data.data)) {
                            this.models = data.data
                                .map((item: ModelListItem) => item.id)
                                .filter((id: unknown): id is string => typeof id === "string" && this._isChatModel?.(id) === true)
                                .sort();
                        } else {
                            this.models = ["Error: Invalid response"];
                        }
                        if (this.models.length === 0) {
                            this.models = ["No models found"];
                        }
                    }
                } catch (error) {
                    console.error("Failed to fetch xAI models:", error);
                    this.models = ["Error: Failed to connect"];
                } finally {
                    this.modelsFetching = false;
                }

                if (typeof uiHooks.updateModelsDropdown === "function") {
                    uiHooks.updateModelsDropdown(this.models[0]?.startsWith("Error"));
                }
            },
        },
    },

    // Helper function to check whether a configured service can be selected
    isServiceEnabled: function(serviceKey) {
        const service = this.services && this.services[serviceKey];
        return Boolean(service && service.enabled !== false);
    },

    // Helper function to normalize a service key to an enabled service
    normalizeServiceKey: function(serviceKey) {
        if (this.isServiceEnabled(serviceKey)) {
            return serviceKey;
        }
        if (this.isServiceEnabled("openai")) {
            return "openai";
        }
        return Object.keys(this.services || {}).find(key => this.isServiceEnabled(key)) || serviceKey;
    },

    // Helper function to get the active service configuration
    getActiveService: function() {
        const serviceKey = this.normalizeServiceKey(this.defaultService);
        if (serviceKey && serviceKey !== this.defaultService) {
            this.defaultService = serviceKey;
        }
        return this.services[serviceKey];
    },

    // Helper to get the API key for the current service
    getApiKey: function() {
        // First, check if the API key is available in the active service (which will be updated by apiKeys.js)
        return this.getActiveService().apiKey;
    },

    // Helper to get the base URL for the current service.
    // LM Studio/Ollama URL overrides are applied by apiKeys.js writing the
    // chosen URL directly into services.<svc>.baseUrl, so reading the active
    // service's baseUrl already reflects any stored override.
    getBaseUrl: function() {
        const serviceKey = this.normalizeServiceKey(this.defaultService);
        if (serviceKey && serviceKey !== this.defaultService) {
            this.defaultService = serviceKey;
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
