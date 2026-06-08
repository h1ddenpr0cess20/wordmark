import { config } from "../../config/config.js";
/**
 * DOM-free loading of API keys from localStorage into config.services.
 *
 * Kept separate from apiKeys.js (which pulls in the UI/notifications graph) so it
 * has no DOM dependency and can run — and be tested — independently of whether the
 * API-key input elements exist yet. This is the source of truth for key presence
 * used by startup default-service selection.
 */

export const API_KEYS_STORAGE_PREFIX = "wordmark_api_key_";

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
