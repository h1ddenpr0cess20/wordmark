import { elements } from "../../init/state.ts";
import { config } from "../../../config/config.ts";
import { isLocalService } from "../providers.ts";
/**
 * Responses client configuration helpers.
 * Provides access to defaults and active service/model selectors.
 */

export const DEFAULT_MODEL = "gpt-5-mini";
export const DEFAULT_VERBOSITY = "medium";
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

export function getActiveModel(): string {
  if (elements.modelSelector && elements.modelSelector.value) {
    return elements.modelSelector.value;
  }
  if (config && typeof config.getDefaultModel === "function") {
    return config.getDefaultModel();
  }
  return DEFAULT_MODEL;
}

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
