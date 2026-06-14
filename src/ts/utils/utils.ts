/**
 * Miscellaneous shared helpers: debouncing, input sanitization, and management
 * of the collapsible reasoning ("thinking") containers.
 */

import { state } from "../init/state.ts";
import type { Attachment } from "../../types/api.ts";

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

/**
 * Toggles a reasoning container's collapsed state and remembers the preference.
 *
 * @param id - The id of the thinking container to toggle.
 * @param event - Optional triggering event; bubbling and default are suppressed.
 */
export function toggleThinking(id: string, event?: Event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }

  const thinkingContainer = document.getElementById(id);
  if (!thinkingContainer) {
    console.warn("Thinking container not found:", id);
    return;
  }

  const wasCollapsed = thinkingContainer.classList.contains("collapsed");

  thinkingContainer.classList.toggle("collapsed");

  if (!state.userThinkingState || typeof state.userThinkingState !== "object") {
    state.userThinkingState = {};
  }
  state.userThinkingState[id] = wasCollapsed === true;

  if (state.verboseLogging) {
    console.log(`Toggled thinking container ${id}: ${wasCollapsed ? "expanded" : "collapsed"}`);
  }

  if (wasCollapsed) {
    const contentDiv = thinkingContainer.querySelector(".thinking-content");
    if (contentDiv) {
      setTimeout(() => {
        contentDiv.scrollTop = 0;
      }, 100);
    }
  }
}

/**
 * Replaces inline base64 image data in a stored user message with filename
 * placeholders, caching the stripped data URLs for later display.
 *
 * @remarks
 * Keeps large base64 strings out of conversation history. If the placeholders
 * are already present, only the base64 data is removed; otherwise the
 * placeholders are prepended to the remaining text.
 *
 * @param messageId - Id of the user message to rewrite.
 * @param placeholders - Placeholder strings such as `[[IMAGE: file.jpg]]`.
 */
export function stripBase64FromHistory(messageId: string, placeholders: string[] = []) {
  if (!Array.isArray(state.conversationHistory)) {
    return;
  }
  const entry = state.conversationHistory.find(msg => msg.id === messageId);
  if (!entry || entry.role !== "user") {
    return;
  }

  function sanitizeAttachments() {
    if (!Array.isArray(entry!.attachments)) {
      return;
    }
    entry!.attachments = entry!.attachments
      .map((att: Attachment): Attachment | null => {
        if (!att || typeof att !== "object") {
          return null;
        }
        const normalized: Attachment = { ...att };
        if (normalized.filename && normalized.dataUrl) {
          try {
            if (state.imageDataCache && typeof state.imageDataCache.set === "function") {
              state.imageDataCache.set(normalized.filename, normalized.dataUrl);
            }
          } catch (cacheErr) {
            console.warn("Failed to cache attachment data for", normalized.filename, cacheErr);
          }
          normalized.inlineDataRemoved = true;
          normalized.dataUrl = null;
        }
        return normalized;
      })
      .filter((att): att is Attachment => att !== null);
  }

  let textPart = typeof entry.content === "string" ? entry.content : "";

  const existingPlaceholders = placeholders.filter(placeholder =>
    textPart.includes(placeholder),
  );

  if (existingPlaceholders.length === placeholders.length) {
    entry.content = textPart.replace(/data:image\/[^;]+;base64,[^\s]+/g, "").trim();
    sanitizeAttachments();
    return;
  }

  textPart = textPart.replace(/data:image\/[^;]+;base64,[^\s]+/g, "").trim();
  const placeholderText = placeholders.join("\n");
  entry.content = placeholderText + (textPart ? `\n\n${textPart}` : "");
  sanitizeAttachments();
}

if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
  document.addEventListener("click", (event) => {
    const target = event.target as Element | null;
    const title = target?.closest(".thinking-title");
    if (!title) {
      return;
    }
    const container = title.closest(".thinking-container");
    if (container && container.id) {
      toggleThinking(container.id, event);
    }
  });
}
