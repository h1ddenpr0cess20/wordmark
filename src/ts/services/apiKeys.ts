/**
 * API key and local-provider URL management for the settings UI.
 *
 * @remarks
 * Wires the API-keys settings tab: reads/writes keys and the LM Studio/Ollama
 * base URLs to localStorage, mirrors them onto the {@link config} object, and
 * refreshes dependent UI (model selector, tool settings, feature status).
 *
 * Local providers carry an optional key of their own — LM Studio and Ollama can
 * both be started behind one — saved from their block alongside the base URL
 * rather than with the cloud keys, since it is a property of that server.
 */

import { icon } from "../utils/icons.ts";
import { updateFeatureStatus, updateModelSelector } from "../components/settings.ts";
import { refreshToolSettingsUI } from "../components/tools.ts";
import { config } from "../../config/config.ts";
import { state } from "../init/state.ts";
import { API_KEYS_STORAGE_PREFIX, loadApiKeysIntoConfig, loadLocalServerUrlsIntoConfig } from "./apiKeyStorage.ts";
import { STORAGE_KEYS } from "../utils/storage/storage.ts";
import { isLocalService } from "./providers.ts";
import { EMBEDDING_MODEL_STORAGE_KEY } from "./embeddings.ts";
import { uiHooks } from "../init/uiHooks.ts";
import { normalizeServerBaseUrl } from "../utils/utils.ts";
import { showInlineStatus } from "../utils/inlineStatus.ts";
import { createScopedLogger } from "../utils/logger.ts";

const logApiKeys = createScopedLogger("api-keys");

const LMSTUDIO_SERVER_URL_KEY = STORAGE_KEYS.lmStudioServerUrl;
const OLLAMA_SERVER_URL_KEY = STORAGE_KEYS.ollamaServerUrl;
const API_KEYS_INIT_MAX_RETRIES = 40;
const API_KEYS_INIT_RETRY_DELAY = 150;

const apiKeyInputs: Record<string, HTMLInputElement | null> = {
  openai: null,
  xai: null,
  openrouter: null,
};

let saveApiKeysButton: HTMLElement | null = null;
let embeddingModelSelect: HTMLSelectElement | null = null;
let lmStudioServerUrlInput: HTMLInputElement | null = null;
let lmStudioApiKeyInput: HTMLInputElement | null = null;
let saveLmStudioUrlButton: HTMLElement | null = null;
let ollamaServerUrlInput: HTMLInputElement | null = null;
let ollamaApiKeyInput: HTMLInputElement | null = null;
let saveOllamaUrlButton: HTMLElement | null = null;
let apiKeysEventHandlersApplied = false;
let shownApiKeyWarnings: Set<string> | null = null;

/** Refreshes the tool-settings UI and feature status after a key change. */
function refreshApiDependentUi() {
  try {
    refreshToolSettingsUI();
  } catch (error) {
    console.error("Failed to refresh tool settings UI:", error);
  }

  try {
    updateFeatureStatus();
  } catch (error) {
    console.error("Failed to update feature status after API key change:", error);
  }
}

/**
 * Caches the API-keys tab DOM elements, binds their handlers once, and loads
 * stored values.
 *
 * @remarks
 * The settings panels load asynchronously, so this retries on a short interval
 * (up to {@link API_KEYS_INIT_MAX_RETRIES}) until the essential elements exist.
 *
 * @param retryCount - Internal retry counter; omit on the initial call.
 */
