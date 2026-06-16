/**
 * Miscellaneous domain-agnostic helpers: debouncing, input sanitization,
 * record access, URL normalization, and size/text formatting.
 *
 * @remarks
 * Re-exports {@link toggleThinking} and {@link stripBase64FromHistory} from
 * their own modules so existing import paths stay stable; the implementations
 * live in {@link ./thinking.ts} and {@link ./historyImages.ts}.
 */

export { toggleThinking } from "./thinking.ts";
export { stripBase64FromHistory } from "./historyImages.ts";

/**
 * Wraps a function so it only runs after `wait` ms have elapsed since the last
 * call.
 *
 * @typeParam A - The wrapped function's argument tuple.
 * @param func - The function to debounce.
 * @param wait - Idle time in milliseconds before invocation.
 * @returns The debounced wrapper.
 */
export function debounce<A extends unknown[]>(func: (...args: A) => unknown, wait: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  return function(this: unknown, ...args: A) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}

/**
 * Escapes `<` and `>` in user input to prevent HTML injection.
 *
 * @param text - Raw text to escape.
 * @returns The escaped text.
 */
export function sanitizeInput(text: string): string {
  return text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Narrows an unknown value to a plain key/value record (a non-null,
 * non-array object).
 *
 * @param value - The value to test.
 * @returns True when `value` is a non-array object.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Returns the first own property among `keys` whose value is a non-empty
 * string.
 *
 * @param record - Source object.
 * @param keys - Candidate keys in priority order.
 * @returns The matching string, or null when none qualify.
 */
export function pickString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value) {
      return value;
    }
  }
  return null;
}

/**
 * Normalizes a user-entered local-inference server URL for storage: trims
 * surrounding whitespace and strips a single trailing slash and/or `/v1`
 * suffix so a canonical base (without the version segment) is persisted.
 *
 * @param rawUrl - The raw URL as typed by the user.
 * @returns The normalized base URL (no trailing slash, no `/v1`).
 */
export function normalizeServerBaseUrl(rawUrl: string): string {
  let serverUrl = rawUrl.trim();
  if (serverUrl.endsWith("/")) {
    serverUrl = serverUrl.slice(0, -1);
  }
  if (serverUrl.endsWith("/v1")) {
    serverUrl = serverUrl.slice(0, -3);
  }
  return serverUrl;
}

/**
 * Truncates `text` to at most `max` characters, appending an ellipsis when
 * the text was actually shortened.
 *
 * @param text - The source text.
 * @param max - Maximum length before truncation.
 * @returns The original text, or its first `max` chars followed by "...".
 */
export function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "..." : text;
}

/**
 * Formats a byte count as a short human-readable size (B, KB, or MB).
 *
 * @remarks
 * KB/MB are rendered to one decimal place; sizes are not promoted past MB.
 *
 * @param bytes - The size in bytes.
 * @returns A label such as `512 B`, `1.5 KB`, or `3.0 MB`.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

