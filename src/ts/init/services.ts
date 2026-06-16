/**
 * Service and model initialization.
 *
 * @remarks
 * Run during the startup sequence (see `initialization.ts`) to seed the service
 * selector, pick a default provider, fetch its models, and prime the
 * prompt/tool/verbose settings from config and `localStorage`.
 */

import { elements, state } from "./state.ts";
import { updateParameterControls } from "../components/ui/settingsControls.ts";
import { STORAGE_KEYS } from "../utils/storage/storage.ts";
import { updateHeaderInfo, updateModelSelector, updateFeatureStatus, populateServiceSelector } from "../components/settings.ts";
import { updateMasterToolCallingStatus, refreshToolSettingsUI } from "../components/tools.ts";
import { DEFAULT_PERSONALITY, DEFAULT_SHORT_RESPONSE_GUIDELINE, DEFAULT_SYSTEM_PROMPT, config } from "../../config/config.ts";
import { pickCloudFallback } from "./serviceSelection.ts";
import { isCloudService } from "../services/providers.ts";

/**
 * Initializes the service selector from config.
 *
 * @remarks
 * Model fetching happens later, after API keys are loaded (see
 * `initialization.ts`).
 */
export function initializeServicesAndModels() {
  if (elements.serviceSelector && config) {
    populateServiceSelector();
    if (typeof config.normalizeServiceKey === "function") {
      config.defaultService = config.normalizeServiceKey(config.defaultService);
    }
    elements.serviceSelector.value = config.defaultService;
    if (state.verboseLogging) {
      console.info("Service selector initialized.");
    }

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
 * @returns `true` if this function already fetched models for the selected
 *   service (so the caller can skip its own model fetch).
 */
export async function selectDefaultService() {
  const services = config?.services || {};
  const hasKey = (key: string) => {
    const svc = services[key];
    return Boolean(svc && typeof svc.apiKey === "string" && svc.apiKey.trim() !== "");
  };

  const current = config?.defaultService;
  const currentIsCloud = isCloudService(current);

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

  const cloudFallback = pickCloudFallback(services, current);
  if (cloudFallback) {
    applyService(cloudFallback);
    if (state.verboseLogging) {
      console.info(`No API key for ${current}; defaulting to ${cloudFallback}.`);
    }
    return false;
  }

  const isUsableModel = (m: unknown) =>
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
 * Fetches the model list for the current default service when that service
 * supports dynamic fetching, then refreshes the model selector.
 *
 * @remarks
 * No-ops for services without a `fetchAndUpdateModels` function. The selector is
 * only re-rendered if the default service is still the one that was fetched, so
 * a service switch mid-fetch does not clobber the newer selection; on failure
 * the selector is refreshed to surface the error state.
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
        if (config.defaultService === serviceKey) {
          updateModelSelector();
        }
      })
      .catch(err => {
        console.error("Failed to fetch models on initialization:", err);
        updateModelSelector();
      });
  }
}

/**
 * Sets the initial conversation name from the active system-prompt mode.
 *
 * @remarks
 * Derives the name from whichever prompt radio is selected (personality, custom,
 * or none), falling back to the default personality when none is checked.
 */
export function initializeConversationName() {
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
 * Seeds the system-prompt and personality inputs with their configured defaults.
 *
 * @remarks
 * Marks the personality input as explicitly set so later logic treats the
 * default as an intentional value rather than an empty field.
 */
export function initializeDefaultValues() {
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
 * Resolves and applies the tool-calling enabled state, syncing the toggle and
 * dependent status UI.
 *
 * @remarks
 * Resolution order: a stored `localStorage` preference wins, then the config
 * default, then `true`. The resolved value is written back to `config` and
 * reflected in the toggle, the master tool-calling status, and the tool
 * settings UI.
 */
export function initializeToolCalling() {
  let enabled = true;
  const stored = localStorage.getItem(STORAGE_KEYS.enableFunctionCalling);
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
 * Resolves the verbose-mode toggle from storage and adjusts the short-response
 * guideline accordingly.
 *
 * @remarks
 * No-ops when the toggle element is absent. When verbose mode is on the
 * short-response guideline is cleared so replies are not nudged shorter;
 * otherwise it is restored to the configured default.
 */
export function initializeVerboseMode() {
  if (!elements.verboseModeToggle) return;

  let enabled = false;
  const stored = localStorage.getItem(STORAGE_KEYS.verboseModeEnabled);
  if (stored !== null) {
    enabled = stored === "true";
  }

  elements.verboseModeToggle.checked = enabled;
  if (enabled) {
    state.shortResponseGuideline = "";
  } else {
    state.shortResponseGuideline = DEFAULT_SHORT_RESPONSE_GUIDELINE || "";
  }
}

