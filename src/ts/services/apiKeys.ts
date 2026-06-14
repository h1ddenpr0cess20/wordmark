/**
 * API key and local-provider URL management for the settings UI.
 *
 * @remarks
 * Wires the API-keys settings tab: reads/writes keys and the LM Studio/Ollama
 * base URLs to localStorage, mirrors them onto the {@link config} object, and
 * refreshes dependent UI (model selector, tool settings, feature status).
 */

import { icon } from "../utils/icons.ts";
import { updateFeatureStatus, updateModelSelector } from "../components/settings.ts";
import { refreshToolSettingsUI } from "../components/tools.ts";
import { config } from "../../config/config.ts";
import { state } from "../init/state.ts";
import { API_KEYS_STORAGE_PREFIX, loadApiKeysIntoConfig } from "./apiKeyStorage.ts";
import { STORAGE_KEYS } from "../utils/storage.ts";
import { isLocalService } from "./providers.ts";
import { normalizeServerBaseUrl } from "../utils/utils.ts";

const LMSTUDIO_SERVER_URL_KEY = STORAGE_KEYS.lmStudioServerUrl;
const OLLAMA_SERVER_URL_KEY = STORAGE_KEYS.ollamaServerUrl;
const API_KEYS_INIT_MAX_RETRIES = 40;
const API_KEYS_INIT_RETRY_DELAY = 150;

const apiKeyInputs: Record<string, HTMLInputElement | null> = {
  openai: null,
  xai: null,
};

