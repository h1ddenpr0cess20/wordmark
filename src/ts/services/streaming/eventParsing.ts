/**
 * Pure parsing and formatting helpers for the streaming event processor.
 *
 * @remarks
 * These functions translate raw Responses API stream payloads into the small
 * pieces of text the processor needs (delta text, reasoning text, formatted
 * tool arguments, search queries). They are side-effect free and depend only on
 * their inputs, which keeps them independently testable and decoupled from the
 * streaming runtime in {@link ./eventProcessor.ts}.
 */

import { isRecord } from "../../utils/utils.ts";

/** Appends `delta` to the buffered string stored at `key` (no-op for empty deltas). */
export function bufferAppend(map: Map<string, string>, key: string, delta: string) {
  if (!delta) return;
  const prev = map.get(key) || "";
  map.set(key, prev + delta);
}

/** Returns the buffered string at `key`, or an empty string when absent. */
export function bufferGet(map: Map<string, string>, key: string) {
  return map.get(key) || "";
}

/**
 * Splits `text` on newlines and caps the result at `limit` lines, appending a
 * "… (N more lines)" marker when the input is longer. Used to keep streamed
 * shell/code-interpreter output previews compact in the reasoning panel.
 */
export function previewLines(text: string, limit: number): string[] {
  const lines = text.split("\n");
  return lines.length > limit
    ? [...lines.slice(0, limit), `… (${lines.length - limit} more lines)`]
    : lines;
}

/** Stringifies a value (if needed) and truncates it to `max` characters with an ellipsis. */
export function safeTruncate(str: unknown, max = 800): string {
  let text: string;
  if (typeof str === "string") {
    text = str;
  } else {
    try {
      text = JSON.stringify(str, null, 2);
    } catch {
      text = String(str);
    }
  }
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * Formats tool-call arguments for display inside a fenced code block: pretty
 * printed JSON when parseable, the raw string otherwise. Data-URI string values
 * (e.g. base64 source images passed to edit tools) are stubbed to a short
 * marker, and the result is truncated with a `…` marker past `maxChars`.
 * Returns `""` for empty/absent arguments.
 */
export function formatArgsBlock(args: unknown, maxChars = 4000): string {
  if (!args) return "";
  let parsed: unknown = null;
  if (typeof args === "string") {
    if (!args.trim()) return "";
    try {
      parsed = JSON.parse(args);
    } catch {
      return truncateAtLineBoundary(args.trim(), maxChars);
    }
  } else if (typeof args === "object") {
    parsed = args;
  }
  if (!isRecord(parsed) || Object.keys(parsed).length === 0) return "";
  try {
    return truncateAtLineBoundary(JSON.stringify(stubDataUris(parsed), null, 2), maxChars);
  } catch {
    return "";
  }
}

/** Recursively replaces long data-URI strings with a short `data:…(N chars)` stub. */
function stubDataUris(value: unknown): unknown {
  if (typeof value === "string") {
    return value.startsWith("data:") && value.length > 120
      ? `${value.slice(0, 40)}…(${value.length} chars)`
      : value;
  }
  if (Array.isArray(value)) {
    return value.map(stubDataUris);
  }
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, stubDataUris(entry)]));
  }
  return value;
}

/**
 * Truncates `text` to at most `maxChars`, preferring to cut at a line boundary
 * but falling back to a mid-line cut when the last line spans more than half
 * the budget, so a single long line (e.g. an image prompt) is never dropped
 * outright.
 */
function truncateAtLineBoundary(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const lastNewline = cut.lastIndexOf("\n");
  return lastNewline >= maxChars / 2 ? `${cut.slice(0, lastNewline)}\n…` : `${cut}…`;
}

/** Extracts de-duplicated search query strings from raw tool-call arguments. */
export function extractQueriesFromArgs(argsStr: unknown) {
  const queries: string[] = [];
  if (!argsStr) return queries;
  let parsed: unknown = null;
  if (typeof argsStr === "string") {
    try {
      parsed = JSON.parse(argsStr);
    } catch {
      parsed = null;
    }
  } else if (typeof argsStr === "object") {
    parsed = argsStr;
  }
  if (!isRecord(parsed)) return queries;

  const candidates: string[] = [];
  if (typeof parsed.query === "string") candidates.push(parsed.query);
  if (Array.isArray(parsed.queries)) {
    parsed.queries.forEach((q: unknown) => { if (typeof q === "string") candidates.push(q); });
  }
  if (Array.isArray(parsed.searches)) {
    parsed.searches.forEach((q: unknown) => { if (typeof q === "string") candidates.push(q); });
  }
  if (typeof parsed.q === "string") candidates.push(parsed.q);

  const seen = new Set<string>();
  candidates.forEach((q: string) => {
    const trimmed = q.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      queries.push(trimmed);
    }
  });
  return queries;
}

