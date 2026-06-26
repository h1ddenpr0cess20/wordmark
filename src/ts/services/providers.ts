/**
 * Provider capability registry.
 *
 * Central source of truth for "what does each AI service support", replacing the
 * scattered `serviceKey === "xai" | "ollama" | "lmstudio" | "openai"` checks that
 * were re-derived at ~20 call sites. Adding or changing a provider's quirks now
 * happens here instead of being hunted down across the codebase.
 *
 * These are pure predicates over the service key (the same keys used in
 * `config.services`). They intentionally do not import `config` so they stay
 * order-independent and trivially testable.
 *
 * NOTE: provider *display labels* are deliberately NOT centralized here — the
 * existing call sites use divergent label conventions (e.g. the local-model
 * fetch status renders `openai` raw, while client config renders `OpenAI`), so a
 * single label map would change user-visible strings. Capability predicates are
 * the safe, behavior-preserving abstraction.
 */

/** Services that run against a local server and require no API key. */
const LOCAL_SERVICES = new Set<string>(["lmstudio", "ollama"]);

/** Hosted services that require an API key. */
const CLOUD_SERVICES = new Set<string>(["openai", "xai", "huggingface"]);

/** True for local-server providers (LM Studio, Ollama): no key, no cloud-only request fields. */
export function isLocalService(serviceKey: string | null | undefined): boolean {
  return serviceKey != null && LOCAL_SERVICES.has(serviceKey);
}

/** True for hosted providers (OpenAI, xAI): require an API key. */
export function isCloudService(serviceKey: string | null | undefined): boolean {
  return serviceKey != null && CLOUD_SERVICES.has(serviceKey);
}

/**
 * Whether the provider accepts the Responses-API `reasoning.effort` parameter.
 * xAI (Grok) rejects it; everything else accepts it (subject to model support,
 * which is a separate, model-level check).
 */
export function serviceSupportsReasoning(serviceKey: string | null | undefined): boolean {
  return serviceKey !== "xai";
}

/**
 * Whether the provider accepts the cloud-only `include` response fields.
 *
 * @remarks
 * These fields (`code_interpreter_call.outputs`, `web_search_call.action.sources`)
 * surface the outputs of OpenAI's hosted tools, so only OpenAI emits them. xAI,
 * local providers, and Hugging Face (whose OpenAI-compatible router does not run
 * those hosted tools) all reject or ignore them.
 */
export function supportsResponseIncludeFields(serviceKey: string | null | undefined): boolean {
  return serviceKey === "openai";
}

/**
 * Whether the provider runs certain tools (web_search / x_search /
 * code_interpreter) server-side rather than via client tool-call round-trips.
 * Currently xAI (Grok).
 */
export function usesServerManagedTools(serviceKey: string | null | undefined): boolean {
  return serviceKey === "xai";
}

/**
 * Role for the leading instruction message prepended to a request. xAI (Grok)
 * expects `system`; the Responses API and other providers use `developer`.
 */
export function instructionMessageRole(serviceKey: string | null | undefined): "system" | "developer" {
  return serviceKey === "xai" ? "system" : "developer";
}

/**
 * Whether the provider's text-to-speech endpoint accepts a voice-instructions
 * prompt. OpenAI's `gpt-4o-mini-tts` does; xAI (Grok) does not.
 */
export function ttsSupportsInstructions(serviceKey: string | null | undefined): boolean {
  return serviceKey !== "xai";
}

/**
 * Whether the provider attaches documents as direct `input_file` uploads rather
 * than through a vector store + file_search. xAI (Grok) uploads files directly;
 * other providers use a vector store.
 */
export function usesDirectFileUpload(serviceKey: string | null | undefined): boolean {
  return serviceKey === "xai";
}
