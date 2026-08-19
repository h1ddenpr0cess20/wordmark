/**
 * Model settings initialization: reasoning effort, verbosity, and history budget.
 *
 * @remarks
 * The history budget defaults per provider — see {@link defaultHistoryTokenBudget}
 * — so cloud models use their large context windows while local servers keep the
 * conservative ceiling. An explicit user value overrides both.
 */

import { state, elements } from "./state.ts";
import { logVerbose } from "../utils/logger.ts";
import { config } from "../../config/config.ts";
import { STORAGE_KEYS } from "../utils/storage/storage.ts";
import { isLocalService, serviceSupportsReasoning } from "../services/providers.ts";
import { supportsReasoningEffort } from "../services/api/clientConfig.ts";

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
 * Default history token budget for local providers (LM Studio, Ollama).
 *
 * @remarks
 * Local servers are usually loaded with a modest context window, so ~16k tokens
 * of recent history (~20-40 exchanges) is as much as they can absorb. `0` means
 * no limit.
 */
export const DEFAULT_LOCAL_HISTORY_TOKEN_BUDGET = 16384;

/**
 * Default history token budget for hosted providers (OpenAI, xAI, OpenRouter).
 *
 * @remarks
 * Cloud models carry context windows measured in the hundreds of thousands of
 * tokens, so the local ~16k ceiling threw away history they could comfortably
 * hold. ~64k keeps long threads intact while still capping what an unbounded
 * conversation can cost per turn.
 */
export const DEFAULT_CLOUD_HISTORY_TOKEN_BUDGET = 65536;

/** The service key the budget controls should follow. */
function activeServiceKey(): string {
  const selected = elements.serviceSelector?.value;
  return selected || (config && config.defaultService) || "openai";
}

/**
 * The history token budget used when the user has not set one, which depends on
 * the active provider: local servers keep the conservative
 * {@link DEFAULT_LOCAL_HISTORY_TOKEN_BUDGET}, hosted ones get the larger
 * {@link DEFAULT_CLOUD_HISTORY_TOKEN_BUDGET}.
 */
export function defaultHistoryTokenBudget(serviceKey?: string | null): number {
  const key = serviceKey === undefined ? activeServiceKey() : serviceKey;
  return isLocalService(key) ? DEFAULT_LOCAL_HISTORY_TOKEN_BUDGET : DEFAULT_CLOUD_HISTORY_TOKEN_BUDGET;
}

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

/**
 * Reports whether a model supports reasoning effort.
 *
 * @remarks
 * Delegates to the request builder's {@link supportsReasoningEffort} so the
 * settings control is disabled exactly when the parameter would be dropped
 * from the request (GPT-4 variants and non-"fast" Grok models).
 */
function modelSupportsReasoning(modelName: string) {
  return supportsReasoningEffort(modelName);
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
 * back to `fallback`, which defaults to the active provider's
 * {@link defaultHistoryTokenBudget}.
 */
function normalizeHistoryTokenBudget(value: string | number | undefined, fallback = defaultHistoryTokenBudget()) {
  const parsed = parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

/**
 * Reads the persisted history token budget from localStorage.
 *
 * @returns The stored budget, or `null` when the user has not set one — the
 * caller then follows the provider default rather than pinning a number.
 */
function loadHistoryTokenBudgetFromStorage(): number | null {
  try {
    const stored = localStorage.getItem(HISTORY_TOKEN_BUDGET_STORAGE_KEY);
    if (stored !== null && stored.trim() !== "") {
      const parsed = parseInt(stored, 10);
      if (Number.isFinite(parsed) && parsed >= 0) {
        return parsed;
      }
    }
  } catch (error) {
    if (state.verboseLogging) {
      console.warn("Unable to load history token budget from storage:", error);
    }
  }
  return null;
}

/**
 * Persists the history token budget to localStorage (best-effort). `null`
 * clears the override so the provider default applies again.
 */
function persistHistoryTokenBudget(value: number | null) {
  try {
    if (value === null) {
      localStorage.removeItem(HISTORY_TOKEN_BUDGET_STORAGE_KEY);
    } else {
      localStorage.setItem(HISTORY_TOKEN_BUDGET_STORAGE_KEY, String(value));
    }
  } catch (error) {
    if (state.verboseLogging) {
      console.warn("Unable to save history token budget preference:", error);
    }
  }
}

/**
 * Redraws the budget input and its help text against the active provider, so a
 * user who has not set a budget sees the provider default they will actually
 * get. Called on init and whenever the service changes.
 */
export function refreshHistoryTokenBudgetControl(): void {
  const fallback = defaultHistoryTokenBudget();
  const input = elements.historyTokenBudgetInput;
  if (input) {
    input.value = state.historyTokenBudget === undefined ? "" : String(state.historyTokenBudget);
    input.placeholder = String(fallback);
  }
  if (typeof document === "undefined") {
    return;
  }
  const help = document.getElementById("history-token-budget-help");
  if (help) {
    const providerLabel = isLocalService(activeServiceKey()) ? "local servers" : "cloud providers";
    help.textContent = "Caps the conversation history sent each turn to control cost. When the estimated token count "
      + "exceeds this budget, the oldest messages are dropped first (the latest turn and system prompt are always kept). "
      + `Leave blank for the ${providerLabel} default of ${fallback.toLocaleString()}; set 0 to send the full history.`;
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
  state.historyTokenBudget = storedBudget === null ? undefined : storedBudget;

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
    refreshHistoryTokenBudgetControl();

    if (!elements.historyTokenBudgetInput.dataset.bound) {
      elements.historyTokenBudgetInput.addEventListener("change", (event) => {
        const budgetInput = event.target as HTMLInputElement;
        // A cleared field drops the override rather than pinning a number, so
        // the budget keeps following whichever provider is active.
        if (budgetInput.value.trim() === "") {
          state.historyTokenBudget = undefined;
          persistHistoryTokenBudget(null);
          refreshHistoryTokenBudgetControl();
          return;
        }
        const budget = normalizeHistoryTokenBudget(budgetInput.value);
        state.historyTokenBudget = budget;
        persistHistoryTokenBudget(budget);
        budgetInput.value = String(budget);
      });
      elements.historyTokenBudgetInput.dataset.bound = "true";
    }
  }

  logVerbose("Model settings initialized from config with reasoning effort and verbosity:", {
    reasoning: state.currentReasoningEffort,
    verbosity: state.currentVerbosity,
    historyTokenBudget: state.historyTokenBudget,
  });

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

/**
 * Returns the conversation-history token budget in effect: the user's stored
 * value when they set one, otherwise the active provider's default.
 */
export function getHistoryTokenBudget() {
  if (state.historyTokenBudget === undefined || state.historyTokenBudget === null) {
    return defaultHistoryTokenBudget();
  }
  return normalizeHistoryTokenBudget(state.historyTokenBudget);
}

/** Returns the normalized response-verbosity setting. */
export function getVerbosity() {
  return normalizeVerbosity(state.currentVerbosity);
}
