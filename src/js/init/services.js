/**
 * Service and model initialization for the chatbot application
 */

import { elements, state } from "./state.js";
import { updateParameterControls } from "../components/ui/settingsControls.js";
import { updateHeaderInfo, updateModelSelector, updateFeatureStatus, populateServiceSelector } from "../components/settings.js";
import { updateMasterToolCallingStatus, refreshToolSettingsUI } from "../components/tools.js";

/**
 * Initialize services and models
 */
export function initializeServicesAndModels() {
  // Initialize the service selector
  if (elements.serviceSelector && window.config) {
    populateServiceSelector();
    if (typeof window.config.normalizeServiceKey === "function") {
      window.config.defaultService = window.config.normalizeServiceKey(window.config.defaultService);
    }
    elements.serviceSelector.value = window.config.defaultService;
    if (window.VERBOSE_LOGGING) {
      console.info("Service selector initialized.");
    }

    // Model fetching happens after API keys are loaded (see initialization.js)
    updateModelSelector();
  }
}

/**
 * Choose a sensible default provider at startup when no cloud API keys are set.
 *
 * Order: keep the current cloud default if it has a key; otherwise probe
 * LM Studio, then Ollama, and switch to the first one that returns models.
 * If none are reachable, leave the default as-is so the UI shows the usual
 * "Set API key to load models" message.
 *
 * @returns {Promise<boolean>} true if this function already fetched models for
 *   the selected service (so the caller can skip its own model fetch).
 */
export async function selectDefaultService() {
  const services = window.config?.services || {};
  const hasCloudKey = ["openai", "xai"].some(key => {
    const svc = services[key];
    return svc && typeof svc.apiKey === "string" && svc.apiKey.trim() !== "";
  });

  const current = window.config?.defaultService;
  const currentIsCloud = current === "openai" || current === "xai";

  // Only auto-pick when the default is a cloud provider with no key available.
  if (hasCloudKey || !currentIsCloud) {
    return false;
  }

  const isUsableModel = (m) =>
    typeof m === "string" &&
    !m.startsWith("Error") &&
    !m.startsWith("No models") &&
    !m.startsWith("Set API key");

  for (const local of ["lmstudio", "ollama"]) {
    const svc = services[local];
    if (!svc || typeof svc.fetchAndUpdateModels !== "function") {
      continue;
    }
    try {
      await svc.fetchAndUpdateModels();
    } catch (error) {
      console.warn(`Probe of ${local} failed:`, error);
      continue;
    }
    if (Array.isArray(svc.models) && svc.models.some(isUsableModel)) {
      window.config.defaultService = local;
      if (elements.serviceSelector) {
        elements.serviceSelector.value = local;
      }
      updateModelSelector();

      updateParameterControls();
      updateHeaderInfo();

      if (window.VERBOSE_LOGGING) {
        console.info(`No cloud API keys found; defaulting to ${local}.`);
      }
      return true;
    }
  }

  return false;
}

/**
 * Initialize models for services that fetch dynamically
 */
export function initializeServiceModels() {
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
          updateModelSelector();
        }
      })
      .catch(err => {
        console.error("Failed to fetch models on initialization:", err);
        // Still update model selector to show error state
        updateModelSelector();
      });
  }
}

/**
 * Initialize conversation name based on current settings
 */
export function initializeConversationName() {
  // Set initial conversation name based on personality/prompt type
  if (elements.personalityPromptRadio && elements.personalityPromptRadio.checked && elements.personalityInput) {
    state.currentConversationName = `Personality: ${elements.personalityInput.value.trim()}`;
  } else if (elements.customPromptRadio && elements.customPromptRadio.checked) {
    state.currentConversationName = "Custom Prompt";
  } else if (elements.noPromptRadio && elements.noPromptRadio.checked) {
    state.currentConversationName = "No System Prompt";
  } else {
    state.currentConversationName = `Personality: ${window.DEFAULT_PERSONALITY}`;
  }
}

/**
 * Initialize default values from configuration
 */
export function initializeDefaultValues() {
  // Initialize default values from config
  if (elements.systemPromptCustom) {
    elements.systemPromptCustom.value = window.DEFAULT_SYSTEM_PROMPT;
    if (window.VERBOSE_LOGGING) {
      console.info("Default system prompt set.");
    }
  }

  if (elements.personalityInput) {
    elements.personalityInput.value = window.DEFAULT_PERSONALITY;
    elements.personalityInput.setAttribute("data-explicitly-set", "true");
    if (window.VERBOSE_LOGGING) {
      console.info("Default personality set.");
    }
  }
}

/**
 * Initialize tool calling toggle state
 */
export function initializeToolCalling() {
  let enabled = true;
  const stored = localStorage.getItem("enableFunctionCalling");
  if (stored !== null) {
    enabled = stored === "true";
  } else if (typeof window.config.enableFunctionCalling === "boolean") {
    enabled = window.config.enableFunctionCalling;
  }

  window.config.enableFunctionCalling = enabled;

  if (elements.toolCallingToggle) {
    elements.toolCallingToggle.checked = enabled;
    elements.toolCallingToggle.disabled = false;
    elements.toolCallingToggle.removeAttribute("aria-disabled");
    elements.toolCallingToggle.title = enabled ? "Tool calling is enabled." : "Tool calling is disabled.";
  }

  updateMasterToolCallingStatus(enabled);

  updateFeatureStatus();

  refreshToolSettingsUI();
}

/**
 * Initialize Verbose Mode toggle
 */
export function initializeVerboseMode() {
  if (!elements.verboseModeToggle) return;

  let enabled = false;
  const stored = localStorage.getItem("verboseModeEnabled");
  if (stored !== null) {
    enabled = stored === "true";
  }

  elements.verboseModeToggle.checked = enabled;
  // Set the guideline string based on toggle
  if (enabled) {
    window.SHORT_RESPONSE_GUIDELINE = "";
  } else {
    window.SHORT_RESPONSE_GUIDELINE = window.DEFAULT_SHORT_RESPONSE_GUIDELINE || "";
  }
}

// Note: initializeLocationService is defined in location.js, not here
