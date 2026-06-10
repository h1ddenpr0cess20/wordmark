import { elements } from "../init/state.ts";
import { uiHooks } from "../init/uiHooks.ts";
import { DEFAULT_PERSONALITY, config } from "../../config/config.ts";
import { getMemoryConfig, setMemoryEnabled } from "../utils/memoryStorage.ts";
import { locationState, requestLocation, disableLocation } from "../services/location.ts";
import { ttsConfig } from "../services/tts.ts";
import { updateReasoningAvailability } from "../init/modelSettings.ts";
import { openSettingsAndSwitch } from "../init/eventListeners/settingsPanel.ts";
/**
 * Settings panel related functionality
 */

// Form controls share a `disabled` property; used when toggling tab UI.
type FormControl = HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement;

// -----------------------------------------------------
// Settings panel functions
// -----------------------------------------------------

/**
 * Updates the local models dropdown when models are refreshed.
 * Registered on the uiHooks registry so config.js can call it after fetching
 * provider models without importing the component graph.
 * @param {boolean} [fetchError] - Whether there was an error fetching models
 */
export function updateModelsDropdown(fetchError?: boolean) {
  const serviceKey = elements.serviceSelector ? elements.serviceSelector.value : "";
  const serviceLabelMap: Record<string, string> = { lmstudio: "LM Studio", ollama: "Ollama", openai: "OpenAI", xai: "xAI" };
  const serviceLabel = serviceLabelMap[serviceKey] || serviceKey;

  updateModelSelector();

  // Show status message if there was an error
  if (fetchError) {
    // Remove any existing status message
    const existingStatus = document.querySelector(".service-status");
    if (existingStatus) {
      existingStatus.remove();
    }

    // Create a new status message
    const statusElement = document.createElement("div");
    statusElement.className = "service-status error";
    statusElement.textContent = `Failed to fetch ${serviceLabel} models. Check server connection.`;

    // Add status message to the DOM
    const statusAnchor = document.querySelector(".model-selector-container") || document.querySelector(".lmstudio-action-buttons");
    if (statusAnchor) {
      statusAnchor.insertAdjacentElement("afterend", statusElement);

      // Auto-remove after 5 seconds
      setTimeout(() => {
        statusElement.remove();
      }, 5000);
    }
  }
}

// Register on the uiHooks registry so config.js can trigger dropdown refreshes
// after fetching provider models without importing the component graph.
uiHooks.updateModelsDropdown = updateModelsDropdown;

/**
 * Updates the header information
 */
export function updateHeaderInfo() {
  const headerTitle = document.getElementById("header-title");
  const modelInfo = document.getElementById("model-info");

  // Check if required elements exist
  if (!headerTitle || !modelInfo || !elements.modelSelector) {
    console.warn("Header elements not found, skipping updateHeaderInfo");
    return;
  }

  const model = elements.modelSelector.value;

  try {
    // Set model name as the main header title
    if (model && model !== "error" && model !== "no-models") {
      headerTitle.textContent = `${model}`;
      elements.modelSelector.setAttribute("data-last-selected", model);
    } else {
      headerTitle.textContent = "AI Assistant";
    }

    // Update native title on the model name with provider display name
    try {
      const serviceKey = (config && config.defaultService) ? config.defaultService : "";
      let displayName = "";
      switch (serviceKey) {
      case "openai": displayName = "OpenAI"; break;
      case "xai": displayName = "xAI (Grok)"; break;
      // case "huggingface": displayName = "Hugging Face"; break;
      case "lmstudio": displayName = "LM Studio (Local)"; break;
      case "ollama": displayName = "Ollama (Local)"; break;
      default: displayName = serviceKey ? (serviceKey.charAt(0).toUpperCase() + serviceKey.slice(1)) : "";
      }
      if (displayName) {
        headerTitle.removeAttribute("data-tooltip");
        headerTitle.setAttribute("title", `Provider: ${displayName}`);
      } else {
        headerTitle.removeAttribute("data-tooltip");
        headerTitle.removeAttribute("title");
      }
    } catch { /* noop */ }

    // Show personality or prompt info in the modelInfo area
    let promptInfo = "";
    const personalityInput = elements.personalityInput;
    const systemPromptCustom = elements.systemPromptCustom;
    if (elements.personalityPromptRadio?.checked && personalityInput && personalityInput.value.trim() !== "") {
      // Only show personality if the user has actively set it
      if (personalityInput.hasAttribute("data-explicitly-set") &&
          personalityInput.getAttribute("data-explicitly-set") === "true") {
        promptInfo = `Personality: ${personalityInput.value.trim()}`;
      }
    } else if (elements.customPromptRadio?.checked && systemPromptCustom && systemPromptCustom.value.trim() !== "") {
      promptInfo = systemPromptCustom.value.trim();
    } else if (elements.noPromptRadio && elements.noPromptRadio.checked) {
      promptInfo = "No system prompt";
    }

    // Always display something in the model info area even if empty
    if (!promptInfo) {
      // Only show default personality in the header if it's actually set in the input
      // Don't automatically override the personality input value here
      if (DEFAULT_PERSONALITY && elements.personalityInput && elements.personalityInput.value.trim()) {
        promptInfo = `Personality: ${elements.personalityInput.value.trim()}`;
      } else if (DEFAULT_PERSONALITY) {
        promptInfo = `Personality: ${DEFAULT_PERSONALITY}`;
      }
    }

    modelInfo.textContent = promptInfo;
    modelInfo.title = promptInfo; // Tooltip will show full text on hover
  } catch (error) {
    console.error("Error updating header info:", error);
    headerTitle.textContent = "AI Assistant";
    modelInfo.textContent = "Configuration error";
  }

  // Update feature status line as part of header refresh
  try { updateFeatureStatus(); } catch { /* noop */ }

  updateReasoningAvailability();
}

