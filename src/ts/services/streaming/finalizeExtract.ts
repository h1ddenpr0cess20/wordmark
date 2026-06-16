/**
 * Final-payload text extraction.
 *
 * @remarks
 * Pure helpers that pull the assistant's output text and reasoning text out of a
 * completed (non-streamed or finalized) response payload, used as a fallback by
 * {@link ./messageLifecycle.ts} when streaming did not already supply them.
 * Side-effect free and independent of the DOM.
 */

import { isRecord } from "../../utils/utils.ts";

/**
 * Extracts the assistant's output text from a finalized response payload,
 * handling `output` arrays of `output_text` items and the `output_text`
 * string/array shapes. Returns `""` when none is present.
 */
export function extractOutputText(payload: unknown): string {
  if (!isRecord(payload)) {
    return "";
  }
  if (Array.isArray(payload.output)) {
    return payload.output
      .filter((item): item is Record<string, unknown> => isRecord(item) && item.type === "output_text")
      .map((item) => {
        if (typeof item.text === "string" && item.text) return item.text;
        if (typeof item.content === "string" && item.content) return item.content;
        return "";
      })
      .join("");
  }
  if (typeof payload.output_text === "string") {
    return payload.output_text;
  }
  if (Array.isArray(payload.output_text)) {
    return payload.output_text.join("");
  }
  return "";
}

/**
 * Extracts reasoning text from a finalized response payload across the shapes
 * providers use (`reasoning` string/array/`{output}`, `reasoning_content`
 * string/array). Returns `""` when none is present.
 */
export function extractReasoningText(payload: unknown): string {
  if (!isRecord(payload)) {
    return "";
  }
  const flattenContentArray = (items: unknown[]) => {
    return items
      .map((item: unknown) => {
        if (typeof item === "string") {
          return item;
        }
        if (isRecord(item)) {
          if (typeof item.text === "string") {
            return item.text;
          }
          if (typeof item.content === "string") {
            return item.content;
          }
        }
        return "";
      })
      .join("");
  };
  const reasoning = payload.reasoning;
  if (typeof reasoning === "string") {
    return reasoning;
  }
  if (Array.isArray(reasoning)) {
    return reasoning.map((item: unknown) => (isRecord(item) && typeof item.content === "string" ? item.content : "")).join("");
  }
  if (isRecord(reasoning) && Array.isArray(reasoning.output)) {
    return reasoning.output.map((item: unknown) => (isRecord(item) && typeof item.content === "string" ? item.content : "")).join("");
  }
  if (typeof payload.reasoning_content === "string") {
    return payload.reasoning_content;
  }
  if (Array.isArray(payload.reasoning_content)) {
    return flattenContentArray(payload.reasoning_content);
  }
  if (isRecord(reasoning) && typeof reasoning.content === "string") {
    return reasoning.content;
  }
  return "";
}