function initApiKeys(retryCount: number = 0) {
  const openaiInput = document.getElementById("openai-api-key") as HTMLInputElement | null;
  const xaiInput = document.getElementById("xai-api-key") as HTMLInputElement | null;
  const openrouterInput = document.getElementById("openrouter-api-key") as HTMLInputElement | null;
  const saveKeysButton = document.getElementById("save-api-keys");
  const lmStudioUrlInput = document.getElementById("lmstudio-server-url") as HTMLInputElement | null;
  const lmStudioKeyInput = document.getElementById("lmstudio-api-key") as HTMLInputElement | null;
  const saveLmStudioButton = document.getElementById("save-lmstudio-url");
  const ollamaUrlInput = document.getElementById("ollama-server-url") as HTMLInputElement | null;
  const ollamaKeyInput = document.getElementById("ollama-api-key") as HTMLInputElement | null;
  const saveOllamaButton = document.getElementById("save-ollama-url");
  const embeddingSelect = document.getElementById("embedding-model") as HTMLSelectElement | null;

  const essentialReady = Boolean(saveKeysButton && (openaiInput || xaiInput || openrouterInput || lmStudioUrlInput || ollamaUrlInput));

  if (!essentialReady) {
    if (retryCount < API_KEYS_INIT_MAX_RETRIES) {
      setTimeout(() => initApiKeys(retryCount + 1), API_KEYS_INIT_RETRY_DELAY);
    } else if (state.verboseLogging) {
      console.warn("API Keys UI not ready after maximum retries; will retry on next init call.");
    }
    return;
  }

  apiKeyInputs.openai = openaiInput;
  apiKeyInputs.xai = xaiInput;
  apiKeyInputs.openrouter = openrouterInput;
  saveApiKeysButton = saveKeysButton;
  lmStudioServerUrlInput = lmStudioUrlInput;
  lmStudioApiKeyInput = lmStudioKeyInput;
  saveLmStudioUrlButton = saveLmStudioButton;
  ollamaServerUrlInput = ollamaUrlInput;
  ollamaApiKeyInput = ollamaKeyInput;
  saveOllamaUrlButton = saveOllamaButton;
  embeddingModelSelect = embeddingSelect;

  if (!apiKeysEventHandlersApplied) {
    Object.values(apiKeyInputs).forEach(input => {
      if (input) {
        input.addEventListener("click", (event: Event) => {
          event.stopPropagation();
        });
      }
    });

    for (const input of [lmStudioServerUrlInput, lmStudioApiKeyInput, ollamaServerUrlInput, ollamaApiKeyInput]) {
      if (input) {
        input.addEventListener("click", (event: Event) => {
          event.stopPropagation();
        });
      }
    }
    if (embeddingModelSelect) {
      embeddingModelSelect.addEventListener("click", (event: Event) => {
        event.stopPropagation();
      });
      embeddingModelSelect.addEventListener("change", () => {
        try {
          localStorage.setItem(EMBEDDING_MODEL_STORAGE_KEY, embeddingModelSelect!.value);
        } catch (error) {
          console.error("Failed to save embedding model:", error);
        }
      });
    }

    const toggleButtons = document.querySelectorAll<HTMLElement>(".toggle-password");
    toggleButtons.forEach(button => {
      button.addEventListener("click", function(event) {
        event.preventDefault();
        event.stopPropagation();

        const inputId = this.getAttribute("data-for");
        const input = inputId ? document.getElementById(inputId) : null;

        if (input && input.classList) {
          if (input.classList.contains("masked")) {
            input.classList.remove("masked");
            this.innerHTML = icon("eye-off", { width: 16, height: 16 });
          } else {
            input.classList.add("masked");
            this.innerHTML = icon("eye", { width: 16, height: 16 });
          }
        }
      });
    });

    if (saveApiKeysButton) {
      saveApiKeysButton.addEventListener("click", (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        saveApiKeys();
      });
    }

    if (saveLmStudioUrlButton) {
      saveLmStudioUrlButton.addEventListener("click", (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        saveLmStudioServerUrl();
      });
    }
    if (saveOllamaUrlButton) {
      saveOllamaUrlButton.addEventListener("click", (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        saveOllamaServerUrl();
      });
    }

    apiKeysEventHandlersApplied = true;
  }

  loadApiKeys();
};

