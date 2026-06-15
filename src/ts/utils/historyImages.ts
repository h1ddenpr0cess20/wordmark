/**
 * Conversation-history image sanitization.
 *
 * @remarks
 * Keeps large inline base64 image data out of stored conversation history by
 * replacing it with filename placeholders and caching the stripped data URLs
 * for later display. Lifted out of the generic `utils.ts` grab-bag, which
 * should hold only domain-agnostic helpers.
 */

import { state } from "../init/state.ts";
import type { Attachment } from "../../types/api.ts";

/** Matches inline base64 image data URIs that should be stripped from stored history. */
const INLINE_BASE64_IMAGE_PATTERN = /data:image\/[^;]+;base64,[^\s]+/g;

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
    entry.content = textPart.replace(INLINE_BASE64_IMAGE_PATTERN, "").trim();
    sanitizeAttachments();
    return;
  }

  textPart = textPart.replace(INLINE_BASE64_IMAGE_PATTERN, "").trim();
  const placeholderText = placeholders.join("\n");
  entry.content = placeholderText + (textPart ? `\n\n${textPart}` : "");
  sanitizeAttachments();
}
