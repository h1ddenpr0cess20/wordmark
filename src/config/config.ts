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
import { apiKeyStorageKey } from "../ts/utils/storage/storage.ts";
import type { Config, ModelListItem } from "../types/config.ts";

/**
 * Re-export of the console-logging installer.
 *
 * @remarks
 * The setup lives in `utils/logger.ts`. Importing it here — config is the first
 * app module evaluated — applies the logging behavior before the rest of the app
 * loads, preserving the original setup order. Re-exported so existing importers
 * (e.g. the debug settings toggle) keep their import path.
 */
export { applyConsoleLogging } from "../ts/utils/logger.ts";

/**
 * Whether MCP servers are assumed reachable without a browser-side health check.
 *
 * @remarks
 * When `true`, the app does not ping MCP servers from the browser and treats
 * them as online. This avoids any `Access-Control-Allow-Origin` requirement on
 * MCP endpoints, since the actual MCP connection is made by the AI service
 * (e.g. OpenAI Responses), not the browser.
 */
export const MCP_ASSUME_ONLINE = true;

/**
 * Application version.
 *
 * @remarks
 * `package.json` (`version`) is the single source of truth; `__APP_VERSION__`
 * is injected from it at build time by `vite.config.ts` (and by
 * `tests/helpers/registerLoaders.mjs` for the test runner). Bump `package.json`
 * only.
 */
export const APP_VERSION = __APP_VERSION__;

/** Canonical GitHub repository URL, surfaced in the About panel. */
export const GITHUB_URL = "https://github.com/h1ddenpr0cess20/Wordmark";

/** Default system prompt used when no personality or custom prompt is set. */
export const DEFAULT_SYSTEM_PROMPT = "You are a helpful AI assistant. Provide clear, accurate, and concise information. Respond in a friendly, professional, and engaging manner. Adapt your tone to the user’s needs and always prioritize usefulness and clarity.";

/** Default personality description for the personality-based system prompt. */
export const DEFAULT_PERSONALITY = "a helpful and knowledgeable assistant named Wordmark";

/**
 * Personality system-prompt template.
 *
 * @remarks
 * The `{guideline}` placeholder is replaced with either a short-response
 * guideline or an empty string depending on the Verbose Mode toggle;
 * `{personality}`, `{datetime}`, and `{location}` are filled in at send time.
 */
export const PERSONALITY_PROMPT_TEMPLATE = "Assume the personality of {personality}. Roleplay and never break character, but avoid mentioning your name randomly. {guideline} \n [current date and location, for reference when needed: {datetime}, {location}]";

/** Custom system-prompt template; `{custom_prompt}` is the user-supplied text. */
export const CUSTOM_PROMPT_TEMPLATE = "{custom_prompt} \n (current date and location, for reference when needed: {datetime}, {location})";

/** Preset personas offered in the settings panel's inspiration dropdown. */
export const PERSONALITY_PRESETS: ReadonlyArray<{ label: string; personality: string }> = [
  { label: "Tech Whiz", personality: "a witty and sarcastic tech expert" },
  { label: "Wise Teacher", personality: "a wise and patient teacher who explains complex topics simply" },
  { label: "Storyteller", personality: "a creative storyteller with a vivid imagination" },
  { label: "Code Master", personality: "a master programmer who loves solving complex problems" },
  { label: "Philosopher", personality: "a philosophical thinker who asks deep questions" },
  { label: "Sarcastic Jerk", personality: "a sarcastic jerk who loves to provoke thought" },
  { label: "Game Master", personality: "an imaginative game master who creates epic adventures" },
  { label: "Creative Artist", personality: "a passionate artist who sees beauty in everything" },
  { label: "Financial Wizard", personality: "a financial wizard who loves to discuss the latest trends in finance" },
  { label: "Master Chef", personality: "a charming and enthusiastic chef who loves sharing recipes" },
  { label: "😂", personality: "😂" },
  { label: "🤔", personality: "🤔" },
];

