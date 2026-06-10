import { icon } from "../utils/icons.ts";
import { updateFeatureStatus, updateModelSelector } from "../components/settings.ts";
import { refreshToolSettingsUI } from "../components/tools.ts";
import { config } from "../../config/config.ts";
import { state } from "../init/state.ts";
import { API_KEYS_STORAGE_PREFIX, loadApiKeysIntoConfig } from "./apiKeyStorage.ts";
import { STORAGE_KEYS } from "../utils/storage.ts";
import { isLocalService } from "./providers.ts";
/**
 * API key management functionality
 */

// -----------------------------------------------------
// API key management functions
// -----------------------------------------------------

// Storage keys for local storage
const LMSTUDIO_SERVER_URL_KEY = STORAGE_KEYS.lmStudioServerUrl;
const OLLAMA_SERVER_URL_KEY = STORAGE_KEYS.ollamaServerUrl;
const API_KEYS_INIT_MAX_RETRIES = 40;
const API_KEYS_INIT_RETRY_DELAY = 150;

// DOM element references
const apiKeyInputs: Record<string, HTMLInputElement | null> = {
  openai: null,
  xai: null,
  // huggingface: null,
};

let saveApiKeysButton: HTMLElement | null = null;
let lmStudioServerUrlInput: HTMLInputElement | null = null;
let saveLmStudioUrlButton: HTMLElement | null = null;
let ollamaServerUrlInput: HTMLInputElement | null = null;
let saveOllamaUrlButton: HTMLElement | null = null;
let apiKeysEventHandlersApplied = false;
let shownApiKeyWarnings: Set<string> | null = null;

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
 * Initialize API key management functionality
 */
