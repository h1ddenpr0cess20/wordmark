/**
 * API key management functionality
 */

// -----------------------------------------------------
// API key management functions
// -----------------------------------------------------

// Storage keys for local storage
const API_KEYS_STORAGE_PREFIX = "wordmark_api_key_";
const LMSTUDIO_SERVER_URL_KEY = "wordmark_lmstudio_server_url";
const OLLAMA_SERVER_URL_KEY = "wordmark_ollama_server_url";
const API_KEYS_INIT_MAX_RETRIES = 40;
const API_KEYS_INIT_RETRY_DELAY = 150;

// DOM element references
window.apiKeyInputs = {
  openai: null,
  xai: null,
  // huggingface: null,
};

window.saveApiKeysButton = null;
window.lmStudioServerUrlInput = null;
window.saveLmStudioUrlButton = null;
window.ollamaServerUrlInput = null;
window.saveOllamaUrlButton = null;
window.__apiKeysEventHandlersApplied = window.__apiKeysEventHandlersApplied || false;

/**
 * Initialize API key management functionality
 */
window.initApiKeys = function(retryCount = 0) {
  // Get DOM references for main API keys
  const openaiInput = document.getElementById("openai-api-key");
  const xaiInput = document.getElementById("xai-api-key");
  // const huggingfaceInput = document.getElementById("huggingface-api-key");
  const saveKeysButton = document.getElementById("save-api-keys");
  const lmStudioUrlInput = document.getElementById("lmstudio-server-url");
  const saveLmStudioButton = document.getElementById("save-lmstudio-url");
  const ollamaUrlInput = document.getElementById("ollama-server-url");
  const saveOllamaButton = document.getElementById("save-ollama-url");

  const essentialReady = Boolean(saveKeysButton && (openaiInput || xaiInput || lmStudioUrlInput || ollamaUrlInput));

  if (!essentialReady) {
    if (retryCount < API_KEYS_INIT_MAX_RETRIES) {
      setTimeout(() => window.initApiKeys(retryCount + 1), API_KEYS_INIT_RETRY_DELAY);
    } else if (window.VERBOSE_LOGGING) {
      console.warn("API Keys UI not ready after maximum retries; will retry on next init call.");
    }
    return;
  }

  window.apiKeyInputs.openai = openaiInput;
  window.apiKeyInputs.xai = xaiInput;
  // window.apiKeyInputs.huggingface = huggingfaceInput;
  window.saveApiKeysButton = saveKeysButton;
  window.lmStudioServerUrlInput = lmStudioUrlInput;
  window.saveLmStudioUrlButton = saveLmStudioButton;
  window.ollamaServerUrlInput = ollamaUrlInput;
  window.saveOllamaUrlButton = saveOllamaButton;

  if (!window.__apiKeysEventHandlersApplied) {
    // Add click handlers to prevent propagation on all input fields
    Object.values(window.apiKeyInputs).forEach(input => {
      if (input) {
        input.addEventListener("click", (event) => {
          event.stopPropagation();
        });
      }
    });

    // Also add click handler for LM Studio server URL input
    if (window.lmStudioServerUrlInput) {
      window.lmStudioServerUrlInput.addEventListener("click", (event) => {
        event.stopPropagation();
      });
    }
    if (window.ollamaServerUrlInput) {
      window.ollamaServerUrlInput.addEventListener("click", (event) => {
        event.stopPropagation();
      });
    }

    // Get password toggle buttons
    const toggleButtons = document.querySelectorAll(".toggle-password");
    // Add event listeners to toggle password visibility
    toggleButtons.forEach(button => {
      button.addEventListener("click", function(event) {
        // Prevent the event from propagating up to parent elements
        event.preventDefault();
        event.stopPropagation();

        const inputId = this.getAttribute("data-for");
        const input = document.getElementById(inputId);

        // Masking is handled via CSS on .secret-input.masked
        if (input && input.classList) {
          if (input.classList.contains("masked")) {
            input.classList.remove("masked");
            this.innerHTML = window.icon("eye-off", { width: 16, height: 16 });
          } else {
            input.classList.add("masked");
            this.innerHTML = window.icon("eye", { width: 16, height: 16 });
          }
        }
      });
    });

    // Add event listener to save button
    if (window.saveApiKeysButton) {
      window.saveApiKeysButton.addEventListener("click", (event) => {
        // Prevent event propagation
        event.preventDefault();
        event.stopPropagation();
        window.saveApiKeys();
      });
    }

    // Add event listener to save LM Studio URL button
    if (window.saveLmStudioUrlButton) {
      window.saveLmStudioUrlButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        window.saveLmStudioServerUrl();
      });
    }
    if (window.saveOllamaUrlButton) {
      window.saveOllamaUrlButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        window.saveOllamaServerUrl();
      });
    }

    window.__apiKeysEventHandlersApplied = true;
  }

  // Load API keys from storage
  window.loadApiKeys();
};

