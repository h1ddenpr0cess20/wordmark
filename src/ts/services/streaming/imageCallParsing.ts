/**
 * Image-generation call parsing.
 *
 * @remarks
 * Pure helpers that read an image-generation output node (or its enclosing
 * response) to recover the prompt, the requested mode, and a source label.
 * Split out of {@link ./imageGeneration.ts} so the shape-tolerant parsing logic
 * stays dependency-light and independently testable.
 */

import { isRecord } from "../../utils/utils.ts";

/**
 * Extracts the prompt for an image-generation call, checking the revised/raw
 * prompt fields, then JSON or object `arguments` (`prompt`/`input`/
 * `description`), then `metadata`. Returns `""` when none is present.
 */
export function extractPromptFromImageCall(call: unknown) {
  if (!isRecord(call)) {
    return "";
  }
  if (typeof call.revised_prompt === "string" && call.revised_prompt.trim()) {
    return call.revised_prompt.trim();
  }
  if (typeof call.prompt === "string" && call.prompt.trim()) {
    return call.prompt.trim();
  }
  let argumentsSource: unknown = call.arguments;
  if (typeof argumentsSource === "string") {
    try {
      argumentsSource = JSON.parse(argumentsSource);
    } catch {
      argumentsSource = null;
    }
  }
  if (isRecord(argumentsSource)) {
    if (typeof argumentsSource.prompt === "string" && argumentsSource.prompt.trim()) {
      return argumentsSource.prompt.trim();
    }
    if (typeof argumentsSource.input === "string" && argumentsSource.input.trim()) {
      return argumentsSource.input.trim();
    }
    if (typeof argumentsSource.description === "string" && argumentsSource.description.trim()) {
      return argumentsSource.description.trim();
    }
  }
  if (isRecord(call.metadata)) {
    const metadata = call.metadata;
    const keys = ["prompt", "description", "request"];
    for (const key of keys) {
      const value = metadata[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
  }
  return "";
}

/**
 * Detects an image call's mode by scanning the node, its metadata, and its
 * (object or JSON-string) arguments for a `mode`/`purpose` value. Returns the
 * lower-cased mode, or `""` when none is found.
 */
export function detectImageCallMode(call: unknown) {
  const record = isRecord(call) ? call : undefined;
  const metadata = record && isRecord(record.metadata) ? record.metadata : undefined;
  const candidates: unknown[] = [
    record?.mode,
    metadata?.mode,
  ];
  const args = record?.arguments;
  if (isRecord(args)) {
    if (typeof args.mode === "string") {
      candidates.push(args.mode);
    }
    if (typeof args.purpose === "string") {
      candidates.push(args.purpose);
    }
  }
  if (typeof args === "string") {
    try {
      const parsed: unknown = JSON.parse(args);
      if (isRecord(parsed) && typeof parsed.mode === "string") {
        candidates.push(parsed.mode);
      }
    } catch {
      /* ignore parse */
    }
  }
  const found = candidates.find(value => typeof value === "string" && value.trim());
  return typeof found === "string" ? found.trim().toLowerCase() : "";
}

/**
 * Classifies a call as `image_edit`, `image_variation`, or `image_generation`,
 * preferring the detected `mode` and falling back to the node's `type`.
 */
export function determineSourceLabel(node: unknown, mode: string) {
  if (mode) {
    if (mode.includes("edit")) {
      return "image_edit";
    }
    if (mode.includes("variation")) {
      return "image_variation";
    }
  }
  if (isRecord(node) && typeof node.type === "string") {
    const lowered = node.type.toLowerCase();
    if (lowered.includes("edit")) {
      return "image_edit";
    }
    if (lowered.includes("variation")) {
      return "image_variation";
    }
  }
  return "image_generation";
}