let saveApiKeysButton: HTMLElement | null = null;
let lmStudioServerUrlInput: HTMLInputElement | null = null;
let saveLmStudioUrlButton: HTMLElement | null = null;
let ollamaServerUrlInput: HTMLInputElement | null = null;
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
  const saveKeysButton = document.getElementById("save-api-keys");
  const lmStudioUrlInput = document.getElementById("lmstudio-server-url") as HTMLInputElement | null;
  const saveLmStudioButton = document.getElementById("save-lmstudio-url");
  const ollamaUrlInput = document.getElementById("ollama-server-url") as HTMLInputElement | null;
  const saveOllamaButton = document.getElementById("save-ollama-url");

  const essentialReady = Boolean(saveKeysButton && (openaiInput || xaiInput || lmStudioUrlInput || ollamaUrlInput));

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
  saveApiKeysButton = saveKeysButton;
  lmStudioServerUrlInput = lmStudioUrlInput;
  saveLmStudioUrlButton = saveLmStudioButton;
  ollamaServerUrlInput = ollamaUrlInput;
  saveOllamaUrlButton = saveOllamaButton;

  if (!apiKeysEventHandlersApplied) {
    Object.values(apiKeyInputs).forEach(input => {
      if (input) {
        input.addEventListener("click", (event: Event) => {
          event.stopPropagation();
        });
      }
    });

    if (lmStudioServerUrlInput) {
      lmStudioServerUrlInput.addEventListener("click", (event: Event) => {
        event.stopPropagation();
      });
    }
    if (ollamaServerUrlInput) {
      ollamaServerUrlInput.addEventListener("click", (event: Event) => {
        event.stopPropagation();
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

/**
 * Renders a transient inline status note: removes any prior note of the same
 * class, inserts a new one after `anchorSelector`, and auto-dismisses it.
 *
 * @param statusClass - CSS class identifying this note family (e.g. `lmstudio-status`).
 * @param anchorSelector - Selector for the element the note is inserted after.
 * @param message - The status text.
 * @param type - Visual variant appended to the class (`success` or `error`).
 */
function showInlineStatus(statusClass: string, anchorSelector: string, message: string, type: string = "success") {
  const existing = document.querySelector(`.${statusClass}`) as HTMLElement | null;
  if (existing) {
    existing.remove();
  }

  const statusElement = document.createElement("div");
  statusElement.className = `${statusClass} ${type}`;
  statusElement.textContent = message;

  const anchor = document.querySelector(anchorSelector) as HTMLElement | null;
  if (anchor) {
    anchor.insertAdjacentElement("afterend", statusElement);
    setTimeout(() => {
      statusElement.remove();
    }, 5000);
  }
}

/** Identifies a local provider whose base URL is user-configurable. */
interface LocalServerUrlConfig {
  input: HTMLInputElement | null;
  storageKey: string;
  serviceKey: "lmstudio" | "ollama";
  statusClass: string;
  anchorSelector: string;
  label: string;
}

/**
 * Persists a local provider's base URL: normalizes the input, mirrors it onto
 * the config (with a `/v1` suffix), refreshes the model list, and shows a status
 * note. Shared by the LM Studio and Ollama savers.
 */
function saveLocalServerUrl({ input, storageKey, serviceKey, statusClass, anchorSelector, label }: LocalServerUrlConfig) {
  try {
    if (input && input.value) {
      const serverUrl = normalizeServerBaseUrl(input.value);

      localStorage.setItem(storageKey, serverUrl);

      const service = config && config.services && config.services[serviceKey];
      if (service) {
        service.baseUrl = `${serverUrl}/v1`;

        if (typeof service.fetchAndUpdateModels === "function") {
          service.fetchAndUpdateModels().catch(error => {
            console.error(`Error fetching ${label} models after URL update:`, error);
          });
        }
      }

      showInlineStatus(statusClass, anchorSelector, `${label} Base URL saved successfully!`, "success");

      if (state.verboseLogging) {
        console.info(`${label} Base URL saved to localStorage:`, serverUrl);
      }
    } else {
      showInlineStatus(statusClass, anchorSelector, `Please enter a valid ${label} Base URL`, "error");
    }
  } catch (error) {
    console.error(`Error saving ${label} Base URL:`, error);
    showInlineStatus(statusClass, anchorSelector, `Error saving ${label} Base URL`, "error");
  }
}

/**
 * Persists the LM Studio base URL, normalizing it, mirroring it onto the config
 * (with a `/v1` suffix), refreshing the model list, and showing a status note.
 */
function saveLmStudioServerUrl() {
  saveLocalServerUrl({
    input: lmStudioServerUrlInput,
    storageKey: LMSTUDIO_SERVER_URL_KEY,
    serviceKey: "lmstudio",
    statusClass: "lmstudio-status",
    anchorSelector: ".lmstudio-action-buttons",
    label: "LM Studio",
  });
};

/**
 * Persists the Ollama base URL, normalizing it, mirroring it onto the config
 * (with a `/v1` suffix), refreshing the model list, and showing a status note.
 */
function saveOllamaServerUrl() {
  saveLocalServerUrl({
    input: ollamaServerUrlInput,
    storageKey: OLLAMA_SERVER_URL_KEY,
    serviceKey: "ollama",
    statusClass: "ollama-status",
    anchorSelector: ".ollama-action-buttons",
    label: "Ollama",
  });
};

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

    refreshApiDependentUi();

    if (state.verboseLogging) {
      console.info("API keys saved to localStorage");
    }
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
    if (lmStudioServerUrlInput) {
      const storedLmUrl = localStorage.getItem(LMSTUDIO_SERVER_URL_KEY);

      if (storedLmUrl) {
        lmStudioServerUrlInput.value = storedLmUrl;

        if (config && config.services && config.services.lmstudio) {
          config.services.lmstudio.baseUrl = `${storedLmUrl}/v1`;

          if (typeof config.services.lmstudio.fetchAndUpdateModels === "function") {
            config.services.lmstudio.fetchAndUpdateModels().catch(error => {
              console.error("Error fetching LM Studio models on load:", error);
            });
          }
        }
      } else if (config && config.services && config.services.lmstudio && config.services.lmstudio.baseUrl) {
        let configLmUrl = config.services.lmstudio.baseUrl;
        if (configLmUrl.endsWith("/v1")) {
          configLmUrl = configLmUrl.slice(0, -3);
        }
        lmStudioServerUrlInput.value = configLmUrl;
      }
    }
    if (ollamaServerUrlInput) {
      const storedOllamaUrl = localStorage.getItem(OLLAMA_SERVER_URL_KEY);

      if (storedOllamaUrl) {
        ollamaServerUrlInput.value = storedOllamaUrl;

        if (config && config.services && config.services.ollama) {
          config.services.ollama.baseUrl = `${storedOllamaUrl}/v1`;

          if (typeof config.services.ollama.fetchAndUpdateModels === "function") {
            config.services.ollama.fetchAndUpdateModels().catch(error => {
              console.error("Error fetching Ollama models on load:", error);
            });
          }
        }
      } else if (config && config.services && config.services.ollama && config.services.ollama.baseUrl) {
        let configOllamaUrl = config.services.ollama.baseUrl;
        if (configOllamaUrl.endsWith("/v1")) {
          configOllamaUrl = configOllamaUrl.slice(0, -3);
        }
        ollamaServerUrlInput.value = configOllamaUrl;
      }
    }
    if (state.verboseLogging) {
      console.info("API keys loaded from localStorage");
    }

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

  if (typeof loadApiKeys === "function") {
    loadApiKeys();
  }

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
};

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
      initApiKeys();

      if (state.verboseLogging) {
        console.info("API keys management system initialized");
      }
    }, 100);
  });

  if (typeof window !== "undefined" && config && config.services) {
    initApiKeys();
  }
}
