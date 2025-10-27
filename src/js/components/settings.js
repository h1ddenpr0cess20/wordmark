/**
 * Settings panel related functionality
 */

// -----------------------------------------------------
// Settings panel functions
// -----------------------------------------------------

// UI hooks for updating model lists
window.uiHooks = window.uiHooks || {};

/**
 * Updates the LM Studio models dropdown when models are refreshed
 * @param {boolean} fetchError - Whether there was an error fetching models
 */
window.uiHooks.updateLmStudioModelsDropdown = function(fetchError) {
  if (window.serviceSelector && window.serviceSelector.value === "lmstudio") {
    window.updateModelSelector();

    // Show status message if there was an error
    if (fetchError) {
      // Remove any existing status message
      const existingStatus = document.querySelector(".lmstudio-status");
      if (existingStatus) {
        existingStatus.remove();
      }

      // Create a new status message
      const statusElement = document.createElement("div");
      statusElement.className = "lmstudio-status error";
      statusElement.textContent = "Failed to fetch LM Studio models. Check server connection.";

      // Add status message to the DOM
      const lmstudioActionButtons = document.querySelector(".lmstudio-action-buttons");
      if (lmstudioActionButtons) {
        lmstudioActionButtons.insertAdjacentElement("afterend", statusElement);

        // Auto-remove after 5 seconds
        setTimeout(() => {
          statusElement.remove();
        }, 5000);
      }
    }
  }
};

/**
 * Updates the header information
 */
