/**
 * Model settings initialization for the chatbot application
 */

const REASONING_EFFORT_STORAGE_KEY = "reasoningEffort";
const DEFAULT_REASONING_EFFORT = "medium";
const VALID_REASONING_EFFORTS = ["low", "medium", "high"];
const DEFAULT_REASONING_HELP_TEXT = "Higher effort spends more time on structured reasoning before replying; lower effort responds faster.";
const DISABLED_REASONING_HELP_TEXT = "Reasoning effort is unavailable for GPT-4/GPT-4.1 and Grok models without reasoning support.";
const VERBOSITY_STORAGE_KEY = "responseVerbosity";
const DEFAULT_VERBOSITY = "medium";
const VALID_VERBOSITY_LEVELS = ["low", "medium", "high"];

function normalizeReasoningEffort(value) {
  return VALID_REASONING_EFFORTS.includes(value) ? value : DEFAULT_REASONING_EFFORT;
}

function loadReasoningEffortFromStorage() {
  try {
    const stored = localStorage.getItem(REASONING_EFFORT_STORAGE_KEY);
    if (stored) {
      return normalizeReasoningEffort(stored);
    }
  } catch (error) {
    if (window.VERBOSE_LOGGING) {
      console.warn("Unable to load reasoning effort from storage:", error);
    }
  }
  return DEFAULT_REASONING_EFFORT;
}

function persistReasoningEffort(value) {
  try {
    localStorage.setItem(REASONING_EFFORT_STORAGE_KEY, value);
  } catch (error) {
    if (window.VERBOSE_LOGGING) {
      console.warn("Unable to save reasoning effort preference:", error);
    }
  }
}

function modelSupportsReasoning(modelName) {
  if (!modelName) {
    return true;
  }
  const normalized = String(modelName).toLowerCase();
  if (normalized.startsWith("gpt-4")) {
    return false;
  }
  if (normalized.startsWith("grok-4-fast")) {
    return true;
  }
  return true;
}

function updateReasoningAvailability() {
  if (!window.reasoningEffortSelector) {
    return;
  }
  const modelName = window.modelSelector ? window.modelSelector.value : "";
  const activeService = window.serviceSelector ? window.serviceSelector.value : (window.config && window.config.defaultService) || "openai";
  const supported = modelSupportsReasoning(modelName) && activeService !== "xai";
  window.reasoningEffortSelector.disabled = !supported;
  if (!supported) {
    window.reasoningEffortSelector.title = DISABLED_REASONING_HELP_TEXT;
    window.reasoningEffortSelector.setAttribute("aria-disabled", "true");
  } else {
    window.reasoningEffortSelector.title = "";
    window.reasoningEffortSelector.removeAttribute("aria-disabled");
  }
  const info = document.getElementById("reasoning-effort-help");
  if (info) {
    info.textContent = supported ? DEFAULT_REASONING_HELP_TEXT : DISABLED_REASONING_HELP_TEXT;
  }
}

function normalizeVerbosity(value) {
  return VALID_VERBOSITY_LEVELS.includes(value) ? value : DEFAULT_VERBOSITY;
}

function loadVerbosityFromStorage() {
  try {
    const stored = localStorage.getItem(VERBOSITY_STORAGE_KEY);
    if (stored) {
      return normalizeVerbosity(stored);
    }
  } catch (error) {
    if (window.VERBOSE_LOGGING) {
      console.warn("Unable to load verbosity preference from storage:", error);
    }
  }
  return DEFAULT_VERBOSITY;
}

function persistVerbosity(value) {
  try {
    localStorage.setItem(VERBOSITY_STORAGE_KEY, value);
  } catch (error) {
    if (window.VERBOSE_LOGGING) {
      console.warn("Unable to save verbosity preference:", error);
    }
  }
}

/**
 * Initialize model settings controls with values from config
 */
function initializeModelSettings() {

  const storedEffort = loadReasoningEffortFromStorage();
  window.currentReasoningEffort = storedEffort;
  const storedVerbosity = loadVerbosityFromStorage();
  window.currentVerbosity = storedVerbosity;

  if (window.reasoningEffortSelector) {
    window.reasoningEffortSelector.value = storedEffort;

    if (!window.reasoningEffortSelector.dataset.bound) {
      window.reasoningEffortSelector.addEventListener("change", (event) => {
        const selectedEffort = normalizeReasoningEffort(event.target.value);
        window.currentReasoningEffort = selectedEffort;
        persistReasoningEffort(selectedEffort);
      });
      window.reasoningEffortSelector.dataset.bound = "true";
    }
  }

  if (window.verbositySelector) {
    window.verbositySelector.value = storedVerbosity;

    if (!window.verbositySelector.dataset.bound) {
      window.verbositySelector.addEventListener("change", (event) => {
        const selectedVerbosity = normalizeVerbosity(event.target.value);
        window.currentVerbosity = selectedVerbosity;
        persistVerbosity(selectedVerbosity);
      });
      window.verbositySelector.dataset.bound = "true";
    }
  }

  if (window.VERBOSE_LOGGING) {
    console.info("Model settings initialized from config with reasoning effort and verbosity:", {
      reasoning: window.currentReasoningEffort,
      verbosity: window.currentVerbosity,
    });
  }

  updateReasoningAvailability();
}

// Make function available globally
window.initializeModelSettings = initializeModelSettings;
window.updateReasoningAvailability = updateReasoningAvailability;

window.getReasoningEffort = function() {
  const modelName = window.modelSelector ? window.modelSelector.value : "";
  const activeService = window.serviceSelector ? window.serviceSelector.value : (window.config && window.config.defaultService) || "openai";
  if (activeService === "xai" || !modelSupportsReasoning(modelName)) {
    return null;
  }
  return normalizeReasoningEffort(window.currentReasoningEffort);
};

window.setReasoningEffort = function(value) {
  const normalized = normalizeReasoningEffort(value);
  window.currentReasoningEffort = normalized;
  persistReasoningEffort(normalized);
  if (window.reasoningEffortSelector) {
    window.reasoningEffortSelector.value = normalized;
  }
};

window.DEFAULT_REASONING_EFFORT = DEFAULT_REASONING_EFFORT;

window.getVerbosity = function() {
  return normalizeVerbosity(window.currentVerbosity);
};

window.setVerbosity = function(value) {
  const normalized = normalizeVerbosity(value);
  window.currentVerbosity = normalized;
  persistVerbosity(normalized);
  if (window.verbositySelector) {
    window.verbositySelector.value = normalized;
  }
};

window.DEFAULT_VERBOSITY = DEFAULT_VERBOSITY;
