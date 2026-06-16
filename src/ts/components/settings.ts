/**
 * Settings panel functionality.
 */

import { elements, state } from "../init/state.ts";
import { uiHooks } from "../init/uiHooks.ts";
import { STORAGE_KEYS } from "../utils/storage/storage.ts";
import { showInlineStatus } from "../utils/inlineStatus.ts";
import { DEFAULT_PERSONALITY, config } from "../../config/config.ts";
import { getMemoryConfig, setMemoryEnabled } from "../utils/storage/memoryStorage.ts";
import { locationState, requestLocation, disableLocation } from "../services/location.ts";
import { ttsConfig } from "../services/tts.ts";
import { updateReasoningAvailability } from "../init/modelSettings.ts";
import { openSettingsAndSwitch } from "../init/eventListeners/settingsPanel.ts";

/** Form controls that share a `disabled` property, toggled when enabling/disabling tab UI. */
type FormControl = HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement;

/** Service display labels used in model-fetch status messages, falling back to the raw key. */
const MODEL_STATUS_SERVICE_LABELS: Record<string, string> = {
  lmstudio: "LM Studio",
  ollama: "Ollama",
  openai: "OpenAI",
  xai: "xAI",
};

/**
 * Maps a service key to the label shown in model-fetch status notes.
 *
 * @remarks
 * Scoped to the model-status feature on purpose — provider display labels are
 * deliberately not centralized globally (see the note in `services/providers.ts`),
 * because other call sites use divergent conventions.
 *
 * @param serviceKey - The active service key (e.g. `"openai"`).
 * @returns The display label, or the raw key when unmapped.
 */
export function serviceStatusLabel(serviceKey: string): string {
  return MODEL_STATUS_SERVICE_LABELS[serviceKey] || serviceKey;
}

/**
 * Updates the local models dropdown when models are refreshed.
 *
 * @remarks
 * Registered on the `uiHooks` registry so `config.ts` can call it after fetching
 * provider models without importing the component graph.
 *
 * @param fetchError - Whether there was an error fetching models.
 */
export function updateModelsDropdown(fetchError?: boolean) {
  const serviceKey = elements.serviceSelector ? elements.serviceSelector.value : "";
  const serviceLabel = serviceStatusLabel(serviceKey);

  updateModelSelector();

  if (fetchError) {
    showInlineStatus(
      "service-status",
      [".model-selector-container", ".lmstudio-action-buttons"],
      `Failed to fetch ${serviceLabel} models. Check server connection.`,
      "error",
    );
  }
}

uiHooks.updateModelsDropdown = updateModelsDropdown;

/**
 * Updates the header information
 */
export function updateHeaderInfo() {
  const headerTitle = document.getElementById("header-title");
  const modelInfo = document.getElementById("model-info");

  if (!headerTitle || !modelInfo || !elements.modelSelector) {
    console.warn("Header elements not found, skipping updateHeaderInfo");
    return;
  }

  const model = elements.modelSelector.value;

  try {
    if (model && model !== "error" && model !== "no-models") {
      headerTitle.textContent = `${model}`;
      elements.modelSelector.setAttribute("data-last-selected", model);
    } else {
      headerTitle.textContent = "AI Assistant";
    }

    try {
      const serviceKey = (config && config.defaultService) ? config.defaultService : "";
      let displayName = "";
      switch (serviceKey) {
      case "openai": displayName = "OpenAI"; break;
      case "xai": displayName = "xAI (Grok)"; break;
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

    let promptInfo = "";
    const personalityInput = elements.personalityInput;
    const systemPromptCustom = elements.systemPromptCustom;
    if (elements.personalityPromptRadio?.checked && personalityInput && personalityInput.value.trim() !== "") {
      if (personalityInput.hasAttribute("data-explicitly-set") &&
          personalityInput.getAttribute("data-explicitly-set") === "true") {
        promptInfo = `Personality: ${personalityInput.value.trim()}`;
      }
    } else if (elements.customPromptRadio?.checked && systemPromptCustom && systemPromptCustom.value.trim() !== "") {
      promptInfo = systemPromptCustom.value.trim();
    } else if (elements.noPromptRadio && elements.noPromptRadio.checked) {
      promptInfo = "No system prompt";
    }

    if (!promptInfo) {
      if (DEFAULT_PERSONALITY && elements.personalityInput && elements.personalityInput.value.trim()) {
        promptInfo = `Personality: ${elements.personalityInput.value.trim()}`;
      } else if (DEFAULT_PERSONALITY) {
        promptInfo = `Personality: ${DEFAULT_PERSONALITY}`;
      }
    }

    if (state.partyMode) {
      const cfg = state.activePartyConfig;
      const names = (cfg?.characters ?? []).map(c => c.name).filter(Boolean);
      if (names.length) {
        const parts = [`Party: ${names.join(", ")}`];
        const extras: [string, string | undefined][] = [
          ["Topic", cfg?.scenario?.topic],
          ["Setting", cfg?.scenario?.setting],
          ["Tone", cfg?.scenario?.mood],
        ];
        for (const [label, value] of extras) {
          if ((value || "").trim()) {
            parts.push(`${label}: ${(value || "").trim()}`);
          }
        }
        promptInfo = parts.join(" · ");
      } else {
        promptInfo = "Party mode";
      }
    }

    modelInfo.textContent = promptInfo;
    modelInfo.title = promptInfo;
  } catch (error) {
    console.error("Error updating header info:", error);
    headerTitle.textContent = "AI Assistant";
    modelInfo.textContent = "Configuration error";
  }

  try { updateFeatureStatus(); } catch { /* noop */ }

  updateReasoningAvailability();
}

/**
 * Data settings enable/disable control (persisted in localStorage)
 */
export function getDataSettingsEnabled() {
  try {
    const v = localStorage.getItem(STORAGE_KEYS.dataSettingsEnabled);
    return v === null ? true : v === "true";
  } catch {
    return true;
  }
}

/**
 * Persists the data-features toggle, syncs the Data tab control, and refreshes
 * the disabled state and header badges.
 */
export function setDataSettingsEnabled(enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_KEYS.dataSettingsEnabled, enabled ? "true" : "false");
  } catch { /* noop */ }

  const toggle = elements.dataSettingsToggle || (document.getElementById("data-settings-toggle") as HTMLInputElement | null);
  if (toggle) {
    toggle.checked = enabled;
  }

  try { applyDataSettingsState(); } catch { /* noop */ }

  try { updateFeatureStatus(); } catch { /* noop */ }
}