function initApiKeys(retryCount: number = 0) {
  // Get DOM references for main API keys
  const openaiInput = document.getElementById("openai-api-key") as HTMLInputElement | null;
  const xaiInput = document.getElementById("xai-api-key") as HTMLInputElement | null;
  // const huggingfaceInput = document.getElementById("huggingface-api-key") as HTMLInputElement | null;
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
  // apiKeyInputs.huggingface = huggingfaceInput;
  saveApiKeysButton = saveKeysButton;
  lmStudioServerUrlInput = lmStudioUrlInput;
  saveLmStudioUrlButton = saveLmStudioButton;
  ollamaServerUrlInput = ollamaUrlInput;
  saveOllamaUrlButton = saveOllamaButton;

  if (!apiKeysEventHandlersApplied) {
    // Add click handlers to prevent propagation on all input fields
    Object.values(apiKeyInputs).forEach(input => {
      if (input) {
        input.addEventListener("click", (event: Event) => {
          event.stopPropagation();
        });
      }
    });

    // Also add click handler for LM Studio server URL input
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

    // Get password toggle buttons
    const toggleButtons = document.querySelectorAll<HTMLElement>(".toggle-password");
    // Add event listeners to toggle password visibility
    toggleButtons.forEach(button => {
      button.addEventListener("click", function(event) {
        // Prevent the event from propagating up to parent elements
        event.preventDefault();
        event.stopPropagation();

        const inputId = this.getAttribute("data-for");
        const input = inputId ? document.getElementById(inputId) : null;

        // Masking is handled via CSS on .secret-input.masked
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

    // Add event listener to save button
    if (saveApiKeysButton) {
      saveApiKeysButton.addEventListener("click", (event: Event) => {
        // Prevent event propagation
        event.preventDefault();
        event.stopPropagation();
        saveApiKeys();
      });
    }

    // Add event listener to save LM Studio URL button
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

  // Load API keys from storage
  loadApiKeys();
};

/**
 * Save LM Studio server URL to localStorage
 */
function saveLmStudioServerUrl() {
  try {
    if (lmStudioServerUrlInput && lmStudioServerUrlInput.value) {
      let serverUrl = lmStudioServerUrlInput.value.trim();

      // Remove trailing slash if present
      if (serverUrl.endsWith("/")) {
        serverUrl = serverUrl.slice(0, -1);
      }

      // Remove /v1 suffix if present (we'll add it back when getting the URL)
      if (serverUrl.endsWith("/v1")) {
        serverUrl = serverUrl.slice(0, -3);
      }

      localStorage.setItem(LMSTUDIO_SERVER_URL_KEY, serverUrl);

      // Update the config object with the full URL including /v1
      if (config && config.services && config.services.lmstudio) {
        config.services.lmstudio.baseUrl = `${serverUrl}/v1`;

        // Fetch models from the new URL so the dropdown refreshes
        if (typeof config.services.lmstudio.fetchAndUpdateModels === "function") {
          config.services.lmstudio.fetchAndUpdateModels().catch(error => {
            console.error("Error fetching LM Studio models after URL update:", error);
          });
        }
      }

      // Show success message in the LM Studio section
      const existingStatus = document.querySelector(".lmstudio-status") as HTMLElement | null;
      if (existingStatus) {
        existingStatus.remove();
      }

      const statusElement = document.createElement("div");
      statusElement.className = "lmstudio-status success";
      statusElement.textContent = "LM Studio Base URL saved successfully!";

      const lmstudioActionButtons = document.querySelector(".lmstudio-action-buttons") as HTMLElement | null;
      if (lmstudioActionButtons) {
        lmstudioActionButtons.insertAdjacentElement("afterend", statusElement);

        // Auto-remove after 5 seconds
        setTimeout(() => {
          statusElement.remove();
        }, 5000);
      }

      if (state.verboseLogging) {
        console.info("LM Studio Base URL saved to localStorage:", serverUrl);
      }
    } else {
      // Show error message in the LM Studio section
      const existingStatus = document.querySelector(".lmstudio-status") as HTMLElement | null;
      if (existingStatus) {
        existingStatus.remove();
      }

      const statusElement = document.createElement("div");
      statusElement.className = "lmstudio-status error";
      statusElement.textContent = "Please enter a valid LM Studio Base URL";

      const lmstudioActionButtons = document.querySelector(".lmstudio-action-buttons") as HTMLElement | null;
      if (lmstudioActionButtons) {
        lmstudioActionButtons.insertAdjacentElement("afterend", statusElement);

        // Auto-remove after 5 seconds
        setTimeout(() => {
          statusElement.remove();
        }, 5000);
      }
    }
  } catch (error) {
    console.error("Error saving LM Studio Base URL:", error);

    // Show error message in the LM Studio section
    const existingStatus = document.querySelector(".lmstudio-status") as HTMLElement | null;
    if (existingStatus) {
      existingStatus.remove();
    }

    const statusElement = document.createElement("div");
    statusElement.className = "lmstudio-status error";
    statusElement.textContent = "Error saving LM Studio Base URL";

    const lmstudioActionButtons = document.querySelector(".lmstudio-action-buttons") as HTMLElement | null;
    if (lmstudioActionButtons) {
      lmstudioActionButtons.insertAdjacentElement("afterend", statusElement);

      // Auto-remove after 5 seconds
      setTimeout(() => {
        statusElement.remove();
      }, 5000);
    }
  }
};

/**
 * Save Ollama server URL to localStorage
 */
function saveOllamaServerUrl() {
  try {
    if (ollamaServerUrlInput && ollamaServerUrlInput.value) {
      let serverUrl = ollamaServerUrlInput.value.trim();

      // Remove trailing slash if present
      if (serverUrl.endsWith("/")) {
        serverUrl = serverUrl.slice(0, -1);
      }

      // Remove /v1 suffix if present (we'll add it back when getting the URL)
      if (serverUrl.endsWith("/v1")) {
        serverUrl = serverUrl.slice(0, -3);
      }

      localStorage.setItem(OLLAMA_SERVER_URL_KEY, serverUrl);

      // Update the config object with the full URL including /v1
      if (config && config.services && config.services.ollama) {
        config.services.ollama.baseUrl = `${serverUrl}/v1`;

        // Fetch models from the new URL so the dropdown refreshes
        if (typeof config.services.ollama.fetchAndUpdateModels === "function") {
          config.services.ollama.fetchAndUpdateModels().catch(error => {
            console.error("Error fetching Ollama models after URL update:", error);
          });
        }
      }

      // Show success message in the Ollama section
      const existingStatus = document.querySelector(".ollama-status") as HTMLElement | null;
      if (existingStatus) {
        existingStatus.remove();
      }

      const statusElement = document.createElement("div");
      statusElement.className = "ollama-status success";
      statusElement.textContent = "Ollama Base URL saved successfully!";

      const ollamaActionButtons = document.querySelector(".ollama-action-buttons") as HTMLElement | null;
      if (ollamaActionButtons) {
        ollamaActionButtons.insertAdjacentElement("afterend", statusElement);

        // Auto-remove after 5 seconds
        setTimeout(() => {
          statusElement.remove();
        }, 5000);
      }

      if (state.verboseLogging) {
        console.info("Ollama Base URL saved to localStorage:", serverUrl);
      }
    } else {
      // Show error message in the Ollama section
      const existingStatus = document.querySelector(".ollama-status") as HTMLElement | null;
      if (existingStatus) {
        existingStatus.remove();
      }

      const statusElement = document.createElement("div");
      statusElement.className = "ollama-status error";
      statusElement.textContent = "Please enter a valid Ollama Base URL";

      const ollamaActionButtons = document.querySelector(".ollama-action-buttons") as HTMLElement | null;
      if (ollamaActionButtons) {
        ollamaActionButtons.insertAdjacentElement("afterend", statusElement);

        // Auto-remove after 5 seconds
        setTimeout(() => {
          statusElement.remove();
        }, 5000);
      }
    }
  } catch (error) {
    console.error("Error saving Ollama Base URL:", error);

    // Show error message in the Ollama section
    const existingStatus = document.querySelector(".ollama-status") as HTMLElement | null;
    if (existingStatus) {
      existingStatus.remove();
    }

    const statusElement = document.createElement("div");
    statusElement.className = "ollama-status error";
    statusElement.textContent = "Error saving Ollama Base URL";

    const ollamaActionButtons = document.querySelector(".ollama-action-buttons") as HTMLElement | null;
    if (ollamaActionButtons) {
      ollamaActionButtons.insertAdjacentElement("afterend", statusElement);

      // Auto-remove after 5 seconds
      setTimeout(() => {
        statusElement.remove();
      }, 5000);
    }
  }
};

/**
 * Save API keys to localStorage
 */
function saveApiKeys() {
  try {
    // Save each API key to localStorage
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

      // Update the config object immediately so dependent UI can react without refresh
      if (config && config.services && config.services[service]) {
        config.services[service].apiKey = value;
      }
    }

    refreshApiDependentUi();

    // Show success message
    showApiKeyStatus("API Keys saved successfully!", "success");

    // Fetch models for the active service now that keys are available
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
 * Load API keys from localStorage
 */
function loadApiKeys() {
  try {
    // Load each API key from localStorage
    for (const [service, input] of Object.entries(apiKeyInputs)) {
      if (input) {
        const storedKey = localStorage.getItem(`${API_KEYS_STORAGE_PREFIX}${service}`);

        if (storedKey) {
          input.value = storedKey;

          // Update the config object
          if (config && config.services && config.services[service]) {
            config.services[service].apiKey = storedKey;
          }
        } else if (config && config.services && config.services[service] && config.services[service].apiKey) {
          // If nothing in localStorage but key exists in config, show it in the input
          // This preserves any hardcoded keys
          input.value = config.services[service].apiKey;
        }
      }
    }
    // Load LM Studio base URL
    if (lmStudioServerUrlInput) {
      const storedLmUrl = localStorage.getItem(LMSTUDIO_SERVER_URL_KEY);

      if (storedLmUrl) {
        lmStudioServerUrlInput.value = storedLmUrl;

        // Update the config object (ensuring it has the /v1 ending)
        if (config && config.services && config.services.lmstudio) {
          config.services.lmstudio.baseUrl = `${storedLmUrl}/v1`;

          // Proactively fetch models on load if function exists
          if (typeof config.services.lmstudio.fetchAndUpdateModels === "function") {
            config.services.lmstudio.fetchAndUpdateModels().catch(error => {
              console.error("Error fetching LM Studio models on load:", error);
            });
          }
        }
      } else if (config && config.services && config.services.lmstudio && config.services.lmstudio.baseUrl) {
        // If nothing in localStorage but URL exists in config, show it in the input without the /v1 part
        let configLmUrl = config.services.lmstudio.baseUrl;
        if (configLmUrl.endsWith("/v1")) {
          configLmUrl = configLmUrl.slice(0, -3);
        }
        lmStudioServerUrlInput.value = configLmUrl;
      }
    }
    // Load Ollama base URL
    if (ollamaServerUrlInput) {
      const storedOllamaUrl = localStorage.getItem(OLLAMA_SERVER_URL_KEY);

      if (storedOllamaUrl) {
        ollamaServerUrlInput.value = storedOllamaUrl;

        // Update the config object (ensuring it has the /v1 ending)
        if (config && config.services && config.services.ollama) {
          config.services.ollama.baseUrl = `${storedOllamaUrl}/v1`;

          // Proactively fetch models on load if function exists
          if (typeof config.services.ollama.fetchAndUpdateModels === "function") {
            config.services.ollama.fetchAndUpdateModels().catch(error => {
              console.error("Error fetching Ollama models on load:", error);
            });
          }
        }
      } else if (config && config.services && config.services.ollama && config.services.ollama.baseUrl) {
        // If nothing in localStorage but URL exists in config, show it in the input without the /v1 part
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
 * Gets an API key for a service from localStorage
 * @param {string} service - The service to get the key for
 * @returns {string|null} - The API key or null if not found
 */
/**
 * Ensure API keys are loaded and warn if missing
 */
function ensureApiKeysLoaded() {
  // Populate config from localStorage first, independent of the DOM, so key
  // presence is correct even before the input elements are cached.
  loadApiKeysIntoConfig();

  // Then sync the input fields if/when they are available.
  if (typeof loadApiKeys === "function") {
    loadApiKeys();
  }

  if (!config || !config.services) {
    return;
  }

  const service = config.defaultService;

  // Skip warning for services that don't require a key (LM Studio)
  if (isLocalService(service)) {
    return;
  }

  // Track warnings to avoid repetition
  shownApiKeyWarnings = shownApiKeyWarnings || new Set();

  // Notification disabled - users can check API key status in settings if needed
  // if (!apiKey && showWarning && !shownApiKeyWarnings.has(service)) {
  //     const name = service.charAt(0).toUpperCase() + service.slice(1);
  //     showWarning(`${name} API key is missing. Please add it in the API Keys settings.`);
  //     shownApiKeyWarnings.add(service);
  // }
};

/**
 * Show status message in the API keys tab
 * @param {string} message - The message to show
 * @param {string} type - The type of message ('success' or 'error')
 */
function showApiKeyStatus(message: string, type: string = "success") {
  // Remove any existing status message
  const existingStatus = document.querySelector(".api-keys-status") as HTMLElement | null;
  if (existingStatus) {
    existingStatus.remove();
  }

  // Create a new status message
  const statusElement = document.createElement("div");
  statusElement.className = `api-keys-status ${type}`;
  statusElement.textContent = message;

  // Add status message to the DOM
  const apiKeysActionButtons = document.querySelector(".api-keys-action-buttons") as HTMLElement | null;
  if (apiKeysActionButtons) {
    apiKeysActionButtons.insertAdjacentElement("afterend", statusElement);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      statusElement.remove();
    }, 5000);
  }
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

// Initialize API keys management on page load
if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    // Give a small delay to ensure other components are initialized
    setTimeout(() => {
      initApiKeys();

      // Log success message if verbose logging is enabled
      if (state.verboseLogging) {
        console.info("API keys management system initialized");
      }
    }, 100);
  });

  // Initialize API keys when the config object is ready
  // This ensures API keys are loaded even if the DOMContentLoaded event has already fired
  if (typeof window !== "undefined" && config && config.services) {
    initApiKeys();
  }
}
