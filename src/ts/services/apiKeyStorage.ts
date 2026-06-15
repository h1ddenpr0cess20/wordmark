/**
 * DOM-free loading of API keys from localStorage into `config.services`.
 *
 * @remarks
 * Kept separate from `apiKeys.ts` (which pulls in the UI/notifications graph) so
 * it has no DOM dependency and can run — and be tested — independently of
 * whether the API-key inputs exist yet. This is the source of truth for key
 * presence used by startup default-service selection.
 */

import { config } from "../../config/config.ts";
import { STORAGE_KEYS, toolApiKeyStorageKey } from "../utils/storage/storage.ts";

/** localStorage key prefix under which per-service API keys are stored. */
export const API_KEYS_STORAGE_PREFIX = STORAGE_KEYS.apiKeyPrefix;

/** Default base URLs (with `/v1`) for the local-inference providers. */
export const DEFAULT_LMSTUDIO_URL = "http://localhost:1234/v1";
export const DEFAULT_OLLAMA_URL = "http://localhost:11434/v1";

/**
 * Copies each service's saved key from localStorage into
 * `config.services[key].apiKey`, ignoring blank or whitespace-only values.
 */
export function loadApiKeysIntoConfig() {
  if (!config || !config.services || typeof localStorage === "undefined") {
    return;
  }
  for (const serviceKey of Object.keys(config.services)) {
    const service = config.services[serviceKey];
    if (!service || typeof service !== "object") {
      continue;
    }
    const stored = localStorage.getItem(`${API_KEYS_STORAGE_PREFIX}${serviceKey}`);
    if (typeof stored === "string" && stored.trim() !== "") {
      service.apiKey = stored;
    }
  }
}

/**
 * Returns a service's API key from localStorage, falling back to the config.
 *
 * @param service - The service id (e.g. `"openai"`, `"xai"`).
 * @returns The API key, or `null` if none is stored or configured.
 */
export function getApiKey(service: string): string | null {
  try {
    const storedKey = localStorage.getItem(`${API_KEYS_STORAGE_PREFIX}${service}`);
    if (storedKey) {
      return storedKey;
    }

    if (config?.services?.[service]?.apiKey) {
      return config.services[service].apiKey;
    }

    return null;
  } catch (error) {
    console.error(`Error getting API key for ${service}:`, error); return null;
  }
}

/**
 * Returns a tool-specific API key from localStorage.
 *
 * @param service - The tool service id (e.g. `"rapidapi"`, `"alphavantage"`).
 * @returns The API key, or `null` if none is stored.
 */
export function getToolApiKey(service: string): string | null {
  try {
    const storedKey = localStorage.getItem(toolApiKeyStorageKey(service));
    if (storedKey) {
      return storedKey;
    }

    return null;
  } catch (error) {
    console.error(`Error getting tool API key for ${service}:`, error);
    return null;
  }
}

/**
 * Returns the LM Studio base URL (including `/v1`).
 *
 * @returns The stored URL, the configured URL, or the localhost default.
 */
export function getLmStudioServerUrl() {
  try {
    let storedUrl = localStorage.getItem(STORAGE_KEYS.lmStudioServerUrl);
    if (storedUrl) {
      if (!storedUrl.endsWith("/v1")) {
        storedUrl = `${storedUrl}/v1`;
      }
      return storedUrl;
    }

    if (config?.services?.lmstudio?.baseUrl) {
      return config.services.lmstudio.baseUrl;
    }

    return DEFAULT_LMSTUDIO_URL;
  } catch (error) {
    console.error("Error getting LM Studio server URL:", error);
    return DEFAULT_LMSTUDIO_URL;
  }
}

/**
 * Returns the Ollama base URL (including `/v1`).
 *
 * @returns The stored URL, the configured URL, or the localhost default.
 */
export function getOllamaServerUrl() {
  try {
    let storedUrl = localStorage.getItem(STORAGE_KEYS.ollamaServerUrl);
    if (storedUrl) {
      if (!storedUrl.endsWith("/v1")) {
        storedUrl = `${storedUrl}/v1`;
      }
      return storedUrl;
    }

    if (config?.services?.ollama?.baseUrl) {
      return config.services.ollama.baseUrl;
    }

    return DEFAULT_OLLAMA_URL;
  } catch (error) {
    console.error("Error getting Ollama server URL:", error);
    return DEFAULT_OLLAMA_URL;
  }
}
