/**
 * Model settings initialization for the chatbot application
 */

import { state, elements } from "./state.js";

const REASONING_EFFORT_STORAGE_KEY = "reasoningEffort";
export const DEFAULT_REASONING_EFFORT = "medium";
const VALID_REASONING_EFFORTS = ["low", "medium", "high"];
const DEFAULT_REASONING_HELP_TEXT = "Higher effort spends more time on structured reasoning before replying; lower effort responds faster.";
const DISABLED_REASONING_HELP_TEXT = "Reasoning effort is unavailable for GPT-4/GPT-4.1 and Grok models without reasoning support.";
const VERBOSITY_STORAGE_KEY = "responseVerbosity";
export const DEFAULT_VERBOSITY = "medium";
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

export function updateReasoningAvailability() {
  if (!elements.reasoningEffortSelector) {
    return;
  }
  const modelName = elements.modelSelector ? elements.modelSelector.value : "";
  const activeService = elements.serviceSelector ? elements.serviceSelector.value : (window.config && window.config.defaultService) || "openai";
  const supported = modelSupportsReasoning(modelName) && activeService !== "xai";
  elements.reasoningEffortSelector.disabled = !supported;
  if (!supported) {
    elements.reasoningEffortSelector.title = DISABLED_REASONING_HELP_TEXT;
    elements.reasoningEffortSelector.setAttribute("aria-disabled", "true");
  } else {
    elements.reasoningEffortSelector.title = "";
    elements.reasoningEffortSelector.removeAttribute("aria-disabled");
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
export function initializeModelSettings() {

  const storedEffort = loadReasoningEffortFromStorage();
  state.currentReasoningEffort = storedEffort;
  const storedVerbosity = loadVerbosityFromStorage();
  state.currentVerbosity = storedVerbosity;

  if (elements.reasoningEffortSelector) {
    elements.reasoningEffortSelector.value = storedEffort;

    if (!elements.reasoningEffortSelector.dataset.bound) {
      elements.reasoningEffortSelector.addEventListener("change", (event) => {
        const selectedEffort = normalizeReasoningEffort(event.target.value);
        state.currentReasoningEffort = selectedEffort;
        persistReasoningEffort(selectedEffort);
      });
      elements.reasoningEffortSelector.dataset.bound = "true";
    }
  }

  if (elements.verbositySelector) {
    elements.verbositySelector.value = storedVerbosity;

    if (!elements.verbositySelector.dataset.bound) {
      elements.verbositySelector.addEventListener("change", (event) => {
        const selectedVerbosity = normalizeVerbosity(event.target.value);
        state.currentVerbosity = selectedVerbosity;
        persistVerbosity(selectedVerbosity);
      });
      elements.verbositySelector.dataset.bound = "true";
    }
  }

  if (window.VERBOSE_LOGGING) {
    console.info("Model settings initialized from config with reasoning effort and verbosity:", {
      reasoning: state.currentReasoningEffort,
      verbosity: state.currentVerbosity,
    });
  }

  updateReasoningAvailability();
}

export function getReasoningEffort() {
  const modelName = elements.modelSelector ? elements.modelSelector.value : "";
  const activeService = elements.serviceSelector ? elements.serviceSelector.value : (window.config && window.config.defaultService) || "openai";
  if (activeService === "xai" || !modelSupportsReasoning(modelName)) {
    return null;
  }
  return normalizeReasoningEffort(state.currentReasoningEffort);
}

export function setReasoningEffort(value) {
  const normalized = normalizeReasoningEffort(value);
  state.currentReasoningEffort = normalized;
  persistReasoningEffort(normalized);
  if (elements.reasoningEffortSelector) {
    elements.reasoningEffortSelector.value = normalized;
  }
}

export function getVerbosity() {
  return normalizeVerbosity(state.currentVerbosity);
}

export function setVerbosity(value) {
  const normalized = normalizeVerbosity(value);
  state.currentVerbosity = normalized;
  persistVerbosity(normalized);
  if (elements.verbositySelector) {
    elements.verbositySelector.value = normalized;
  }
}
