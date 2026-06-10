import { config } from "../../config/config.ts";
import { STORAGE_KEYS, toolApiKeyStorageKey } from "../utils/storage.ts";
/**
 * DOM-free loading of API keys from localStorage into config.services.
 *
 * Kept separate from apiKeys.js (which pulls in the UI/notifications graph) so it
 * has no DOM dependency and can run — and be tested — independently of whether the
 * API-key input elements exist yet. This is the source of truth for key presence
 * used by startup default-service selection.
 */

export const API_KEYS_STORAGE_PREFIX = STORAGE_KEYS.apiKeyPrefix;

/**
 * Copy each service's saved key from localStorage into config.services[key].apiKey.
 * Blank/whitespace-only stored values are ignored.
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
 * Get a service's API key from localStorage, falling back to config.
 * DOM-free, so it can be used by non-UI modules without pulling in the API-key
 * settings panel graph.
 * @param {string} service - The service id (e.g. 'openai', 'xai')
 * @returns {string|null} - The API key or null if not found
 */
export function getApiKey(service: string): string | null {
  try {
    // Try localStorage first
    const storedKey = localStorage.getItem(`${API_KEYS_STORAGE_PREFIX}${service}`);
    if (storedKey) {
      return storedKey;
    }

    // Fall back to config if exists
    if (config?.services?.[service]?.apiKey) {
      return config.services[service].apiKey;
    }

    return null;
  } catch (error) {
    console.error(`Error getting API key for ${service}:`, error); return null;
  }
}

/**
 * Gets a tool API key for a service from localStorage
 * @param {string} service - The service to get the key for (e.g., 'rapidapi', 'alphavantage')
 * @returns {string|null} - The API key or null if not found
 */
export function getToolApiKey(service: string): string | null {
  try {
  // Try localStorage first
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
 * Gets the LM Studio server URL from localStorage
 * @returns {string} - The LM Studio Base URL including /v1
 */
export function getLmStudioServerUrl() {
  try {
    // Try localStorage first
    let storedUrl = localStorage.getItem(STORAGE_KEYS.lmStudioServerUrl);
    if (storedUrl) {
      // Ensure the URL ends with /v1
      if (!storedUrl.endsWith("/v1")) {
        storedUrl = `${storedUrl}/v1`;
      }
      return storedUrl;
    }

    // Fall back to config if exists
    if (config?.services?.lmstudio?.baseUrl) {
      return config.services.lmstudio.baseUrl;
    }

    // Default fallback
    return "http://localhost:1234/v1";
  } catch (error) {
    console.error("Error getting LM Studio server URL:", error);
    return "http://localhost:1234/v1";
  }
}

/**
 * Gets the Ollama server URL from localStorage
 * @returns {string} - The Ollama Base URL including /v1
 */
export function getOllamaServerUrl() {
  try {
    // Try localStorage first
    let storedUrl = localStorage.getItem(STORAGE_KEYS.ollamaServerUrl);
    if (storedUrl) {
      // Ensure the URL ends with /v1
      if (!storedUrl.endsWith("/v1")) {
        storedUrl = `${storedUrl}/v1`;
      }
      return storedUrl;
    }

    // Fall back to config if exists
    if (config?.services?.ollama?.baseUrl) {
      return config.services.ollama.baseUrl;
    }

    // Default fallback
    return "http://localhost:11434/v1";
  } catch (error) {
    console.error("Error getting Ollama server URL:", error);
    return "http://localhost:11434/v1";
  }
}