/**
 * Extracts the query (or target URL) from a hosted search-call item. Provider-
 * managed web/x search tools do not emit `function_call_arguments` events; their
 * query travels in the item's `action` object on `output_item.added`/`.done`
 * (`{ type: "search", queries: [...] }`, or `{ type: "open_page", url }` when the
 * model opens a result). The `queries` array is the populated field; `query`
 * (singular) is deprecated and often absent. Returns `""` when nothing is present.
 */
export function extractSearchQueryFromItem(item: unknown): string {
  if (!isRecord(item)) return "";
  const action = item.action;
  if (isRecord(action)) {
    const fromActionQueries = joinQueries(action.queries);
    if (fromActionQueries) return fromActionQueries;
    if (typeof action.query === "string" && action.query.trim()) return action.query.trim();
    if (typeof action.url === "string" && action.url.trim()) return action.url.trim();
  }
  const fromItemQueries = joinQueries(item.queries);
  if (fromItemQueries) return fromItemQueries;
  if (typeof item.query === "string" && item.query.trim()) return item.query.trim();
  return "";
}

function joinQueries(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .filter((q): q is string => typeof q === "string" && q.trim().length > 0)
    .map((q) => q.trim())
    .join(", ");
}

/** Pulls the incremental text out of a delta payload across the shapes the API emits. */
export function extractDeltaText(payload: unknown): string {
  if (!isRecord(payload)) return "";
  const delta = payload.delta;
  if (typeof delta === "string") {
    return delta;
  }
  if (Array.isArray(delta) && delta.length > 0) {
    return delta.map((item: unknown) => (typeof item === "string" ? item : "")).join("");
  }
  if (isRecord(delta) && typeof delta.text === "string") {
    return delta.text;
  }
  if (typeof payload.text === "string") {
    return payload.text;
  }
  return "";
}

/** Recursively flattens an array of content items into a single concatenated string. */
export function flattenContentArray(items: unknown[]): string {
  return items.map((item: unknown) => pluckReasoningValue(item)).join("");
}

/** Recursively extracts a textual value from a reasoning-bearing item of any shape. */
export function pluckReasoningValue(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return flattenContentArray(value);
  if (isRecord(value)) {
    if (typeof value.content === "string") return value.content;
    if (Array.isArray(value.content)) return flattenContentArray(value.content);
    if (typeof value.text === "string") return value.text;
    if (Array.isArray(value.text)) return flattenContentArray(value.text);
    if (typeof value.output === "string") return value.output;
    if (Array.isArray(value.output)) return flattenContentArray(value.output);
    if (typeof value.reasoning === "string") return value.reasoning;
    if (Array.isArray(value.reasoning)) return flattenContentArray(value.reasoning);
  }
  return "";
}

/** Reads a value at a dotted key path, returning undefined if any segment is missing. */
export function getNestedValue(source: unknown, path: string[]): unknown {
  return path.reduce<unknown>((value, key) => (isRecord(value) ? value[key] : undefined), source);
}

/** Searches a payload's known reasoning locations and returns the first non-empty text found. */
export function extractReasoningText(payload: unknown): string {
  if (!payload) return "";

  const candidatePaths = [
    ["reasoning"],
    ["reasoning", "output"],
    ["reasoning", "content"],
    ["reasoning_content"],
    ["reasoning_content", "output"],
    ["text"],
    ["delta", "reasoning_content"],
    ["delta", "reasoning_content", "output"],
    ["delta", "reasoning"],
    ["delta", "reasoning", "output"],
    ["delta", "reasoning", "content"],
    ["delta", "content"],
    ["delta", "text"],
    ["delta"],
  ];

  for (const path of candidatePaths) {
    const candidate = getNestedValue(payload, path);
    const text = pluckReasoningValue(candidate);
    if (text && text.trim()) {
      return text;
    }
  }

  return "";
}
