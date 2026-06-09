/**
 * Service and model initialization for the chatbot application
 */

import { elements, state } from "./state.ts";
import { updateParameterControls } from "../components/ui/settingsControls.ts";
import { updateHeaderInfo, updateModelSelector, updateFeatureStatus, populateServiceSelector } from "../components/settings.ts";
import { updateMasterToolCallingStatus, refreshToolSettingsUI } from "../components/tools.ts";
import { DEFAULT_PERSONALITY, DEFAULT_SHORT_RESPONSE_GUIDELINE, DEFAULT_SYSTEM_PROMPT, config } from "../../config/config.ts";
import { pickCloudFallback } from "./serviceSelection.ts";

/**
 * Initialize services and models
 */
export function initializeServicesAndModels() {
  // Initialize the service selector
  if (elements.serviceSelector && config) {
    populateServiceSelector();
    if (typeof config.normalizeServiceKey === "function") {
      config.defaultService = config.normalizeServiceKey(config.defaultService);
    }
    elements.serviceSelector.value = config.defaultService;
    if (state.verboseLogging) {
      console.info("Service selector initialized.");
    }

    // Model fetching happens after API keys are loaded (see initialization.js)
    updateModelSelector();
  }
}

/**
 * Choose a sensible default provider at startup when no cloud API keys are set.
 *
 * Order: keep the current cloud default if it has a key; otherwise switch to the
 * other cloud provider if it has a key; otherwise probe LM Studio, then Ollama,
 * and switch to the first one that returns models. If none are reachable, leave
 * the default as-is so the UI shows the usual "Set API key to load models" message.
 *
 * @returns {Promise<boolean>} true if this function already fetched models for
 *   the selected service (so the caller can skip its own model fetch).
 */
export async function selectDefaultService() {
  const services = config?.services || {};
  const hasKey = (key: string) => {
    const svc = services[key];
    return Boolean(svc && typeof svc.apiKey === "string" && svc.apiKey.trim() !== "");
  };

  const current = config?.defaultService;
  const currentIsCloud = current === "openai" || current === "xai";

  // Only auto-pick when the default is a cloud provider that has no key of its own.
  if (!currentIsCloud || hasKey(current)) {
    return false;
  }

  const applyService = (key: string) => {
    config.defaultService = key;
    if (elements.serviceSelector) {
      elements.serviceSelector.value = key;
    }
    updateModelSelector();
    updateParameterControls();
    updateHeaderInfo();
  };

  // The default cloud provider has no key. Prefer another cloud provider that
  // does have a key before falling back to local services.
  const cloudFallback = pickCloudFallback(services, current);
  if (cloudFallback) {
    applyService(cloudFallback);
    if (state.verboseLogging) {
      console.info(`No API key for ${current}; defaulting to ${cloudFallback}.`);
    }
    // Return false (not handled) so the caller runs the standard model fetch for
    // the now-current service — unlike the local probe below, we haven't fetched
    // models here yet.
    return false;
  }

  const isUsableModel = (m: any) =>
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
      applyService(local);

      if (state.verboseLogging) {
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
  const serviceKey = config?.defaultService;
  const serviceConfig = serviceKey ? config?.services?.[serviceKey] : null;

  if (serviceConfig && typeof serviceConfig.fetchAndUpdateModels === "function") {
    serviceConfig.fetchAndUpdateModels()
      .then(() => {
        if (state.verboseLogging) {
          console.info("Models fetched on initialization for:", serviceKey);
        }
        // Update model selector after fetching models
        if (config.defaultService === serviceKey) {
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
    state.currentConversationName = `Personality: ${DEFAULT_PERSONALITY}`;
  }
}

/**
 * Initialize default values from configuration
 */
export function initializeDefaultValues() {
  // Initialize default values from config
  if (elements.systemPromptCustom) {
    elements.systemPromptCustom.value = DEFAULT_SYSTEM_PROMPT;
    if (state.verboseLogging) {
      console.info("Default system prompt set.");
    }
  }

  if (elements.personalityInput) {
    elements.personalityInput.value = DEFAULT_PERSONALITY;
    elements.personalityInput.setAttribute("data-explicitly-set", "true");
    if (state.verboseLogging) {
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
  } else if (typeof config.enableFunctionCalling === "boolean") {
    enabled = config.enableFunctionCalling;
  }

  config.enableFunctionCalling = enabled;

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
    state.shortResponseGuideline = "";
  } else {
    state.shortResponseGuideline = DEFAULT_SHORT_RESPONSE_GUIDELINE || "";
  }
}

// Note: initializeLocationService is defined in location.js, not here
