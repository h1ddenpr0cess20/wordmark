import { elements, state } from "../init/state.ts";
import { STORAGE_KEYS } from "../utils/storage.ts";
import type { Message } from "../../types/api.ts";
import { EXPORT_FORMATS, normaliseExportFormat, type ExportMessage } from "./exportFormats.ts";
/**
 * Chat export.
 *
 * @remarks
 * Normalizes the conversation history and drives the format registry in
 * {@link ./exportFormats.ts} to serialize it to the user-selected format,
 * persisting the chosen format as a preference and triggering a browser
 * download.
 */

/**
 * Splits message text into displayable content and reasoning segments.
 *
 * @remarks
 * The Responses API supplies reasoning separately, so no `<think>` parsing is
 * done; the text is returned trimmed with an empty reasoning list.
 */
function separateThinkingSegments(text: unknown) {
  const thinkingSegments: string[] = [];
  if (typeof text !== "string") {
    return { stripped: "", thinking: thinkingSegments };
  }
  return { stripped: text.trim(), thinking: thinkingSegments };
}

/** Normalizes raw conversation history into export-ready message records. */
function normaliseMessagesForExport(history: Message[]): ExportMessage[] {
  if (!Array.isArray(history)) {
    return [];
  }
  return history
    .filter((msg) => msg && msg.role && msg.role !== "system")
    .map((msg) => {
      const baseContent = typeof msg.content === "string"
        ? msg.content
        : JSON.stringify(msg.content, null, 2);
      const { stripped, thinking } = separateThinkingSegments(baseContent || "");
      const reasoningParts: string[] = [];

      if (Array.isArray(msg.reasoning)) {
        msg.reasoning.forEach((part: unknown) => {
          if (typeof part === "string" && part.trim()) {
            reasoningParts.push(part.trim());
          }
        });
      } else if (typeof msg.reasoning === "string" && msg.reasoning.trim()) {
        reasoningParts.push(msg.reasoning.trim());
      }

      if (thinking.length > 0) {
        reasoningParts.push(...thinking);
      }

      const seenReasoning = new Set<string>();
      const dedupedReasoning: string[] = [];
      reasoningParts.forEach((part) => {
        const key = part;
        if (!seenReasoning.has(key)) {
          seenReasoning.add(key);
          dedupedReasoning.push(part);
        }
      });

      return {
        role: msg.role || "",
        senderLabel: msg.role === "user" ? "You" : "Assistant",
        content: stripped,
        rawContent: (baseContent || "").trim(),
        reasoning: dedupedReasoning,
        timestamp: typeof msg.timestamp === "string" ? msg.timestamp : "",
      };
    });
}

/** Returns the persisted export-format preference, defaulting to `"md"`. */
function getStoredExportFormat() {
  const stored = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEYS.chatExportFormat) : null;
  return normaliseExportFormat(stored) || "md";
}

/** Persists the chosen export format, swallowing storage errors. */
function persistExportFormatPreference(formatKey: string) {
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEYS.chatExportFormat, formatKey);
  } catch (error) {
    console.warn("Unable to persist export format preference:", error);
  }
}

/** Determines the active export format from the selector, falling back to the stored preference then `"md"`. */
function resolveSelectedExportFormat() {
  const selectValue = elements.exportFormatSelector ? elements.exportFormatSelector.value : null;
  const normalised = normaliseExportFormat(selectValue);
  if (normalised && EXPORT_FORMATS[normalised]) {
    return normalised;
  }
  const fallback = getStoredExportFormat();
  if (EXPORT_FORMATS[fallback]) {
    return fallback;
  }
  return "md";
}

/** Change handler for the export-format selector; validates and persists the choice. */
export function handleExportFormatChange(event: Event) {
  const target = event ? (event.target as HTMLSelectElement | null) : null;
  const value = target ? target.value : null;
  const formatKey = normaliseExportFormat(value);
  if (!formatKey || !EXPORT_FORMATS[formatKey]) {
    return;
  }
  persistExportFormatPreference(formatKey);
  if (target && target.value !== formatKey) {
    target.value = formatKey;
  }
}

/** Initializes the export-format selector from the stored preference. */
export function initializeExportControls() {
  if (!elements.exportFormatSelector) {
    return;
  }
  const stored = getStoredExportFormat();
  const effective = EXPORT_FORMATS[stored] ? stored : "md";
  elements.exportFormatSelector.value = effective;
}

/**
 * Serializes the current conversation in the selected format and downloads it.
 *
 * @remarks
 * No-ops (with a warning) when the format is unsupported or the conversation is
 * empty. Whether reasoning is included depends on the "include thinking"
 * checkbox.
 */
export function exportChat() {
  const formatKey = resolveSelectedExportFormat();
  const formatConfig = EXPORT_FORMATS[formatKey];
  if (!formatConfig) {
    console.error("Unsupported export format selected:", formatKey);
    return;
  }

  persistExportFormatPreference(formatKey);

  const includeThinkingCheckbox = document.getElementById("include-thinking") as HTMLInputElement | null;
  const includeThinking = includeThinkingCheckbox ? includeThinkingCheckbox.checked : false;

  const normalisedMessages = normaliseMessagesForExport(state.conversationHistory);
  if (normalisedMessages.length === 0) {
    console.warn("Export skipped: no conversation history available yet.");
    return;
  }

  const exportMeta = { iso: new Date().toISOString() };
  const exportContent = formatConfig.build(normalisedMessages, includeThinking, exportMeta);

  const blob = new Blob([exportContent], { type: formatConfig.mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `chat-export-${new Date().toISOString().slice(0, 10)}.${formatConfig.extension}`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