/** Identifies a local provider whose base URL and optional key are user-configurable. */
interface LocalServerSettingsConfig {
  input: HTMLInputElement | null;
  keyInput: HTMLInputElement | null;
  storageKey: string;
  serviceKey: "lmstudio" | "ollama";
  statusClass: string;
  anchorSelector: string;
  label: string;
}

/**
 * Persists a local provider's optional API key: stores it under the same
 * per-service prefix the cloud keys use and mirrors it onto the config. A blank
 * field clears the key, since the common case is a server that wants none.
 *
 * @returns Whether a key is now set, for the status note.
 */
function saveLocalServerApiKey(keyInput: HTMLInputElement | null, serviceKey: string): boolean {
  if (!keyInput) {
    return Boolean(config?.services?.[serviceKey]?.apiKey);
  }
  const value = keyInput.value ? keyInput.value.trim() : "";
  if (value) {
    localStorage.setItem(`${API_KEYS_STORAGE_PREFIX}${serviceKey}`, value);
  } else {
    localStorage.removeItem(`${API_KEYS_STORAGE_PREFIX}${serviceKey}`);
  }
  if (config && config.services && config.services[serviceKey]) {
    config.services[serviceKey].apiKey = value;
  }
  return Boolean(value);
}

/**
 * Persists a local provider's settings: normalizes the base URL, mirrors it onto
 * the config (with a `/v1` suffix), saves the optional API key, refreshes the
 * model list, and shows a status note. Shared by the LM Studio and Ollama savers.
 *
 * @remarks
 * The key is saved before the model fetch so the refreshed request carries it,
 * which is also how a wrong key surfaces immediately as a failed fetch.
 */
function saveLocalServerSettings({ input, keyInput, storageKey, serviceKey, statusClass, anchorSelector, label }: LocalServerSettingsConfig) {
  try {
    if (input && input.value) {
      const serverUrl = normalizeServerBaseUrl(input.value);

      localStorage.setItem(storageKey, serverUrl);

      const hasKey = saveLocalServerApiKey(keyInput, serviceKey);

      const service = config && config.services && config.services[serviceKey];
      if (service) {
        service.baseUrl = `${serverUrl}/v1`;

        if (typeof service.fetchAndUpdateModels === "function") {
          service.fetchAndUpdateModels().catch(error => {
            console.error(`Error fetching ${label} models after URL update:`, error);
          });
        }
      }

      refreshApiDependentUi();

      showInlineStatus(
        statusClass,
        anchorSelector,
        hasKey ? `${label} URL and API key saved successfully!` : `${label} settings saved successfully!`,
        "success",
      );

      logApiKeys(`${label} settings saved to localStorage:`, serverUrl, hasKey ? "(with API key)" : "(no API key)");
    } else {
      showInlineStatus(statusClass, anchorSelector, `Please enter a valid ${label} Base URL`, "error");
    }
  } catch (error) {
    console.error(`Error saving ${label} settings:`, error);
    showInlineStatus(statusClass, anchorSelector, `Error saving ${label} settings`, "error");
  }
}

/**
 * Populates a local provider's URL input from localStorage (mirroring the value
 * onto the config with a `/v1` suffix and refreshing models), or, when nothing
 * is stored, back-fills the input from the config's existing base URL with the
 * `/v1` suffix stripped. The optional API key field is filled from the same
 * per-service storage the cloud keys use. Shared by the LM Studio and Ollama
 * loaders.
 */