/**
 * Data settings enable/disable control (persisted in localStorage)
 */
export function getDataSettingsEnabled() {
  try {
    const v = localStorage.getItem("dataSettingsEnabled");
    return v === null ? true : v === "true";
  } catch {
    return true;
  }
}

export function setDataSettingsEnabled(enabled: boolean) {
  try {
    localStorage.setItem("dataSettingsEnabled", enabled ? "true" : "false");
  } catch { /* noop */ }

  // Reflect state in the Data tab toggle without re-triggering change handler
  const toggle = elements.dataSettingsToggle || (document.getElementById("data-settings-toggle") as HTMLInputElement | null);
  if (toggle) {
    toggle.checked = enabled;
  }

  try { applyDataSettingsState(); } catch { /* noop */ }

  // Keep header feature badges in sync
  try { updateFeatureStatus(); } catch { /* noop */ }
}

export function applyDataSettingsState() {
  const content = document.getElementById("content-data");
  if (!content) return;
  const enabled = getDataSettingsEnabled();

  if (enabled) {
    // Re-enable tab UI
    content.removeAttribute("data-disabled");
    const banner = content.querySelector(".data-disabled-banner");
    if (banner) banner.remove();

    // Enable all interactive elements
    content.querySelectorAll<HTMLElement>(".settings-group").forEach((group) => {
      group.removeAttribute("inert");
      group.querySelectorAll<FormControl>("input, button, select, textarea").forEach((el) => {
        el.disabled = false;
        el.removeAttribute("aria-disabled");
      });
    });
  } else {
    // Disable tab UI
    content.setAttribute("data-disabled", "true");

    // Insert banner if not present
    if (!content.querySelector(".data-disabled-banner")) {
      const banner = document.createElement("div");
      banner.className = "data-disabled-banner";
      banner.textContent = "Data settings are disabled";
      content.insertBefore(banner, content.firstChild);
    }

    // Disable all groups except the one containing the master toggle
    const groups = Array.from(content.querySelectorAll<HTMLElement>(".settings-group"));
    groups.forEach((group) => {
      const hasMasterToggle = Boolean(group.querySelector("#data-settings-toggle"));
      if (hasMasterToggle) {
        // Keep the master toggle interactive
        group.removeAttribute("inert");
        const toggle = group.querySelector<HTMLInputElement>("#data-settings-toggle");
        if (toggle) {
          toggle.disabled = false;
          toggle.removeAttribute("aria-disabled");
        }
        // Ensure the visual switch and container remain clickable
        const switchEl = group.querySelector<HTMLElement>("label[for=\"data-settings-toggle\"], #data-settings-toggle + .toggle-switch, .toggle-container");
        if (switchEl) {
          switchEl.removeAttribute("aria-disabled");
        }
        // Do not disable any elements in this group
        group.querySelectorAll<FormControl>("input, button, select, textarea").forEach((el) => {
          el.disabled = false;
          el.removeAttribute("aria-disabled");
        });
      } else {
        // Make other groups inert and disable their controls
        group.setAttribute("inert", "");
        group.querySelectorAll<FormControl>("input, button, select, textarea").forEach((el) => {
          el.disabled = true;
          el.setAttribute("aria-disabled", "true");
        });
      }
    });
  }
}

/**
 * Updates the small feature status line under the header.
 */
