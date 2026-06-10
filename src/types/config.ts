/**
 * Shared types for the application configuration object
 * ({@link Config}, defined in `src/config/config.ts`).
 */

/** Identifier for a built-in AI provider. */
export type ServiceKey = "openai" | "lmstudio" | "ollama" | "xai";

/** A model entry as returned by a provider's `/models` (or `/api/tags`) endpoint. */
export interface ModelListItem {
  id?: string;
  name?: string;
  model?: string;
}

/** A single AI provider configuration. */
export interface ServiceConfig {
  baseUrl: string;
  apiKey: string;
  models: string[];
  defaultModel: string;
  modelsFetching: boolean;
  /** OpenAI organization id, when applicable. */
  organization?: string | null;
  /** Providers default to enabled; set false to hide from selection. */
  enabled?: boolean;
  /** Present only on providers that filter their model list (openai, xai). */
  _isChatModel?(modelId: string): boolean;
  /** Refreshes `models` from the provider and notifies the UI. */
  fetchAndUpdateModels(): Promise<void>;
}

/** The top-level config object plus its helper methods. */
export interface Config {
  defaultService: string;
  enableFunctionCalling: boolean;
  services: Record<string, ServiceConfig>;
  isServiceEnabled(serviceKey: string): boolean;
  normalizeServiceKey(serviceKey: string): string;
  getActiveService(): ServiceConfig;
  getApiKey(): string;
  getBaseUrl(): string;
  getDefaultModel(): string;
  getAvailableModels(): string[];
}
