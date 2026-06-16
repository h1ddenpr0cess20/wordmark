/**
 * Pure image data-URL helpers.
 *
 * @remarks
 * Side-effect-free utilities for recognizing base64 payloads, reading and
 * normalizing MIME types, and coercing arbitrary image values (data URLs,
 * remote URLs, or bare base64) into a usable `data:` URL. Kept separate from the
 * streaming image-output processing in {@link ./imageGeneration.ts} so the
 * parsing math stays independently testable.
 */

/** Heuristically reports whether a string looks like a base64 payload (length/charset checks). */
function isProbablyBase64(value: unknown) {
  if (typeof value !== "string") {
    return false;
  }
  const sanitized = value.replace(/\s+/g, "");
  if (sanitized.length < 120) {
    return false;
  }
  if (sanitized.length % 4 !== 0) {
    return false;
  }
  return /^[A-Za-z0-9+/=]+$/.test(sanitized);
}

/** Extracts the MIME type from a `data:` URL prefix, or `null` if absent. */
export function extractMimeFromDataUrl(dataUrl: unknown) {
  if (typeof dataUrl !== "string") {
    return null;
  }
  const match = /^data:([^;]+);/i.exec(dataUrl);
  return match ? match[1].toLowerCase() : null;
}

/** Lower-cases and trims a MIME type, falling back to `image/png` when empty/invalid. */
export function normaliseMimeType(mimeType: unknown) {
  if (typeof mimeType === "string" && mimeType.trim()) {
    return mimeType.trim().toLowerCase();
  }
  return "image/png";
}

/**
 * Coerces an arbitrary image value into a usable URL: pass-through for existing
 * `data:image/` or `http(s)` URLs, and wraps bare base64 into a `data:` URL
 * using `mimeTypeHint`.
 *
 * @returns The resolved URL, or `null` if the value is unusable.
 */
export function coerceImageDataUrl(rawValue: unknown, mimeTypeHint: unknown) {
  if (typeof rawValue !== "string") {
    return null;
  }
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return null;
  }
  if (/^data:image\//i.test(trimmed) || /^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  const cleaned = trimmed.replace(/\s+/g, "");
  if (!isProbablyBase64(cleaned)) {
    return null;
  }
  const mimeType = normaliseMimeType(mimeTypeHint);
  const base64 = cleaned.replace(/^base64,?/i, "");
  return `data:${mimeType};base64,${base64}`;
}