/**
 * Enables or disables (inert + banner) the Data settings tab UI to match the
 * current data-features preference.
 */
export function applyDataSettingsState() {
  const content = document.getElementById("content-data");
  if (!content) return;
  const enabled = getDataSettingsEnabled();

  if (enabled) {
    content.removeAttribute("data-disabled");
    const banner = content.querySelector(".data-disabled-banner");
    if (banner) banner.remove();

    content.querySelectorAll<HTMLElement>(".settings-group").forEach((group) => {
      group.removeAttribute("inert");
      group.querySelectorAll<FormControl>("input, button, select, textarea").forEach((el) => {
        el.disabled = false;
        el.removeAttribute("aria-disabled");
      });
    });
  } else {
    content.setAttribute("data-disabled", "true");

    if (!content.querySelector(".data-disabled-banner")) {
      const banner = document.createElement("div");
      banner.className = "data-disabled-banner";
      banner.textContent = "Data settings are disabled";
      content.insertBefore(banner, content.firstChild);
    }

    const groups = Array.from(content.querySelectorAll<HTMLElement>(".settings-group"));
    groups.forEach((group) => {
      const hasMasterToggle = Boolean(group.querySelector("#data-settings-toggle"));
      if (hasMasterToggle) {
        group.removeAttribute("inert");
        const toggle = group.querySelector<HTMLInputElement>("#data-settings-toggle");
        if (toggle) {
          toggle.disabled = false;
          toggle.removeAttribute("aria-disabled");
        }
        const switchEl = group.querySelector<HTMLElement>("label[for=\"data-settings-toggle\"], #data-settings-toggle + .toggle-switch, .toggle-container");
        if (switchEl) {
          switchEl.removeAttribute("aria-disabled");
        }
        group.querySelectorAll<FormControl>("input, button, select, textarea").forEach((el) => {
          el.disabled = false;
          el.removeAttribute("aria-disabled");
        });
      } else {
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

    if (currentlySelectedModel && models.includes(currentlySelectedModel)) {
      elements.modelSelector.value = currentlySelectedModel;
    }
    else if (savedModel && models.includes(savedModel)) {
      elements.modelSelector.value = savedModel;
    }
    else {
      const defaultModel = config.getDefaultModel();

      if (defaultModel && models.includes(defaultModel)) {
        elements.modelSelector.value = defaultModel;
      }
      else if (defaultModel) {
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

  serviceSelector.innerHTML = "";

  Object.keys(config.services).forEach(serviceKey => {
    const serviceConfig = config.services[serviceKey];
    if (serviceConfig?.enabled === false) {
      return;
    }
    const option = document.createElement("option");
    option.value = serviceKey;

    let displayName = serviceKey.charAt(0).toUpperCase() + serviceKey.slice(1);

    switch (serviceKey) {
    case "openai":
      displayName = "OpenAI";
      break;
    case "xai":
      displayName = "xAI (Grok)";
      break;
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
  const modelTab = document.getElementById("model-settings");
  if (modelTab) {
    if (!modelTab.querySelector(".settings-tab-columns")) {
      const groups = Array.from(modelTab.querySelectorAll<HTMLElement>(".settings-group"));
      const midpoint = Math.ceil(groups.length / 2);

      const wrapper = document.createElement("div");
      wrapper.className = "settings-tab-columns";

      const column1 = document.createElement("div");
      column1.className = "settings-column";

      const column2 = document.createElement("div");
      column2.className = "settings-column";

      groups.forEach((group, index) => {
        if (index < midpoint) {
          column1.appendChild(group);
        } else {
          column2.appendChild(group);
        }
      });

      wrapper.appendChild(column1);
      wrapper.appendChild(column2);

      const content = modelTab.querySelector(".tab-content-container");
      if (content) {
        content.appendChild(wrapper);
      }
    }
  }
}
