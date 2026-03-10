/**
 * Service and model initialization for the chatbot application
 */

/**
 * Check if a cloud service has a stored API key
 */
function hasStoredApiKey(service) {
  try {
    const key = localStorage.getItem(`wordmark_api_key_${service}`);
    return Boolean(key && key.trim());
  } catch {
    return false;
  }
}

/**
 * Probe a local server to see if it's running
 */
async function isLocalServerAvailable(baseUrl) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/models`, { signal: controller.signal });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Resolve the best default service based on available API keys and local servers
 */
async function resolveDefaultService() {
  const configured = window.config.defaultService;
  const isCloudService = configured === 'openai' || configured === 'xai';

  // If the configured default is a cloud service with a stored key, use it
  if (!isCloudService || hasStoredApiKey(configured)) {
    return configured;
  }

  // No API key for the configured cloud service — try local servers
  const lmstudioUrl = window.config.services.lmstudio?.baseUrl;
  if (lmstudioUrl && await isLocalServerAvailable(lmstudioUrl)) {
    return 'lmstudio';
  }

  const ollamaUrl = window.config.services.ollama?.baseUrl;
  if (ollamaUrl && await isLocalServerAvailable(ollamaUrl)) {
    return 'ollama';
  }

  // No local servers available either — fall back to configured default
  return configured;
}

/**
 * Initialize services and models
 */
function initializeServicesAndModels() {
  // Initialize the service selector
  if (window.serviceSelector && window.config) {
    window.populateServiceSelector();

    // Resolve the best service (may probe local servers)
    resolveDefaultService().then(service => {
      window.config.defaultService = service;
      window.serviceSelector.value = service;
      if (window.VERBOSE_LOGGING) {
        console.info("Service selector initialized with:", service);
      }

      // Update UI controls for the resolved service
      if (typeof window.updateParameterControls === 'function') {
        window.updateParameterControls();
      }
      window.updateModelSelector();

      // Fetch models now that service is resolved and keys may be loaded
      if (typeof window.initializeServiceModels === 'function') {
        window.initializeServiceModels();
      }
    });
  }
}

/**
 * Initialize models for services that fetch dynamically
 */
function initializeServiceModels() {
  const serviceKey = window.config?.defaultService;
  const serviceConfig = serviceKey ? window.config?.services?.[serviceKey] : null;

  if (serviceConfig && typeof serviceConfig.fetchAndUpdateModels === "function") {
    serviceConfig.fetchAndUpdateModels()
      .then(() => {
        if (window.VERBOSE_LOGGING) {
          console.info("Models fetched on initialization for:", serviceKey);
        }
        // Update model selector after fetching models
        if (window.config.defaultService === serviceKey) {
          window.updateModelSelector();
        }
      })
      .catch(err => {
        console.error("Failed to fetch models on initialization:", err);
        // Still update model selector to show error state
        window.updateModelSelector();
      });
  }
}

/**
 * Initialize conversation name based on current settings
 */
function initializeConversationName() {
  // Set initial conversation name based on personality/prompt type
  if (window.personalityPromptRadio && window.personalityPromptRadio.checked && window.personalityInput) {
    window.currentConversationName = `Personality: ${window.personalityInput.value.trim()}`;
  } else if (window.customPromptRadio && window.customPromptRadio.checked) {
    window.currentConversationName = "Custom Prompt";
  } else if (window.noPromptRadio && window.noPromptRadio.checked) {
    window.currentConversationName = "No System Prompt";
  } else {
    window.currentConversationName = `Personality: ${window.DEFAULT_PERSONALITY}`;
  }
}

/**
 * Initialize default values from configuration
 */
function initializeDefaultValues() {
  // Initialize default values from config
  if (window.systemPromptCustom) {
    window.systemPromptCustom.value = window.DEFAULT_SYSTEM_PROMPT;
    if (window.VERBOSE_LOGGING) {
      console.info("Default system prompt set.");
    }
  }

  if (window.personalityInput) {
    window.personalityInput.value = window.DEFAULT_PERSONALITY;
    window.personalityInput.setAttribute("data-explicitly-set", "true");
    if (window.VERBOSE_LOGGING) {
      console.info("Default personality set.");
    }
  }
}

/**
 * Initialize tool calling toggle state
 */
function initializeToolCalling() {
  let enabled = true;
  const stored = localStorage.getItem("enableFunctionCalling");
  if (stored !== null) {
    enabled = stored === "true";
  } else if (typeof window.config.enableFunctionCalling === "boolean") {
    enabled = window.config.enableFunctionCalling;
  }

  window.config.enableFunctionCalling = enabled;

  if (window.toolCallingToggle) {
    window.toolCallingToggle.checked = enabled;
    window.toolCallingToggle.disabled = false;
    window.toolCallingToggle.removeAttribute("aria-disabled");
    window.toolCallingToggle.title = enabled ? "Tool calling is enabled." : "Tool calling is disabled.";
  }

  if (typeof window.updateMasterToolCallingStatus === "function") {
    window.updateMasterToolCallingStatus(enabled);
  }

  if (typeof window.updateFeatureStatus === "function") {
    window.updateFeatureStatus();
  }

  if (typeof window.refreshToolSettingsUI === "function") {
    window.refreshToolSettingsUI();
  }
}

/**
 * Initialize Verbose Mode toggle
 */
function initializeVerboseMode() {
  if (!window.verboseModeToggle) return;

  let enabled = false;
  const stored = localStorage.getItem("verboseModeEnabled");
  if (stored !== null) {
    enabled = stored === "true";
  }

  window.verboseModeToggle.checked = enabled;
  // Set the guideline string based on toggle
  if (enabled) {
    window.SHORT_RESPONSE_GUIDELINE = "";
  } else {
    window.SHORT_RESPONSE_GUIDELINE = window.DEFAULT_SHORT_RESPONSE_GUIDELINE || "";
  }
}

// Make functions available globally
window.initializeServicesAndModels = initializeServicesAndModels;
window.initializeConversationName = initializeConversationName;
window.initializeDefaultValues = initializeDefaultValues;
window.initializeToolCalling = initializeToolCalling;
window.initializeVerboseMode = initializeVerboseMode;
window.initializeServiceModels = initializeServiceModels;
// Note: initializeLocationService is defined in location.js, not here
