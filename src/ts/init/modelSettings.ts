/**
 * Model settings initialization: reasoning effort, verbosity, and history budget.
 */

import { state, elements } from "./state.ts";
import { config } from "../../config/config.ts";
import { STORAGE_KEYS } from "../utils/storage.ts";
import { serviceSupportsReasoning } from "../services/providers.ts";

const REASONING_EFFORT_STORAGE_KEY = STORAGE_KEYS.reasoningEffort;

/** Default reasoning effort. */
export const DEFAULT_REASONING_EFFORT = "medium";
const VALID_REASONING_EFFORTS = ["low", "medium", "high"];
const DEFAULT_REASONING_HELP_TEXT = "Higher effort spends more time on structured reasoning before replying; lower effort responds faster.";
const DISABLED_REASONING_HELP_TEXT = "Reasoning effort is unavailable for GPT-4/GPT-4.1 and Grok models without reasoning support.";
const VERBOSITY_STORAGE_KEY = STORAGE_KEYS.responseVerbosity;

/** Default response verbosity. */
export const DEFAULT_VERBOSITY = "medium";
const VALID_VERBOSITY_LEVELS = ["low", "medium", "high"];
const HISTORY_TOKEN_BUDGET_STORAGE_KEY = STORAGE_KEYS.historyTokenBudget;

/**
 * Default history token budget.
 *
 * @remarks
 * A balanced ~8k tokens of recent history keeps plenty of context (~10-20
 * exchanges) while capping cost on long threads. `0` means no limit.
 */
export const DEFAULT_HISTORY_TOKEN_BUDGET = 8000;

/** Returns `value` if it is a valid reasoning effort, else {@link DEFAULT_REASONING_EFFORT}. */
function normalizeReasoningEffort(value: string) {
  return VALID_REASONING_EFFORTS.includes(value) ? value : DEFAULT_REASONING_EFFORT;
}

/** Reads the persisted reasoning effort from localStorage, falling back to the default. */
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

/** Persists the reasoning-effort preference to localStorage (best-effort). */
function persistReasoningEffort(value: string) {
  try {
    localStorage.setItem(REASONING_EFFORT_STORAGE_KEY, value);
  } catch (error) {
    if (state.verboseLogging) {
      console.warn("Unable to save reasoning effort preference:", error);
    }
  }
}

/** Reports whether a model supports reasoning effort (GPT-4/4.1 variants do not). */
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

/**
 * Enables or disables the reasoning-effort control based on whether the active
 * model and service support reasoning.
 */
export function updateReasoningAvailability() {
  if (!elements.reasoningEffortSelector) {
    return;
  }
  const modelName = elements.modelSelector ? elements.modelSelector.value : "";
  const activeService = elements.serviceSelector ? elements.serviceSelector.value : (config && config.defaultService) || "openai";
  const supported = modelSupportsReasoning(modelName) && serviceSupportsReasoning(activeService);
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

/** Returns `value` if it is a valid verbosity level, else {@link DEFAULT_VERBOSITY}. */
function normalizeVerbosity(value: string) {
  return VALID_VERBOSITY_LEVELS.includes(value) ? value : DEFAULT_VERBOSITY;
}

/** Reads the persisted verbosity level from localStorage, falling back to the default. */
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

/** Persists the verbosity preference to localStorage (best-effort). */
function persistVerbosity(value: string) {
  try {
    localStorage.setItem(VERBOSITY_STORAGE_KEY, value);
  } catch (error) {
    if (state.verboseLogging) {
      console.warn("Unable to save verbosity preference:", error);
    }
  }
}

/**
 * Normalizes a history token budget value.
 *
 * @remarks
 * `0` is a valid, explicit "no limit"; blank, negative, or invalid values fall
 * back to {@link DEFAULT_HISTORY_TOKEN_BUDGET}.
 */
function normalizeHistoryTokenBudget(value: string | number | undefined) {
  const parsed = parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_HISTORY_TOKEN_BUDGET;
  }
  return parsed;
}

/** Reads the persisted history token budget from localStorage, falling back to the default. */
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

/** Persists the history token budget to localStorage (best-effort). */
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
        const selectedEffort = normalizeReasoningEffort((event.target as HTMLSelectElement).value);
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
        const selectedVerbosity = normalizeVerbosity((event.target as HTMLSelectElement).value);
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
        const budgetInput = event.target as HTMLInputElement;
        const budget = normalizeHistoryTokenBudget(budgetInput.value);
        state.historyTokenBudget = budget;
        persistHistoryTokenBudget(budget);
        budgetInput.value = String(budget);
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

/**
 * Returns the normalized reasoning effort for the active model/service, or
 * `null` when reasoning is unsupported.
 */
export function getReasoningEffort() {
  const modelName = elements.modelSelector ? elements.modelSelector.value : "";
  const activeService = elements.serviceSelector ? elements.serviceSelector.value : (config && config.defaultService) || "openai";
  if (!serviceSupportsReasoning(activeService) || !modelSupportsReasoning(modelName)) {
    return null;
  }
  return normalizeReasoningEffort(state.currentReasoningEffort);
}

/** Normalizes, stores, persists, and reflects the reasoning-effort value in the UI. */
export function setReasoningEffort(value: string) {
  const normalized = normalizeReasoningEffort(value);
  state.currentReasoningEffort = normalized;
  persistReasoningEffort(normalized);
  if (elements.reasoningEffortSelector) {
    elements.reasoningEffortSelector.value = normalized;
  }
}

/** Returns the normalized conversation-history token budget. */
export function getHistoryTokenBudget() {
  return normalizeHistoryTokenBudget(state.historyTokenBudget);
}

/** Returns the normalized response-verbosity setting. */
export function getVerbosity() {
  return normalizeVerbosity(state.currentVerbosity);
}
