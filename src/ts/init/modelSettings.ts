/**
 * Model settings initialization for the chatbot application
 */

import { state, elements } from "./state.ts";
import { config } from "../../config/config.ts";

const REASONING_EFFORT_STORAGE_KEY = "reasoningEffort";
export const DEFAULT_REASONING_EFFORT = "medium";
const VALID_REASONING_EFFORTS = ["low", "medium", "high"];
const DEFAULT_REASONING_HELP_TEXT = "Higher effort spends more time on structured reasoning before replying; lower effort responds faster.";
const DISABLED_REASONING_HELP_TEXT = "Reasoning effort is unavailable for GPT-4/GPT-4.1 and Grok models without reasoning support.";
const VERBOSITY_STORAGE_KEY = "responseVerbosity";
export const DEFAULT_VERBOSITY = "medium";
const VALID_VERBOSITY_LEVELS = ["low", "medium", "high"];
const HISTORY_TOKEN_BUDGET_STORAGE_KEY = "historyTokenBudget";
// Balanced default: ~8k tokens of recent history keeps plenty of context
// (~10-20 exchanges) while capping cost on long threads. 0 = no limit.
export const DEFAULT_HISTORY_TOKEN_BUDGET = 8000;

function normalizeReasoningEffort(value: string) {
  return VALID_REASONING_EFFORTS.includes(value) ? value : DEFAULT_REASONING_EFFORT;
}

function loadReasoningEffortFromStorage() {
  try {
    const stored = localStorage.getItem(REASONING_EFFORT_STORAGE_KEY);
    if (stored) {
      return normalizeReasoningEffort(stored);
    }
  } catch (error) {
    if (state.verboseLogging) {
      console.warn("Unable to load reasoning effort from storage:", error);
    }
  }
  return DEFAULT_REASONING_EFFORT;
}

function persistReasoningEffort(value: string) {
  try {
    localStorage.setItem(REASONING_EFFORT_STORAGE_KEY, value);
  } catch (error) {
    if (state.verboseLogging) {
      console.warn("Unable to save reasoning effort preference:", error);
    }
  }
}

function modelSupportsReasoning(modelName: string) {
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
  const activeService = elements.serviceSelector ? elements.serviceSelector.value : (config && config.defaultService) || "openai";
  const supported = modelSupportsReasoning(modelName) && activeService !== "xai";
  elements.reasoningEffortSelector.disabled = !supported;
  if (!supported) {
    elements.reasoningEffortSelector.title = DISABLED_REASONING_HELP_TEXT;
    elements.reasoningEffortSelector.setAttribute("aria-disabled", "true");
  } else {
    elements.reasoningEffortSelector.title = "";
    elements.reasoningEffortSelector.removeAttribute("aria-disabled");
  }
  const info = document.getElementById("reasoning-effort-help") as any;
  if (info) {
    info.textContent = supported ? DEFAULT_REASONING_HELP_TEXT : DISABLED_REASONING_HELP_TEXT;
  }
}

function normalizeVerbosity(value: string) {
  return VALID_VERBOSITY_LEVELS.includes(value) ? value : DEFAULT_VERBOSITY;
}

function loadVerbosityFromStorage() {
  try {
    const stored = localStorage.getItem(VERBOSITY_STORAGE_KEY);
    if (stored) {
      return normalizeVerbosity(stored);
    }
  } catch (error) {
    if (state.verboseLogging) {
      console.warn("Unable to load verbosity preference from storage:", error);
    }
  }
  return DEFAULT_VERBOSITY;
}

function persistVerbosity(value: string) {
  try {
    localStorage.setItem(VERBOSITY_STORAGE_KEY, value);
  } catch (error) {
    if (state.verboseLogging) {
      console.warn("Unable to save verbosity preference:", error);
    }
  }
}

function normalizeHistoryTokenBudget(value: string | number) {
  const parsed = parseInt(String(value), 10);
  // 0 is a valid, explicit "no limit". Blank/negative/invalid falls back to default.
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_HISTORY_TOKEN_BUDGET;
  }
  return parsed;
}

