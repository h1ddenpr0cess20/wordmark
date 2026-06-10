/**
 * Responses client configuration helpers.
 *
 * @remarks
 * Provides the request defaults and the selectors for the active service, model,
 * base URL, and API key.
 */

import { elements } from "../../init/state.ts";
import { config } from "../../../config/config.ts";
import { isLocalService } from "../providers.ts";

/** Default model used when no model has been selected. */
export const DEFAULT_MODEL = "gpt-5-mini";

/** Default response verbosity. */
export const DEFAULT_VERBOSITY = "medium";

/** Default reasoning effort. */
export const DEFAULT_REASONING_EFFORT = "low";

function isConfiguredServiceEnabled(serviceKey: string | null | undefined): boolean {
  if (!serviceKey || !config || !config.services) {
    return false;
  }
  if (typeof config.isServiceEnabled === "function") {
    return config.isServiceEnabled(serviceKey);
  }
  const service = config.services[serviceKey];
  return Boolean(service && service.enabled !== false);
}

function getFallbackServiceKey(): string {
  if (isConfiguredServiceEnabled("openai")) {
    return "openai";
  }
  const services = config && config.services;
  if (!services) {
    return "openai";
  }
  return Object.keys(services).find(isConfiguredServiceEnabled) || "openai";
}

/**
 * Returns the currently selected model, falling back to the configured
 * default model and finally {@link DEFAULT_MODEL}.
 */
export function getActiveModel(): string {
  if (elements.modelSelector && elements.modelSelector.value) {
    return elements.modelSelector.value;
  }
  if (config && typeof config.getDefaultModel === "function") {
    return config.getDefaultModel();
  }
  return DEFAULT_MODEL;
}

/**
 * Returns the active service key, preferring the user selection when that
 * service is enabled, then the configured default, then the first enabled
 * service ({@link getFallbackServiceKey}).
 */
export function getActiveServiceKey(): string {
  const selectedService = elements.serviceSelector && elements.serviceSelector.value;
  if (selectedService && isConfiguredServiceEnabled(selectedService)) {
    return selectedService;
  }
  if (config && typeof config.defaultService === "string" && isConfiguredServiceEnabled(config.defaultService)) {
    return config.defaultService;
  }
  return getFallbackServiceKey();
}

/**
 * Resolves the API key for the active service. Returns the trimmed key when
 * present, `null` for local services that need no key, and throws with a
 * user-facing message when a cloud service is missing its key.
 *
 * @returns The trimmed API key, or `null` for local services.
 * @throws If the API configuration is unavailable or a required key is missing.
 */
export function ensureApiKey(): string | null {
  if (!config || typeof config.getApiKey !== "function") {
    throw new Error("API configuration is unavailable.");
  }
  const activeServiceKey = getActiveServiceKey();
  const key = config.getApiKey();
  const trimmed = typeof key === "string" ? key.trim() : "";
  if (trimmed) {
    return trimmed;
  }
  if (isLocalService(activeServiceKey)) {
    return null;
  }
  const friendlyName = (() => {
    if (activeServiceKey === "openai") return "OpenAI";
    if (activeServiceKey === "xai") return "xAI";
    return activeServiceKey
      ? activeServiceKey.charAt(0).toUpperCase() + activeServiceKey.slice(1)
      : "OpenAI";
  })();
  throw new Error(`Add your ${friendlyName} API key in Settings → API Keys.`);
}

/**
 * Returns the active service base URL with any trailing slashes removed.
 *
 * @throws If the base URL is not configured or empty.
 */
export function getBaseUrl(): string {
  if (!config || typeof config.getBaseUrl !== "function") {
    throw new Error("API base URL is not configured.");
  }
  const baseUrl = config.getBaseUrl();
  if (!baseUrl) {
    throw new Error("API base URL is empty.");
  }
  return baseUrl.replace(/\/+$/, "");
}

/**
 * Reports whether a model accepts a reasoning-effort parameter. GPT-4 models
 * do not; Grok models only when they are "fast" variants; all others do.
 *
 * @param modelName - Model to check; defaults to the active model.
 */
export function supportsReasoningEffort(modelName: string | null = null): boolean {
  const model = String(modelName || getActiveModel() || "").toLowerCase();
  if (!model) {
    return true;
  }
  if (model.startsWith("gpt-4")) {
    return false;
  }
  if (model.startsWith("grok")) {
    return model.includes("fast");
  }
  return true;
}
