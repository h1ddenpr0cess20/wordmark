/**
 * Centralized localStorage access.
 *
 * `STORAGE_KEYS` is the single source of truth for every persisted key, so the
 * storage schema is discoverable in one place. The helpers wrap the common
 * read/write patterns:
 *
 *  - `readJSON(key, fallback)` — silent read-or-fallback (returns `fallback`
 *    when the key is absent OR the stored value fails to parse). Use only where
 *    the caller wants a silent fallback; sites that log a specific message or
 *    must distinguish "absent" from "corrupt" should keep their own try/catch.
 *  - `writeJSON(key, value)` — `setItem(key, JSON.stringify(value))`. Errors
 *    propagate; callers that need to log/swallow keep their own try/catch.
 *  - `readString` / `writeString` / `removeKey` — thin string/remove wrappers.
 *
 * Note: dynamic per-service keys (API keys) are built via the helper functions
 * below rather than being enumerated in the registry.
 */

export const STORAGE_KEYS = {
  apiKeyPrefix: "wordmark_api_key_",
  toolApiKeyPrefix: "wordmark_tool_api_key_",

  lmStudioServerUrl: "wordmark_lmstudio_server_url",
  ollamaServerUrl: "wordmark_ollama_server_url",

  toolPreferences: "wordmark_tool_preferences",
  mcpServers: "mcp_servers",

  skills: "wordmark_skills",
  skillPreferences: "wordmark_skill_preferences",

  vectorStores: "wordmark_vector_stores",
  activeVectorStore: "active_vector_store",

  lastKnownLocation: "lastKnownLocation",
  locationEnabled: "locationEnabled",

  memoryEnabled: "memoryEnabled",
  memoryLimit: "memoryLimit",
  memories: "memories",

  reasoningEffort: "reasoningEffort",
  responseVerbosity: "responseVerbosity",
  historyTokenBudget: "historyTokenBudget",

  selectedTheme: "selectedTheme",
  installedThemePacks: "installedThemePacks",
  enableLogging: "enableLogging",
  enableFunctionCalling: "enableFunctionCalling",
  verboseModeEnabled: "verboseModeEnabled",
  dataSettingsEnabled: "dataSettingsEnabled",
  chatExportFormat: "chatExportFormat",
} as const;

/** localStorage key for a service's API key (e.g. `wordmark_api_key_openai`). */
export function apiKeyStorageKey(service: string): string {
  return `${STORAGE_KEYS.apiKeyPrefix}${service}`;
}

/** localStorage key for a service's tool-only API key. */
export function toolApiKeyStorageKey(service: string): string {
  return `${STORAGE_KEYS.toolApiKeyPrefix}${service}`;
}

/**
 * Read and JSON-parse a value, returning `fallback` if the key is missing or
 * the stored text cannot be parsed. Never throws.
 */
export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** JSON-stringify and store a value. Storage errors propagate to the caller. */
export function writeJSON(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

/** Read a raw string value (or null). */
export function readString(key: string): string | null {
  return localStorage.getItem(key);
}

/** Store a raw string value. */
export function writeString(key: string, value: string): void {
  localStorage.setItem(key, value);
}

/** Remove a key. */
export function removeKey(key: string): void {
  localStorage.removeItem(key);
}