/**
 * Guideline appended to prompts to encourage shorter responses.
 *
 * @remarks
 * When Verbose Mode is enabled the UI clears `state.shortResponseGuideline`
 * (sets it to `""`) so this text is omitted.
 */
export const DEFAULT_SHORT_RESPONSE_GUIDELINE = "Keep your responses relatively short and to the point unless the conversation context implies a longer response would be better (such as code, articles, poems, stories, etc.  use your best judgment).";

/** Logo rendering style key (see `components/logo.ts`). */
export const LOGO_STYLE = "wordmark";

state.shortResponseGuideline = DEFAULT_SHORT_RESPONSE_GUIDELINE;

/**
 * Refreshes the models dropdown after a provider fetch, but only when the
 * fetched service is still the active one.
 *
 * @remarks
 * Model fetches also run in the background for non-active services (the local
 * server probes at startup, base-URL saves). Without this guard a failed
 * background fetch would flash "Failed to fetch … models" labeled with the
 * currently selected service, whose models loaded fine.
 */
function notifyModelsUpdated(service: unknown, fetchError?: boolean): void {
    if (config.services[config.defaultService] !== service) {
        return;
    }
    if (typeof uiHooks.updateModelsDropdown === "function") {
        uiHooks.updateModelsDropdown(fetchError);
    } else {
        console.warn("uiHooks.updateModelsDropdown not registered. UI will not be updated with new models.");
    }
}

/**
 * The application configuration: provider definitions plus the helper methods
 * that resolve the currently active service.
 */