/**
 * Save LM Studio server URL to localStorage
 */
window.saveLmStudioServerUrl = function() {
  try {
    if (window.lmStudioServerUrlInput && window.lmStudioServerUrlInput.value) {
      let serverUrl = window.lmStudioServerUrlInput.value.trim();

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
      if (window.config && window.config.services && window.config.services.lmstudio) {
        window.config.services.lmstudio.baseUrl = `${serverUrl}/v1`;

        // Fetch models from the new URL so the dropdown refreshes
        if (typeof window.config.services.lmstudio.fetchAndUpdateModels === "function") {
          window.config.services.lmstudio.fetchAndUpdateModels().catch(error => {
            console.error("Error fetching LM Studio models after URL update:", error);
          });
        }
      }

      // Show success message in the LM Studio section
      const existingStatus = document.querySelector(".lmstudio-status");
      if (existingStatus) {
        existingStatus.remove();
      }

      const statusElement = document.createElement("div");
      statusElement.className = "lmstudio-status success";
      statusElement.textContent = "LM Studio Base URL saved successfully!";

      const lmstudioActionButtons = document.querySelector(".lmstudio-action-buttons");
      if (lmstudioActionButtons) {
        lmstudioActionButtons.insertAdjacentElement("afterend", statusElement);

        // Auto-remove after 5 seconds
        setTimeout(() => {
          statusElement.remove();
        }, 5000);
      }

      if (window.VERBOSE_LOGGING) {
        console.info("LM Studio Base URL saved to localStorage:", serverUrl);
      }
    } else {
      // Show error message in the LM Studio section
      const existingStatus = document.querySelector(".lmstudio-status");
      if (existingStatus) {
        existingStatus.remove();
      }

      const statusElement = document.createElement("div");
      statusElement.className = "lmstudio-status error";
      statusElement.textContent = "Please enter a valid LM Studio Base URL";

      const lmstudioActionButtons = document.querySelector(".lmstudio-action-buttons");
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
    const existingStatus = document.querySelector(".lmstudio-status");
    if (existingStatus) {
      existingStatus.remove();
    }

    const statusElement = document.createElement("div");
    statusElement.className = "lmstudio-status error";
    statusElement.textContent = "Error saving LM Studio Base URL";

    const lmstudioActionButtons = document.querySelector(".lmstudio-action-buttons");
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
window.saveOllamaServerUrl = function() {
  try {
    if (window.ollamaServerUrlInput && window.ollamaServerUrlInput.value) {
      let serverUrl = window.ollamaServerUrlInput.value.trim();

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
      if (window.config && window.config.services && window.config.services.ollama) {
        window.config.services.ollama.baseUrl = `${serverUrl}/v1`;

        // Fetch models from the new URL so the dropdown refreshes
        if (typeof window.config.services.ollama.fetchAndUpdateModels === "function") {
          window.config.services.ollama.fetchAndUpdateModels().catch(error => {
            console.error("Error fetching Ollama models after URL update:", error);
          });
        }
      }

      // Show success message in the Ollama section
      const existingStatus = document.querySelector(".ollama-status");
      if (existingStatus) {
        existingStatus.remove();
      }

      const statusElement = document.createElement("div");
      statusElement.className = "ollama-status success";
      statusElement.textContent = "Ollama Base URL saved successfully!";

      const ollamaActionButtons = document.querySelector(".ollama-action-buttons");
      if (ollamaActionButtons) {
        ollamaActionButtons.insertAdjacentElement("afterend", statusElement);

        // Auto-remove after 5 seconds
        setTimeout(() => {
          statusElement.remove();
        }, 5000);
      }

      if (window.VERBOSE_LOGGING) {
        console.info("Ollama Base URL saved to localStorage:", serverUrl);
      }
    } else {
      // Show error message in the Ollama section
      const existingStatus = document.querySelector(".ollama-status");
      if (existingStatus) {
        existingStatus.remove();
      }

      const statusElement = document.createElement("div");
      statusElement.className = "ollama-status error";
      statusElement.textContent = "Please enter a valid Ollama Base URL";

      const ollamaActionButtons = document.querySelector(".ollama-action-buttons");
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
    const existingStatus = document.querySelector(".ollama-status");
    if (existingStatus) {
      existingStatus.remove();
    }

    const statusElement = document.createElement("div");
    statusElement.className = "ollama-status error";
    statusElement.textContent = "Error saving Ollama Base URL";

    const ollamaActionButtons = document.querySelector(".ollama-action-buttons");
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
window.saveApiKeys = function() {
  try {
    // Save each API key to localStorage
    for (const [service, input] of Object.entries(window.apiKeyInputs)) {
      if (input && input.value) {
        localStorage.setItem(`${API_KEYS_STORAGE_PREFIX}${service}`, input.value);

        // Update the config object
        if (window.config && window.config.services && window.config.services[service]) {
          window.config.services[service].apiKey = input.value;
        }
      }
    }

    // Show success message
    window.showApiKeyStatus("API Keys saved successfully!", "success");
    // Update the UI to reflect the new keys
    if (typeof window.updateModelSelector === "function") {
      window.updateModelSelector(false); // Don't commit the model selection
    }

    if (window.VERBOSE_LOGGING) {
      console.info("API keys saved to localStorage");
    }
  } catch (error) {
    console.error("Error saving API keys:", error);
    window.showApiKeyStatus("Error saving API keys", "error");
  }
};

/**
 * Load API keys from localStorage
 */
window.loadApiKeys = function() {
  try {
    // Load each API key from localStorage
    for (const [service, input] of Object.entries(window.apiKeyInputs)) {
      if (input) {
        const storedKey = localStorage.getItem(`${API_KEYS_STORAGE_PREFIX}${service}`);

        if (storedKey) {
          input.value = storedKey;

          // Update the config object
          if (window.config && window.config.services && window.config.services[service]) {
            window.config.services[service].apiKey = storedKey;
          }
        } else if (window.config && window.config.services && window.config.services[service] && window.config.services[service].apiKey) {
          // If nothing in localStorage but key exists in config, show it in the input
          // This preserves any hardcoded keys
          input.value = window.config.services[service].apiKey;
        }
      }
    }
    // Load LM Studio base URL
    if (window.lmStudioServerUrlInput) {
      const storedLmUrl = localStorage.getItem(LMSTUDIO_SERVER_URL_KEY);

      if (storedLmUrl) {
        window.lmStudioServerUrlInput.value = storedLmUrl;

        // Update the config object (ensuring it has the /v1 ending)
        if (window.config && window.config.services && window.config.services.lmstudio) {
          window.config.services.lmstudio.baseUrl = `${storedLmUrl}/v1`;

          // Proactively fetch models on load if function exists
          if (typeof window.config.services.lmstudio.fetchAndUpdateModels === "function") {
            window.config.services.lmstudio.fetchAndUpdateModels().catch(error => {
              console.error("Error fetching LM Studio models on load:", error);
            });
          }
        }
      } else if (window.config && window.config.services && window.config.services.lmstudio && window.config.services.lmstudio.baseUrl) {
        // If nothing in localStorage but URL exists in config, show it in the input without the /v1 part
        let configLmUrl = window.config.services.lmstudio.baseUrl;
        if (configLmUrl.endsWith("/v1")) {
          configLmUrl = configLmUrl.slice(0, -3);
        }
        window.lmStudioServerUrlInput.value = configLmUrl;
      }
    }
    // Load Ollama base URL
    if (window.ollamaServerUrlInput) {
      const storedOllamaUrl = localStorage.getItem(OLLAMA_SERVER_URL_KEY);

      if (storedOllamaUrl) {
        window.ollamaServerUrlInput.value = storedOllamaUrl;

        // Update the config object (ensuring it has the /v1 ending)
        if (window.config && window.config.services && window.config.services.ollama) {
          window.config.services.ollama.baseUrl = `${storedOllamaUrl}/v1`;

          // Proactively fetch models on load if function exists
          if (typeof window.config.services.ollama.fetchAndUpdateModels === "function") {
            window.config.services.ollama.fetchAndUpdateModels().catch(error => {
              console.error("Error fetching Ollama models on load:", error);
            });
          }
        }
      } else if (window.config && window.config.services && window.config.services.ollama && window.config.services.ollama.baseUrl) {
        // If nothing in localStorage but URL exists in config, show it in the input without the /v1 part
        let configOllamaUrl = window.config.services.ollama.baseUrl;
        if (configOllamaUrl.endsWith("/v1")) {
          configOllamaUrl = configOllamaUrl.slice(0, -3);
        }
        window.ollamaServerUrlInput.value = configOllamaUrl;
      }
    }
    if (window.VERBOSE_LOGGING) {
      console.info("API keys loaded from localStorage");
    }
  } catch (error) {
    console.error("Error loading API keys:", error);
  }
};

/**
 * Gets an API key for a service from localStorage
 * @param {string} service - The service to get the key for
 * @returns {string|null} - The API key or null if not found
 */
window.getApiKey = function(service) {
  try {
    // Try localStorage first
    const storedKey = localStorage.getItem(`${API_KEYS_STORAGE_PREFIX}${service}`);
    if (storedKey) {
      return storedKey;
    }

    // Fall back to config if exists
    if (window.config?.services?.[service]?.apiKey) {
      return window.config.services[service].apiKey;
    }

    return null;
  } catch (error) {
    console.error(`Error getting API key for ${service}:`, error); return null;
  }
};

/**
 * Gets a tool API key for a service from localStorage
 * @param {string} service - The service to get the key for (e.g., 'rapidapi', 'alphavantage')
 * @returns {string|null} - The API key or null if not found
 */
window.getToolApiKey = function(service) {
  try {
  // Try localStorage first
    const storedKey = localStorage.getItem(`wordmark_tool_api_key_${service}`);
    if (storedKey) {
      return storedKey;
    }

    return null;
  } catch (error) {
    console.error(`Error getting tool API key for ${service}:`, error);
    return null;
  }
};

/**
 * Gets the LM Studio server URL from localStorage
 * @returns {string} - The LM Studio Base URL including /v1
 */
window.getLmStudioServerUrl = function() {
  try {
    // Try localStorage first
    let storedUrl = localStorage.getItem(LMSTUDIO_SERVER_URL_KEY);
    if (storedUrl) {
      // Ensure the URL ends with /v1
      if (!storedUrl.endsWith("/v1")) {
        storedUrl = `${storedUrl}/v1`;
      }
      return storedUrl;
    }

    // Fall back to config if exists
    if (window.config?.services?.lmstudio?.baseUrl) {
      return window.config.services.lmstudio.baseUrl;
    }

    // Default fallback
    return "http://localhost:1234/v1";
  } catch (error) {
    console.error("Error getting LM Studio server URL:", error);
    return "http://localhost:1234/v1";
  }
};

/**
 * Gets the Ollama server URL from localStorage
 * @returns {string} - The Ollama Base URL including /v1
 */
window.getOllamaServerUrl = function() {
  try {
    // Try localStorage first
    let storedUrl = localStorage.getItem(OLLAMA_SERVER_URL_KEY);
    if (storedUrl) {
      // Ensure the URL ends with /v1
      if (!storedUrl.endsWith("/v1")) {
        storedUrl = `${storedUrl}/v1`;
      }
      return storedUrl;
    }

    // Fall back to config if exists
    if (window.config?.services?.ollama?.baseUrl) {
      return window.config.services.ollama.baseUrl;
    }

    // Default fallback
    return "http://localhost:11434/v1";
  } catch (error) {
    console.error("Error getting Ollama server URL:", error);
    return "http://localhost:11434/v1";
  }
};

/**
 * Ensure API keys are loaded and warn if missing
 */
window.ensureApiKeysLoaded = function() {
  // Load keys if not already loaded
  if (typeof window.loadApiKeys === "function") {
    window.loadApiKeys();
  }

  if (!window.config || !window.config.services) {
    return;
  }

  const service = window.config.defaultService;

  // Skip warning for services that don't require a key (LM Studio)
  if (service === "lmstudio" || service === "ollama") {
    return;
  }

  // Track warnings to avoid repetition
  window._shownApiKeyWarnings = window._shownApiKeyWarnings || new Set();

  // Notification disabled - users can check API key status in settings if needed
  // if (!apiKey && window.showWarning && !window._shownApiKeyWarnings.has(service)) {
  //     const name = service.charAt(0).toUpperCase() + service.slice(1);
  //     window.showWarning(`${name} API key is missing. Please add it in the API Keys settings.`);
  //     window._shownApiKeyWarnings.add(service);
  // }
};

/**
 * Show status message in the API keys tab
 * @param {string} message - The message to show
 * @param {string} type - The type of message ('success' or 'error')
 */
window.showApiKeyStatus = function(message, type = "success") {
  // Remove any existing status message
  const existingStatus = document.querySelector(".api-keys-status");
  if (existingStatus) {
    existingStatus.remove();
  }

  // Create a new status message
  const statusElement = document.createElement("div");
  statusElement.className = `api-keys-status ${type}`;
  statusElement.textContent = message;

  // Add status message to the DOM
  const apiKeysActionButtons = document.querySelector(".api-keys-action-buttons");
  if (apiKeysActionButtons) {
    apiKeysActionButtons.insertAdjacentElement("afterend", statusElement);

    // Auto-remove after 5 seconds
    setTimeout(() => {
      statusElement.remove();
    }, 5000);
  }
};

// Initialize API keys management on page load
document.addEventListener("DOMContentLoaded", () => {
  // Give a small delay to ensure other components are initialized
  setTimeout(() => {
    window.initApiKeys();

    // Log success message if verbose logging is enabled
    if (window.VERBOSE_LOGGING) {
      console.info("API keys management system initialized");
    }
  }, 100);
});

// Initialize API keys when the config object is ready
// This ensures API keys are loaded even if the DOMContentLoaded event has already fired
if (window.config && window.config.services) {
  window.initApiKeys();
}
