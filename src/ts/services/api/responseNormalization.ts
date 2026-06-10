/**
 * Non-streaming response normalization.
 *
 * The streaming path emits a single, provider-agnostic SSE event vocabulary, so
 * it needs no per-provider reconciliation. The non-streaming path is the one
 * place where provider response shapes actually diverge: OpenAI returns
 * `output_text` + structured `reasoning`, while xAI / Ollama / LM Studio expose
 * reasoning under assorted keys (`reasoning` as string or array, `reasoning.output`,
 * `reasoning_content`, `reasoning.content`). These helpers fold that variance
 * into plain strings so `runTurn` consumes one normalized shape.
 *
 * The branch precedence is significant and preserved exactly from the previous
 * inline implementation in `requestClient.ts`.
 */

import type { ResponseObject } from "../../../types/api.ts";

/** Flatten an array of strings / `{content}` / `{text}` items into one string. */
function flattenContent(items: unknown[]): string {
  return items
    .map(item => {
      if (typeof item === "string") {
        return item;
      }
      if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>;
        if (typeof obj.content === "string") {
          return obj.content;
        }
        if (typeof obj.text === "string") {
          return obj.text;
        }
      }
      return "";
    })
    .join("");
}

/** The assistant's text output from a non-streaming response. */
export function extractOutputText(response: ResponseObject): string {
  return typeof response.output_text === "string" ? response.output_text : "";
}

/**
 * The reasoning/thinking text from a non-streaming response, reading the
 * provider-specific shapes in their original precedence order.
 */
export function extractReasoningText(response: ResponseObject): string {
  const reasoning = response.reasoning;
  const reasoningContent = response.reasoning_content;

  if (reasoning && typeof reasoning === "string") {
    return reasoning;
  }
  if (reasoning && Array.isArray(reasoning)) {
    return flattenContent(reasoning);
  }
  if (reasoning && typeof reasoning === "object" && Array.isArray((reasoning as Record<string, unknown>).output)) {
    const output = (reasoning as Record<string, unknown>).output as unknown[];
    return output
      .map(item => {
        const content = (item as { content?: unknown } | null | undefined)?.content;
        return content ? String(content) : "";
      })
      .join("");
  }
  if (typeof reasoningContent === "string") {
    return reasoningContent;
  }
  if (Array.isArray(reasoningContent)) {
    return flattenContent(reasoningContent);
  }
  if (reasoning && typeof reasoning === "object" && typeof (reasoning as Record<string, unknown>).content === "string") {
    return (reasoning as Record<string, unknown>).content as string;
  }
  return "";
}