export function updateFeatureStatus() {
  const el = document.getElementById("feature-status");
  if (!el) return;

  const state = {
    location: Boolean(locationState && locationState.enabled),
    memory: (() => { try { return Boolean(getMemoryConfig && getMemoryConfig().enabled); } catch { return false; } })(),
    tools: Boolean(config && config.enableFunctionCalling !== false),
    data: getDataSettingsEnabled(),
    tts: Boolean(ttsConfig.enabled),
  };

  // Rebuild to bind handlers
  el.innerHTML = "";

  function makeBadge(label: string, key: string, isOn: boolean, tabId: string) {
    const badge = document.createElement("span");
    badge.className = "feature-badge";
    badge.setAttribute("data-state", isOn ? "on" : "off");
    badge.setAttribute("data-feature", key);
    badge.title = label;

    const dot = document.createElement("span");
    dot.className = "dot";
    dot.setAttribute("role", "button");
    dot.setAttribute("tabindex", "0");
    dot.setAttribute("aria-pressed", String(isOn));
    dot.title = isOn ? `Disable ${label}` : `Enable ${label}`;

    const text = document.createElement("span");
    text.className = "label";
    text.textContent = label;

    const toggleFeature = async() => {
      switch (key) {
      case "tools": {
        const toggle = elements.toolCallingToggle || (document.getElementById("tool-calling-toggle") as HTMLInputElement | null);
        if (toggle) {
          toggle.checked = !isOn;
          toggle.dispatchEvent(new Event("change", { bubbles: true }));
        } else {
          config.enableFunctionCalling = !isOn;
        }
        break;
      }
      case "memory": {
        const toggle = document.getElementById("memory-toggle") as HTMLInputElement | null;
        if (toggle) {
          toggle.checked = !isOn;
          toggle.dispatchEvent(new Event("change", { bubbles: true }));
        } else {
          setMemoryEnabled(!isOn);

        }
        break;
      }
      case "location": {
        const toggle = document.getElementById("location-toggle") as HTMLInputElement | null;
        if (!isOn) {
          if (toggle) {
            toggle.checked = true;
            toggle.dispatchEvent(new Event("change", { bubbles: true }));
          } else {
            await requestLocation();

          }
        } else {
          if (toggle) {
            toggle.checked = false;
            toggle.dispatchEvent(new Event("change", { bubbles: true }));
          } else {
            disableLocation();

          }
        }
        break;
      }
      case "data": {
        setDataSettingsEnabled(!isOn);
        break;
      }
      case "tts": {
        const toggle = document.getElementById("tts-toggle") as HTMLInputElement | null;
        if (toggle) {
          toggle.checked = !isOn;
          toggle.dispatchEvent(new Event("change", { bubbles: true }));
        }
        break;
      }
      }
      setTimeout(() => updateFeatureStatus(), 50);
    };

    dot.addEventListener("click", () => { toggleFeature(); });
    dot.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleFeature(); } });

    badge.addEventListener("click", (e) => {
      if (e.target === dot) return;
      e.preventDefault();
      e.stopPropagation();
      openSettingsAndSwitch(tabId);
    });

    badge.appendChild(dot);
    badge.appendChild(text);
    return badge;
  }

  el.appendChild(makeBadge("Location", "location", state.location, "tab-location"));
  el.appendChild(makeBadge("Memory", "memory", state.memory, "tab-memory"));
  el.appendChild(makeBadge("Tools", "tools", state.tools, "tab-tools"));
  el.appendChild(makeBadge("Data", "data", state.data, "tab-data"));
  el.appendChild(makeBadge("TTS", "tts", state.tts, "tab-tts"));
}

/**
 * Updates model selector with available models for the current service
 */