function loadLocalServerSettings(
  input: HTMLInputElement | null,
  keyInput: HTMLInputElement | null,
  storageKey: string,
  serviceKey: "lmstudio" | "ollama",
  label: string,
) {
  if (keyInput) {
    const storedKey = localStorage.getItem(`${API_KEYS_STORAGE_PREFIX}${serviceKey}`);
    if (storedKey) {
      keyInput.value = storedKey;
      if (config && config.services && config.services[serviceKey]) {
        config.services[serviceKey].apiKey = storedKey;
      }
    } else {
      keyInput.value = config?.services?.[serviceKey]?.apiKey || "";
    }
  }
  if (!input) return;
  const storedUrl = localStorage.getItem(storageKey);
  const service = config && config.services && config.services[serviceKey];
  if (storedUrl) {
    input.value = storedUrl;
    if (service) {
      service.baseUrl = `${storedUrl}/v1`;
      if (typeof service.fetchAndUpdateModels === "function") {
        service.fetchAndUpdateModels().catch((error: unknown) => {
          console.error(`Error fetching ${label} models on load:`, error);
        });
      }
    }
  } else if (service && service.baseUrl) {
    let configUrl = service.baseUrl;
    if (configUrl.endsWith("/v1")) {
      configUrl = configUrl.slice(0, -3);
    }
    input.value = configUrl;
  }
}

/**
 * Persists the LM Studio base URL and optional API key, normalizing the URL,
 * mirroring it onto the config (with a `/v1` suffix), refreshing the model list,
 * and showing a status note.
 */
function saveLmStudioServerUrl() {
  saveLocalServerSettings({
    input: lmStudioServerUrlInput,
    keyInput: lmStudioApiKeyInput,
    storageKey: LMSTUDIO_SERVER_URL_KEY,
    serviceKey: "lmstudio",
    statusClass: "lmstudio-status",
    anchorSelector: ".lmstudio-action-buttons",
    label: "LM Studio",
  });
};

/**
 * Persists the Ollama base URL and optional API key, normalizing the URL,
 * mirroring it onto the config (with a `/v1` suffix), refreshing the model list,
 * and showing a status note.
 */
function saveOllamaServerUrl() {
  saveLocalServerSettings({
    input: ollamaServerUrlInput,
    keyInput: ollamaApiKeyInput,
    storageKey: OLLAMA_SERVER_URL_KEY,
    serviceKey: "ollama",
    statusClass: "ollama-status",
    anchorSelector: ".ollama-action-buttons",
    label: "Ollama",
  });
};

/**
 * Rebuilds the embedding-model dropdown for the active provider.
 *
 * @remarks
 * Enabled only when the active service is a local provider (LM Studio /
 * Ollama) that reported at least one embedding model; otherwise it is grayed
 * out. Options are an auto-detect default plus every embedding model the
 * provider listed; a stored model missing from the list is kept as an option
 * since it is still the one {@link resolveEmbeddingModel} will use.
 */
function refreshEmbeddingModelUI() {
  const select = embeddingModelSelect
    || (document.getElementById("embedding-model") as HTMLSelectElement | null);
  if (!select) {
    return;
  }

  const serviceKey = config?.defaultService;
  const service = serviceKey ? config?.services?.[serviceKey] : null;
  const local = isLocalService(serviceKey);
  const embeddingModels = local && Array.isArray(service?.embeddingModels)
    ? service.embeddingModels.filter((m): m is string => typeof m === "string" && m.length > 0)
    : [];

  let stored = "";
  try {
    stored = localStorage.getItem(EMBEDDING_MODEL_STORAGE_KEY)?.trim() || "";
  } catch {
    stored = "";
  }

  const options = local && stored && !embeddingModels.includes(stored)
    ? [stored, ...embeddingModels]
    : embeddingModels;

  select.innerHTML = "";
  const autoOption = document.createElement("option");
  autoOption.value = "";
  autoOption.textContent = "Auto-detect";
  select.appendChild(autoOption);
  for (const model of options) {
    const option = document.createElement("option");
    option.value = model;
    option.textContent = model;
    select.appendChild(option);
  }
  select.value = local ? stored : "";
  select.disabled = options.length === 0;
}

uiHooks.refreshEmbeddingModelUI = refreshEmbeddingModelUI;

/**
 * Persists the entered API keys, mirrors them onto the config, refreshes
 * dependent UI, and fetches models for the active service.
 */