function loadHistoryTokenBudgetFromStorage() {
  try {
    const stored = localStorage.getItem(HISTORY_TOKEN_BUDGET_STORAGE_KEY);
    if (stored !== null) {
      return normalizeHistoryTokenBudget(stored);
    }
  } catch (error) {
    if (state.verboseLogging) {
      console.warn("Unable to load history token budget from storage:", error);
    }
  }
  return DEFAULT_HISTORY_TOKEN_BUDGET;
}

function persistHistoryTokenBudget(value: number) {
  try {
    localStorage.setItem(HISTORY_TOKEN_BUDGET_STORAGE_KEY, String(value));
  } catch (error) {
    if (state.verboseLogging) {
      console.warn("Unable to save history token budget preference:", error);
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
  const storedBudget = loadHistoryTokenBudgetFromStorage();
  state.historyTokenBudget = storedBudget;

  if (elements.reasoningEffortSelector) {
    elements.reasoningEffortSelector.value = storedEffort;

    if (!elements.reasoningEffortSelector.dataset.bound) {
      elements.reasoningEffortSelector.addEventListener("change", (event) => {
        const selectedEffort = normalizeReasoningEffort((event.target as any).value);
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
        const selectedVerbosity = normalizeVerbosity((event.target as any).value);
        state.currentVerbosity = selectedVerbosity;
        persistVerbosity(selectedVerbosity);
      });
      elements.verbositySelector.dataset.bound = "true";
    }
  }

  if (elements.historyTokenBudgetInput) {
    elements.historyTokenBudgetInput.value = String(storedBudget);

    if (!elements.historyTokenBudgetInput.dataset.bound) {
      elements.historyTokenBudgetInput.addEventListener("change", (event) => {
        const budget = normalizeHistoryTokenBudget((event.target as any).value);
        state.historyTokenBudget = budget;
        persistHistoryTokenBudget(budget);
        (event.target as any).value = String(budget);
      });
      elements.historyTokenBudgetInput.dataset.bound = "true";
    }
  }

  if (state.verboseLogging) {
    console.info("Model settings initialized from config with reasoning effort and verbosity:", {
      reasoning: state.currentReasoningEffort,
      verbosity: state.currentVerbosity,
      historyTokenBudget: state.historyTokenBudget,
    });
  }

  updateReasoningAvailability();
}

export function getReasoningEffort() {
  const modelName = elements.modelSelector ? elements.modelSelector.value : "";
  const activeService = elements.serviceSelector ? elements.serviceSelector.value : (config && config.defaultService) || "openai";
  if (activeService === "xai" || !modelSupportsReasoning(modelName)) {
    return null;
  }
  return normalizeReasoningEffort(state.currentReasoningEffort);
}

export function setReasoningEffort(value: string) {
  const normalized = normalizeReasoningEffort(value);
  state.currentReasoningEffort = normalized;
  persistReasoningEffort(normalized);
  if (elements.reasoningEffortSelector) {
    elements.reasoningEffortSelector.value = normalized;
  }
}

export function getHistoryTokenBudget() {
  return normalizeHistoryTokenBudget(state.historyTokenBudget);
}

export function setHistoryTokenBudget(value: string | number) {
  const normalized = normalizeHistoryTokenBudget(value);
  state.historyTokenBudget = normalized;
  persistHistoryTokenBudget(normalized);
  if (elements.historyTokenBudgetInput) {
    elements.historyTokenBudgetInput.value = String(normalized);
  }
}

export function getVerbosity() {
  return normalizeVerbosity(state.currentVerbosity);
}

export function setVerbosity(value: string) {
  const normalized = normalizeVerbosity(value);
  state.currentVerbosity = normalized;
  persistVerbosity(normalized);
  if (elements.verbositySelector) {
    elements.verbositySelector.value = normalized;
  }
}