export function updateModelSelector() {
  // Check if modelSelector exists
  if (!elements.modelSelector) {
    console.warn("Model selector not found, skipping updateModelSelector");
    return;
  }
  const modelSelector = elements.modelSelector;

  const currentlySelectedModel = modelSelector.value;
  const savedModel = modelSelector.getAttribute("data-last-selected");

  modelSelector.innerHTML = "";

  try {
    const activeServiceKey = config?.defaultService;
    const activeService = activeServiceKey ? config?.services?.[activeServiceKey] : null;
    const isLocalLoading = Boolean(activeService && activeService.modelsFetching === true);

    if (isLocalLoading) {
      const option = document.createElement("option");
      option.value = "loading";
      option.textContent = "Loading models...";
      elements.modelSelector.appendChild(option);
      return;
    }

    const models = config.getAvailableModels();
    if (!Array.isArray(models) || models.length === 0) {
      console.error("No models available for the selected service");
      const option = document.createElement("option");
      option.value = "no-models";
      option.textContent = "No models available";
      elements.modelSelector.appendChild(option);
      return;
    }

    models.forEach((model) => {
      const option = document.createElement("option");
      option.value = model;
      option.textContent = model;
      modelSelector.appendChild(option);
    });

    // First try to use the currently selected model
    if (currentlySelectedModel && models.includes(currentlySelectedModel)) {
      elements.modelSelector.value = currentlySelectedModel;
    }
    // Then try to use the saved model
    else if (savedModel && models.includes(savedModel)) {
      elements.modelSelector.value = savedModel;
    }
    // Then try to use the default model from config
    else {
      const defaultModel = config.getDefaultModel();

      // Try exact match first
      if (defaultModel && models.includes(defaultModel)) {
        elements.modelSelector.value = defaultModel;
      }
      // Try matching without the :latest suffix
      else if (defaultModel) {
        // Find model that matches without the :latest suffix (e.g., "llama3" matches "llama3:latest")
        const matchingModel = models.find(model =>
          model === defaultModel ||
          (model.endsWith(":latest") && model.slice(0, -7) === defaultModel),
        );

        if (matchingModel) {
          elements.modelSelector.value = matchingModel;
        } else if (models.length > 0) {
          elements.modelSelector.value = models[0];
        }
      } else if (models.length > 0) {
        elements.modelSelector.value = models[0];
      }
    }

    elements.modelSelector.setAttribute("data-last-selected", elements.modelSelector.value);
    updateHeaderInfo();
    updateReasoningAvailability();
  } catch (error) {
    console.error("Error updating model selector:", error);
    const option = document.createElement("option");
    option.value = "error";
    option.textContent = "Error loading models";
    elements.modelSelector.appendChild(option);
  }
}

/**
 * Dynamically populates the service selector dropdown based on available services in config
 */
export function populateServiceSelector() {
  if (!elements.serviceSelector || !config || !config.services) {
    console.warn("Service selector or config not found, skipping populateServiceSelector");
    return;
  }
  const serviceSelector = elements.serviceSelector;

  // Clear existing options
  serviceSelector.innerHTML = "";

  // Create and append options for each service in config
  Object.keys(config.services).forEach(serviceKey => {
    const serviceConfig = config.services[serviceKey];
    if (serviceConfig?.enabled === false) {
      return;
    }
    const option = document.createElement("option");
    option.value = serviceKey;

    // Determine display name based on service key
    let displayName = serviceKey.charAt(0).toUpperCase() + serviceKey.slice(1);

    // Add specific labels for known services
    switch (serviceKey) {
    case "openai":
      displayName = "OpenAI";
      break;
    case "xai":
      displayName = "xAI (Grok)";
      break;
    // case "huggingface":
    //   displayName = "Hugging Face";
    //   break;
    case "lmstudio":
      displayName = "LM Studio (Local)";
      break;
    case "ollama":
      displayName = "Ollama (Local)";
      break;
    default:
      displayName = serviceKey.charAt(0).toUpperCase() + serviceKey.slice(1);
    }

    option.textContent = displayName;
    serviceSelector.appendChild(option);
  });

  if (typeof config.normalizeServiceKey === "function") {
    config.defaultService = config.normalizeServiceKey(config.defaultService);
  }
}

/**
 * Explicitly initialize the personality input with the default personality
 */
export function initializePersonalityInput() {
  if (elements.personalityInput && DEFAULT_PERSONALITY) {
    elements.personalityInput.value = DEFAULT_PERSONALITY;
    elements.personalityInput.setAttribute("data-explicitly-set", "true");
    console.info("Default personality explicitly set in personality input box");
  } else {
    console.warn("Could not initialize personality input: element or default personality not available");
  }
}

/**
 * Organizes settings content into columns for wider panel layout
 */
export function organizeSettingsLayout() {
  // Apply to the Model tab
  const modelTab = document.getElementById("model-settings");
  if (modelTab) {
    // Create wrapper if it doesn't exist
    if (!modelTab.querySelector(".settings-tab-columns")) {
      const groups = Array.from(modelTab.querySelectorAll<HTMLElement>(".settings-group"));
      const midpoint = Math.ceil(groups.length / 2);

      // Create column wrapper
      const wrapper = document.createElement("div");
      wrapper.className = "settings-tab-columns";

      // Create two columns
      const column1 = document.createElement("div");
      column1.className = "settings-column";

      const column2 = document.createElement("div");
      column2.className = "settings-column";

      // Distribute groups between columns
      groups.forEach((group, index) => {
        if (index < midpoint) {
          column1.appendChild(group);
        } else {
          column2.appendChild(group);
        }
      });

      // Replace content with new layout
      wrapper.appendChild(column1);
      wrapper.appendChild(column2);

      // Replace content with the new layout
      const content = modelTab.querySelector(".tab-content-container");
      if (content) {
        // Add new layout
        content.appendChild(wrapper);
      }
    }
  }
}