function saveApiKeys() {
  try {
    for (const [service, input] of Object.entries(apiKeyInputs)) {
      if (!input) {
        continue;
      }

      const value = input.value ? input.value.trim() : "";

      if (value) {
        localStorage.setItem(`${API_KEYS_STORAGE_PREFIX}${service}`, value);
      } else {
        localStorage.removeItem(`${API_KEYS_STORAGE_PREFIX}${service}`);
      }

      if (config && config.services && config.services[service]) {
        config.services[service].apiKey = value;
      }
    }

    refreshApiDependentUi();

    showApiKeyStatus("API Keys saved successfully!", "success");

    const activeKey = config?.defaultService;
    const activeService = activeKey ? config?.services?.[activeKey] : null;
    if (activeService && typeof activeService.fetchAndUpdateModels === "function") {
      activeService.fetchAndUpdateModels().then(() => {
        updateModelSelector();

      }).catch(err => {
        console.error("Failed to fetch models after saving API keys:", err);
        updateModelSelector();

        refreshApiDependentUi();
      });
    } else {
      updateModelSelector();

    }

    logApiKeys("API keys saved to localStorage");
  } catch (error) {
    console.error("Error saving API keys:", error);
    showApiKeyStatus("Error saving API keys", "error");
  }
};

/**
 * Populates the API-key inputs and local-provider URL fields from localStorage,
 * falling back to any values already present on the config.
 */
function loadApiKeys() {
  try {
    for (const [service, input] of Object.entries(apiKeyInputs)) {
      if (input) {
        const storedKey = localStorage.getItem(`${API_KEYS_STORAGE_PREFIX}${service}`);

        if (storedKey) {
          input.value = storedKey;

          if (config && config.services && config.services[service]) {
            config.services[service].apiKey = storedKey;
          }
        } else if (config && config.services && config.services[service] && config.services[service].apiKey) {
          input.value = config.services[service].apiKey;
        }
      }
    }
    loadLocalServerSettings(lmStudioServerUrlInput, lmStudioApiKeyInput, LMSTUDIO_SERVER_URL_KEY, "lmstudio", "LM Studio");
    loadLocalServerSettings(ollamaServerUrlInput, ollamaApiKeyInput, OLLAMA_SERVER_URL_KEY, "ollama", "Ollama");
    refreshEmbeddingModelUI();
    logApiKeys("API keys loaded from localStorage");

    refreshApiDependentUi();
  } catch (error) {
    console.error("Error loading API keys:", error);
  }
};

/**
 * Ensures stored API keys are loaded into the config and inputs.
 *
 * @remarks
 * Populates the config from localStorage independently of the DOM (so key
 * presence is correct before inputs are cached), then syncs the inputs if they
 * exist. Skips the missing-key warning for local providers that need no key.
 */
function ensureApiKeysLoaded() {
  loadApiKeysIntoConfig();
  loadLocalServerUrlsIntoConfig();

  loadApiKeys();

  if (!config || !config.services) {
    return;
  }

  const service = config.defaultService;

  if (isLocalService(service)) {
    return;
  }

  shownApiKeyWarnings = shownApiKeyWarnings || new Set();
};

/**
 * Shows a transient status message in the API-keys tab.
 *
 * @param message - Text to display.
 * @param type - Status tone, `"success"` or `"error"`.
 */
function showApiKeyStatus(message: string, type: string = "success") {
  showInlineStatus("api-keys-status", ".api-keys-action-buttons", message, type);
};

export {
  initApiKeys,
  saveLmStudioServerUrl,
  saveOllamaServerUrl,
  saveApiKeys,
  loadApiKeys,
  ensureApiKeysLoaded,
  showApiKeyStatus,
  refreshEmbeddingModelUI,
};

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
      initApiKeys();

      logApiKeys("API keys management system initialized");
    }, 100);
  });

  if (typeof window !== "undefined" && config.services) {
    initApiKeys();
  }
}
