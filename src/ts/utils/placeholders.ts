/**
 * Canonical `[[IMAGE: filename]]` placeholder format, shared by the writers
 * (chat input, streamed-media bookkeeping) and readers (request serialization,
 * history render, thinking sanitization) so the format has a single source of
 * truth and cannot drift between them.
 */

/** Regex source matching an IMAGE placeholder; capture group 1 is the filename. */
export const IMAGE_PLACEHOLDER_PATTERN = "\\[\\[IMAGE:\\s*([^\\]]+)\\]\\]";

/** A fresh global regex for IMAGE placeholders (capture group 1 = filename). */
export function createImagePlaceholderRegex(): RegExp {
  return new RegExp(IMAGE_PLACEHOLDER_PATTERN, "g");
}