export const config: Config = {
    defaultService: "openai",

    enableFunctionCalling: true,

    services: {
        openai: {
            baseUrl: "https://api.openai.com/v1",
            apiKey: "",
            models: [],
            defaultModel: "gpt-5.5",
            organization: null,
            modelsFetching: false,

            /** Keeps only conversational chat models, excluding specialized and dated variants. */
            _isChatModel(modelId) {
                const lowered = modelId.toLowerCase();
                const prefixes = ["gpt-", "o1", "o3", "o4"];
                if (!prefixes.some(p => modelId.startsWith(p))) return false;

                const blocked = ["preview", "audio", "computer-use", "transcribe", "tts", "image", "search", "realtime"];
                if (blocked.some(f => lowered.includes(f))) return false;
                if (/-\d{4}-\d{2}-\d{2}$/.test(lowered)) return false;

                return true;
            },

            /** Fetches the OpenAI model list (chat models only) and refreshes the dropdown. */
            async fetchAndUpdateModels() {
                if (!this.apiKey) {
                    const stored = localStorage.getItem(apiKeyStorageKey("openai"));
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

                notifyModelsUpdated(this, this.models[0]?.startsWith("Error"));
            },
        },

        lmstudio: {
            baseUrl: "http://localhost:1234/v1",
            apiKey: "",
            models: [],
            embeddingModels: [],
            defaultModel: "google/gemma-4-12b-qat",
            modelsFetching: false,

            /**
             * Fetches the LM Studio model list, filters out embedding models,
             * and refreshes the dropdown.
             *
             * @remarks
             * Accepts the OpenAI-style `{ data: [{ id }] }` shape as well as a
             * bare array or `{ models }` array as fallbacks.
             */
            async fetchAndUpdateModels() {
                this.modelsFetching = true;
                let apiRoot = this.baseUrl.replace(/\/+$/, "");
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
                        const isEmbeddingModel = (id: string) => /embed/i.test(id);
                        let allIds: string[] | null = null;
                        if (data && Array.isArray(data.data)) {
                            allIds = data.data.map((item: ModelListItem) => item.id).filter((id: unknown): id is string => typeof id === "string");
                        } else if (Array.isArray(data)) {
                            allIds = data.filter((id: unknown): id is string => typeof id === "string");
                        } else if (Array.isArray(data.models)) {
                            allIds = data.models.filter((id: unknown): id is string => typeof id === "string");
                        }
                        if (allIds) {
                            this.models = allIds.filter(id => !isEmbeddingModel(id)).sort();
                            this.embeddingModels = allIds.filter(isEmbeddingModel).sort();
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

                notifyModelsUpdated(this, fetchError);
            },
        },

        ollama: {
            baseUrl: "http://localhost:11434/v1",
            apiKey: "",
            models: [],
            embeddingModels: [],
            defaultModel: "gemma4",
            modelsFetching: false,

            /**
             * Fetches the Ollama model list and refreshes the dropdown.
             *
             * @remarks
             * Tries the OpenAI-compatible `/v1/models` endpoint first and falls
             * back to the native `/api/tags` endpoint if that fails or returns
             * an unrecognized shape.
             */
            async fetchAndUpdateModels() {
                this.modelsFetching = true;
                let apiRoot = this.baseUrl.replace(/\/+$/, "");
                const endpoint = `${apiRoot}/models`;
                console.info(`Fetching Ollama models from: ${endpoint}`);
                let fetchError = false;

                const isEmbeddingModel = (id: string) => /embed/i.test(id);
                const parseModels = (data: any): string[] | null => {
                    if (data && Array.isArray(data.data)) {
                        return data.data.map((item: ModelListItem) => item.id).filter((id: unknown): id is string => typeof id === "string").sort();
                    }
                    if (Array.isArray(data)) {
                        return data.filter((id: unknown): id is string => typeof id === "string").sort();
                    }
                    if (data && Array.isArray(data.models)) {
                        return data.models
                            .map((item: string | ModelListItem) => {
                                if (typeof item === "string") return item;
                                if (item && typeof item === "object") return item.id || item.name || item.model;
                                return null;
                            })
                            .filter((id: unknown): id is string => typeof id === "string")
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
                } else {
                    this.embeddingModels = models.filter(isEmbeddingModel);
                    const chatModels = models.filter(id => !isEmbeddingModel(id));
                    if (chatModels.length === 0) {
                        this.models = ["No models found on server"];
                    } else {
                        this.models = chatModels;
                        const validModels = this.models.filter(m => !m.startsWith("Error:") && !m.startsWith("No models"));
                        if (validModels.length > 0 && !this.models.includes(this.defaultModel)) {
                            console.info(`Default model '${this.defaultModel}' not found in fetched Ollama models. Available models:`, validModels);
                        }
                    }
                }

                this.modelsFetching = false;

                notifyModelsUpdated(this, fetchError);
            },
        },

        xai: {
            baseUrl: "https://api.x.ai/v1",
            apiKey: "",
            models: [],
            defaultModel: "grok-4.5",
            modelsFetching: false,

            /** Keeps only Grok chat models, excluding image/video/voice variants. */
            _isChatModel(modelId) {
                const lowered = modelId.toLowerCase();
                if (!lowered.startsWith("grok-")) return false;
                const blocked = ["imagine", "image", "video", "voice", "vision"];
                return !blocked.some(f => lowered.includes(f));
            },

            /** Fetches the xAI model list (Grok chat models only) and refreshes the dropdown. */
            async fetchAndUpdateModels() {
                if (!this.apiKey) {
                    const stored = localStorage.getItem(apiKeyStorageKey("xai"));
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

                notifyModelsUpdated(this, this.models[0]?.startsWith("Error"));
            },
        },

        openrouter: {
            baseUrl: "https://openrouter.ai/api/v1",
            apiKey: "",
            models: [],
            embeddingModels: [],
            defaultModel: "nvidia/nemotron-3-ultra-550b-a55b:free",
            defaultEmbeddingModel: "nvidia/nemotron-3-embed-1b:free",
            modelsFetching: false,

            /**
             * Fetches the OpenRouter model list and refreshes the dropdown.
             *
             * @remarks
             * OpenRouter's `/models` catalog spans every vendor it routes to, chat
             * and embedding alike, so embedding models (e.g. `openai/text-embedding-3-small`)
             * are split out into `embeddingModels` rather than dropped, enabling
             * client-side document RAG the same way LM Studio/Ollama do.
             */
            async fetchAndUpdateModels() {
                if (!this.apiKey) {
                    const stored = localStorage.getItem(apiKeyStorageKey("openrouter"));
                    if (stored) this.apiKey = stored;
                }
                if (!this.apiKey) {
                    this.models = ["Set API key to load models"];
                    return;
                }
                this.modelsFetching = true;
                const endpoint = `${this.baseUrl.replace(/\/+$/, "")}/models`;
                console.info(`Fetching OpenRouter models from: ${endpoint}`);
                try {
                    const response = await fetch(endpoint, {
                        headers: { "Authorization": `Bearer ${this.apiKey}` },
                    });
                    if (!response.ok) {
                        console.error(`Error fetching OpenRouter models: ${response.status}`);
                        this.models = ["Error: Could not fetch models"];
                    } else {
                        const data = await response.json();
                        if (data && Array.isArray(data.data)) {
                            const isEmbeddingModel = (id: string) => /embed/i.test(id);
                            const allIds = data.data
                                .map((item: ModelListItem) => item.id)
                                .filter((id: unknown): id is string => typeof id === "string");
                            this.models = allIds.filter((id: string) => !isEmbeddingModel(id)).sort();
                            this.embeddingModels = allIds.filter(isEmbeddingModel).sort();
                        } else {
                            this.models = ["Error: Invalid response"];
                        }
                        if (this.models.length === 0) {
                            this.models = ["No models found"];
                        }
                    }
                } catch (error) {
                    console.error("Failed to fetch OpenRouter models:", error);
                    this.models = ["Error: Failed to connect"];
                } finally {
                    this.modelsFetching = false;
                }

                notifyModelsUpdated(this, this.models[0]?.startsWith("Error"));
            },
        },
    },

    /**
     * Whether the given service exists and is selectable.
     *
     * @param serviceKey - Provider id to test.
     * @returns `true` unless the service is missing or has `enabled === false`.
     */
    isServiceEnabled: function(serviceKey) {
        const service = this.services && this.services[serviceKey];
        return Boolean(service && service.enabled !== false);
    },

    /**
     * Resolves a service key to an enabled one.
     *
     * @param serviceKey - Preferred provider id.
     * @returns `serviceKey` if enabled; otherwise `openai`, or the first enabled
     * service, falling back to the original key when none qualify.
     */
    normalizeServiceKey: function(serviceKey) {
        if (this.isServiceEnabled(serviceKey)) {
            return serviceKey;
        }
        if (this.isServiceEnabled("openai")) {
            return "openai";
        }
        return Object.keys(this.services || {}).find(key => this.isServiceEnabled(key)) || serviceKey;
    },

    /**
     * Returns the active service config, repointing {@link Config.defaultService}
     * to an enabled service if the current default is disabled.
     */
    getActiveService: function() {
        const serviceKey = this.normalizeServiceKey(this.defaultService);
        if (serviceKey && serviceKey !== this.defaultService) {
            this.defaultService = serviceKey;
        }
        return this.services[serviceKey];
    },

    /** Returns the API key for the active service (kept current by `apiKeys.ts`). */
    getApiKey: function() {
        return this.getActiveService().apiKey;
    },

    /**
     * Returns the base URL for the active service.
     *
     * @remarks
     * LM Studio/Ollama URL overrides are applied by `apiKeys.ts` writing the
     * chosen URL directly into `services.<svc>.baseUrl`, so the active service's
     * `baseUrl` already reflects any stored override.
     */
    getBaseUrl: function() {
        const serviceKey = this.normalizeServiceKey(this.defaultService);
        if (serviceKey && serviceKey !== this.defaultService) {
            this.defaultService = serviceKey;
        }
        return this.getActiveService().baseUrl;
    },

    /** Returns the default model id for the active service. */
    getDefaultModel: function() {
        const activeService = this.getActiveService();
        return activeService.defaultModel;
    },

    /** Returns the available model ids for the active service. */
    getAvailableModels: function() {
        return this.getActiveService().models;
    },

};