window.updateHeaderInfo = function() {
  const headerTitle = document.getElementById("header-title");
  const modelInfo = document.getElementById("model-info");
  const featureStatus = document.getElementById("feature-status");

  // Check if required elements exist
  if (!headerTitle || !modelInfo || !window.modelSelector) {
    console.warn("Header elements not found, skipping updateHeaderInfo");
    return;
  }

  const model = window.modelSelector.value;

  try {
    // Set model name as the main header title
    if (model && model !== "error" && model !== "no-models") {
      headerTitle.textContent = `${model}`;
      window.modelSelector.setAttribute("data-last-selected", model);
    } else {
      headerTitle.textContent = "AI Assistant";
    }

    // Update native title on the model name with provider display name
    try {
      const serviceKey = (window.config && window.config.defaultService) ? window.config.defaultService : "";
      let displayName = "";
      switch (serviceKey) {
      case "openai": displayName = "OpenAI"; break;
      case "xai": displayName = "xAI (Grok)"; break;
      // case "huggingface": displayName = "Hugging Face"; break;
      case "lmstudio": displayName = "LM Studio (Local)"; break;
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
    if (window.personalityPromptRadio.checked && window.personalityInput.value.trim() !== "") {
      // Only show personality if the user has actively set it
      if (window.personalityInput.hasAttribute("data-explicitly-set") &&
          window.personalityInput.getAttribute("data-explicitly-set") === "true") {
        promptInfo = `Personality: ${window.personalityInput.value.trim()}`;
      }
    } else if (window.customPromptRadio.checked && window.systemPromptCustom.value.trim() !== "") {
      promptInfo = window.systemPromptCustom.value.trim();
    } else if (window.noPromptRadio && window.noPromptRadio.checked) {
      promptInfo = "No system prompt";
    }

    // Always display something in the model info area even if empty
    if (!promptInfo) {
      // Only show default personality in the header if it's actually set in the input
      // Don't automatically override the personality input value here
      if (window.DEFAULT_PERSONALITY && window.personalityInput && window.personalityInput.value.trim()) {
        promptInfo = `Personality: ${window.personalityInput.value.trim()}`;
      } else if (window.DEFAULT_PERSONALITY) {
        promptInfo = `Personality: ${window.DEFAULT_PERSONALITY}`;
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
  if (typeof window.updateFeatureStatus === "function") {
    try { window.updateFeatureStatus(); } catch { /* noop */ }
  } else if (featureStatus) {
    // Minimal fallback if function is unavailable
    const on = label => `<span class="feature-badge" data-state="on"><span class="dot"></span>${label}</span>`;
    const off = label => `<span class="feature-badge" data-state="off"><span class="dot"></span>${label}</span>`;
    const locOn = Boolean(window.locationState && window.locationState.enabled);
    let memOn = false;
    try { memOn = Boolean(window.getMemoryConfig && window.getMemoryConfig().enabled); } catch {}
    const toolsOn = Boolean(window.config && window.config.enableFunctionCalling);
    featureStatus.innerHTML = [
      locOn ? on("Location") : off("Location"),
      memOn ? on("Memory") : off("Memory"),
      toolsOn ? on("Tools") : off("Tools"),
    ].join(" ");
  }

  if (typeof window.updateReasoningAvailability === "function") {
    window.updateReasoningAvailability();
  }
};

/**
 * Data settings enable/disable control (persisted in localStorage)
 */
window.getDataSettingsEnabled = function() {
  try {
    const v = localStorage.getItem("dataSettingsEnabled");
    return v === null ? true : v === "true";
  } catch {
    return true;
  }
};

window.setDataSettingsEnabled = function(enabled) {
  try {
    localStorage.setItem("dataSettingsEnabled", enabled ? "true" : "false");
  } catch { /* noop */ }

  // Reflect state in the Data tab toggle without re-triggering change handler
  const toggle = window.dataSettingsToggle || document.getElementById("data-settings-toggle");
  if (toggle) {
    toggle.checked = enabled;
  }

  if (typeof window.applyDataSettingsState === "function") {
    try { window.applyDataSettingsState(); } catch { /* noop */ }
  }

  // Keep header feature badges in sync
  if (typeof window.updateFeatureStatus === "function") {
    try { window.updateFeatureStatus(); } catch { /* noop */ }
  }
};

window.applyDataSettingsState = function() {
  const content = document.getElementById("content-data");
  if (!content) return;
  const enabled = (typeof window.getDataSettingsEnabled === "function") ? window.getDataSettingsEnabled() : true;

  if (enabled) {
    // Re-enable tab UI
    content.removeAttribute("data-disabled");
    const banner = content.querySelector(".data-disabled-banner");
    if (banner) banner.remove();

    // Enable all interactive elements
    content.querySelectorAll(".settings-group").forEach(group => {
      group.removeAttribute("inert");
      group.querySelectorAll("input, button, select, textarea").forEach(el => {
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
    const groups = Array.from(content.querySelectorAll(".settings-group"));
    groups.forEach(group => {
      const hasMasterToggle = Boolean(group.querySelector("#data-settings-toggle"));
      if (hasMasterToggle) {
        // Keep the master toggle interactive
        group.removeAttribute("inert");
        const toggle = group.querySelector("#data-settings-toggle");
        if (toggle) {
          toggle.disabled = false;
          toggle.removeAttribute("aria-disabled");
        }
        // Ensure the visual switch and container remain clickable
        const switchEl = group.querySelector("label[for=\"data-settings-toggle\"], #data-settings-toggle + .toggle-switch, .toggle-container");
        if (switchEl) {
          switchEl.removeAttribute("aria-disabled");
        }
        // Do not disable any elements in this group
        group.querySelectorAll("input, button, select, textarea").forEach(el => {
          el.disabled = false;
          el.removeAttribute("aria-disabled");
        });
      } else {
        // Make other groups inert and disable their controls
        group.setAttribute("inert", "");
        group.querySelectorAll("input, button, select, textarea").forEach(el => {
          el.disabled = true;
          el.setAttribute("aria-disabled", "true");
        });
      }
    });
  }
};

/**
 * Updates the small feature status line under the header.
 */
window.updateFeatureStatus = function() {
  const el = document.getElementById("feature-status");
  if (!el) return;

  const state = {
    location: Boolean(window.locationState && window.locationState.enabled),
    memory: (() => { try { return Boolean(window.getMemoryConfig && window.getMemoryConfig().enabled); } catch { return false; } })(),
    tools: Boolean(window.config && window.config.enableFunctionCalling !== false),
    data: Boolean(typeof window.getDataSettingsEnabled === "function" ? window.getDataSettingsEnabled() : (localStorage.getItem("dataSettingsEnabled") !== "false")),
  };

  // Rebuild to bind handlers
  el.innerHTML = "";

  function makeBadge(label, key, isOn, tabId) {
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
        const toggle = window.toolCallingToggle || document.getElementById("tool-calling-toggle");
        if (toggle) {
          toggle.checked = !isOn;
          toggle.dispatchEvent(new Event("change", { bubbles: true }));
        } else {
          window.config = window.config || {};
          window.config.enableFunctionCalling = !isOn;
        }
        break;
      }
      case "memory": {
        const toggle = document.getElementById("memory-toggle");
        if (toggle) {
          toggle.checked = !isOn;
          toggle.dispatchEvent(new Event("change", { bubbles: true }));
        } else if (typeof window.setMemoryEnabled === "function") {
          window.setMemoryEnabled(!isOn);
        }
        break;
      }
      case "location": {
        const toggle = document.getElementById("location-toggle");
        if (!isOn) {
          if (toggle) {
            toggle.checked = true;
            toggle.dispatchEvent(new Event("change", { bubbles: true }));
          } else if (typeof window.requestLocation === "function") {
            await window.requestLocation();
          }
        } else {
          if (toggle) {
            toggle.checked = false;
            toggle.dispatchEvent(new Event("change", { bubbles: true }));
          } else if (typeof window.disableLocation === "function") {
            window.disableLocation();
          }
        }
        break;
      }
      case "data": {
        if (typeof window.setDataSettingsEnabled === "function") {
          window.setDataSettingsEnabled(!isOn);
        } else {
          localStorage.setItem("dataSettingsEnabled", (!isOn).toString());
          if (typeof window.applyDataSettingsState === "function") {
            window.applyDataSettingsState();
          }
        }
        break;
      }
      }
      setTimeout(() => window.updateFeatureStatus(), 50);
    };

    dot.addEventListener("click", () => { toggleFeature(); });
    dot.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleFeature(); } });

    badge.addEventListener("click", (e) => {
      if (e.target === dot) return;
      if (typeof window.openSettingsAndSwitch === "function") {
        e.preventDefault();
        e.stopPropagation();
        window.openSettingsAndSwitch(tabId);
      }
    });

    badge.appendChild(dot);
    badge.appendChild(text);
    return badge;
  }

  el.appendChild(makeBadge("Location", "location", state.location, "tab-location"));
  el.appendChild(makeBadge("Memory", "memory", state.memory, "tab-memory"));
  el.appendChild(makeBadge("Tools", "tools", state.tools, "tab-tools"));
  el.appendChild(makeBadge("Data", "data", state.data, "tab-data"));
};

/**
 * Updates model selector with available models for the current service
 */
window.updateModelSelector = function() {
  // Check if modelSelector exists
  if (!window.modelSelector) {
    console.warn("Model selector not found, skipping updateModelSelector");
    return;
  }

  const currentlySelectedModel = window.modelSelector.value;
  const savedModel = window.modelSelector.getAttribute("data-last-selected");

  window.modelSelector.innerHTML = "";

  try {
    // Check if we're using LM Studio and models are currently being fetched
    const isLmStudioLoading = window.config.defaultService === "lmstudio" &&
                           window.config.services.lmstudio && window.config.services.lmstudio.modelsFetching === true;

    if (isLmStudioLoading) {
      const option = document.createElement("option");
      option.value = "loading";
      option.textContent = "Loading models...";
      window.modelSelector.appendChild(option);
      return;
    }

    const models = window.config.getAvailableModels();
    if (!Array.isArray(models) || models.length === 0) {
      console.error("No models available for the selected service");
      const option = document.createElement("option");
      option.value = "no-models";
      option.textContent = "No models available";
      window.modelSelector.appendChild(option);
      return;
    }

    models.forEach((model) => {
      const option = document.createElement("option");
      option.value = model;
      option.textContent = model;
      window.modelSelector.appendChild(option);
    });

    // First try to use the currently selected model
    if (currentlySelectedModel && models.includes(currentlySelectedModel)) {
      window.modelSelector.value = currentlySelectedModel;
    }
    // Then try to use the saved model
    else if (savedModel && models.includes(savedModel)) {
      window.modelSelector.value = savedModel;
    }
    // Then try to use the default model from config
    else {
      const defaultModel = window.config.getDefaultModel();

      // Try exact match first
      if (defaultModel && models.includes(defaultModel)) {
        window.modelSelector.value = defaultModel;
      }
      // Try matching without the :latest suffix
      else if (defaultModel) {
        // Find model that matches without the :latest suffix (e.g., "llama3" matches "llama3:latest")
        const matchingModel = models.find(model =>
          model === defaultModel ||
          (model.endsWith(":latest") && model.slice(0, -7) === defaultModel),
        );

        if (matchingModel) {
          window.modelSelector.value = matchingModel;
        } else if (models.length > 0) {
          window.modelSelector.value = models[0];
        }
      } else if (models.length > 0) {
        window.modelSelector.value = models[0];
      }
    }

    window.modelSelector.setAttribute("data-last-selected", window.modelSelector.value);
    window.updateHeaderInfo();
    if (typeof window.updateReasoningAvailability === "function") {
      window.updateReasoningAvailability();
    }
  } catch (error) {
    console.error("Error updating model selector:", error);
    const option = document.createElement("option");
    option.value = "error";
    option.textContent = "Error loading models";
    window.modelSelector.appendChild(option);
  }
};

/**
 * Dynamically populates the service selector dropdown based on available services in config
 */
window.populateServiceSelector = function() {
  if (!window.serviceSelector || !window.config || !window.config.services) {
    console.warn("Service selector or config not found, skipping populateServiceSelector");
    return;
  }

  // Clear existing options
  window.serviceSelector.innerHTML = "";

  // Create and append options for each service in config
  Object.keys(window.config.services).forEach(serviceKey => {
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
    default:
      displayName = serviceKey.charAt(0).toUpperCase() + serviceKey.slice(1);
    }

    option.textContent = displayName;
    window.serviceSelector.appendChild(option);
  });
};

/**
 * Explicitly initialize the personality input with the default personality
 */
window.initializePersonalityInput = function() {
  if (window.personalityInput && window.DEFAULT_PERSONALITY) {
    window.personalityInput.value = window.DEFAULT_PERSONALITY;
    window.personalityInput.setAttribute("data-explicitly-set", "true");
    console.info("Default personality explicitly set in personality input box");
  } else {
    console.warn("Could not initialize personality input: element or default personality not available");
  }
};

/**
 * Organizes settings content into columns for wider panel layout
 */
window.organizeSettingsLayout = function() {
  // Apply to the Model tab
  const modelTab = document.getElementById("model-settings");
  if (modelTab) {
    // Create wrapper if it doesn't exist
    if (!modelTab.querySelector(".settings-tab-columns")) {
      const groups = Array.from(modelTab.querySelectorAll(".settings-group"));
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
};
