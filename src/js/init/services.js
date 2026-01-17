/**
 * Service and model initialization for the chatbot application
 */

/**
 * Initialize services and models
 */
function initializeServicesAndModels() {
  // Initialize the service selector
  if (window.serviceSelector && window.config) {
    window.populateServiceSelector();
    window.serviceSelector.value = window.config.defaultService;
    if (window.VERBOSE_LOGGING) {
      console.info("Service selector initialized.");
    }

    const isLocalService = window.config.defaultService === "lmstudio" || window.config.defaultService === "ollama";

    // Only update model selector immediately if a local service is not the default
    if (!isLocalService) {
      window.updateModelSelector();
    }

    // Load local models if default service is local
    initializeLocalModels();
  }
}

/**
 * Initialize local models if using a local service
 */
function initializeLocalModels() {
  const serviceKey = window.config?.defaultService;
  const serviceConfig = serviceKey ? window.config?.services?.[serviceKey] : null;

  if (serviceConfig && typeof serviceConfig.fetchAndUpdateModels === "function") {
    serviceConfig.fetchAndUpdateModels()
      .then(() => {
        if (window.VERBOSE_LOGGING) {
          console.info("Local models fetched on initialization");
        }
        // Update model selector after fetching models
        if (window.config.defaultService === serviceKey) {
          window.updateModelSelector();
        }
      })
      .catch(err => {
        console.error("Failed to fetch local models on initialization:", err);
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
// Note: initializeLocationService is defined in location.js, not here
