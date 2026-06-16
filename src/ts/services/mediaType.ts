/**
 * Media-type detection and naming.
 *
 * @remarks
 * Pure, dependency-light helpers for classifying media as image vs. video,
 * inferring MIME types, minting filenames, and building thumbnail markup. Split
 * out of {@link ./mediaTools.ts} (which re-exports them) to keep this leaf logic
 * free of the storage/state machinery used by the rest of that module.
 */

import { escapeHtml } from "../utils/sanitize.ts";
import type { GeneratedImage } from "../../types/common.ts";

/** Reports whether a MIME type is a video type. */
export function isVideoMimeType(mimeType: string = ""): boolean {
  return /^video\//i.test(mimeType);
}

/** Guesses a MIME type from a filename's extension, defaulting to `image/png`. */
export function inferMimeTypeFromFilename(filename: string = ""): string {
  const lowered = String(filename || "").toLowerCase();
  if (lowered.endsWith(".mp4")) return "video/mp4";
  if (lowered.endsWith(".mov")) return "video/quicktime";
  if (lowered.endsWith(".webm")) return "video/webm";
  if (lowered.endsWith(".m4v")) return "video/mp4";
  if (lowered.endsWith(".jpg") || lowered.endsWith(".jpeg")) return "image/jpeg";
  if (lowered.endsWith(".webp")) return "image/webp";
  if (lowered.endsWith(".gif")) return "image/gif";
  return "image/png";
}

/**
 * Classifies a media source as `"video"` or `"image"`, preferring an explicit
 * media type, then the MIME type (inferred from the filename if absent), then a
 * `data:video/` URL prefix.
 */
export function detectMediaType(
  source: { mediaType?: unknown; mimeType?: unknown; filename?: string; url?: unknown } = {},
): "video" | "image" {
  const explicitType = typeof source.mediaType === "string" ? source.mediaType.trim().toLowerCase() : "";
  if (explicitType === "video" || explicitType === "image") {
    return explicitType;
  }

  const mimeType = typeof source.mimeType === "string" ? source.mimeType : inferMimeTypeFromFilename(source.filename);
  if (isVideoMimeType(mimeType)) {
    return "video";
  }

  const url = typeof source.url === "string" ? source.url : "";
  if (url.startsWith("data:video/")) {
    return "video";
  }

  return "image";
}

/** Builds a unique filename from a prefix and MIME type, picking the matching extension. */
export function makeFilename(prefix: string, mimeType: string): string {
  const mediaType = isVideoMimeType(mimeType) ? "video" : "image";
  const extension = (() => {
    if (mimeType === "image/jpeg") return "jpg";
    if (mimeType === "image/webp") return "webp";
    if (mimeType === "image/gif") return "gif";
    if (mimeType === "video/webm") return "webm";
    if (mimeType === "video/quicktime") return "mov";
    return mediaType === "video" ? "mp4" : "png";
  })();
  const base = prefix || mediaType;
  return `${base}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
}

/** Builds a sanitized `<video>` or `<img>` thumbnail element for a media record. */
export function buildMediaRecordHtml(record: GeneratedImage): string {
  const mediaType = detectMediaType(record);
  const safeFilename = escapeHtml(record.filename || "");
  const safePrompt = escapeHtml(record.prompt || "");
  const safeTimestamp = escapeHtml(record.timestamp || "");
  const safeAlt = escapeHtml(record.prompt || (mediaType === "video" ? "Generated video" : "Generated image"));
  const src = escapeHtml(record.url || "");

  if (mediaType === "video") {
    return `<video src="${src}" class="generated-video-thumbnail" data-media-type="video" data-filename="${safeFilename}" data-prompt="${safePrompt}" data-timestamp="${safeTimestamp}" controls playsinline preload="metadata"></video>`;
  }

  return `<img src="${src}" alt="${safeAlt}" class="generated-image-thumbnail" data-media-type="image" data-filename="${safeFilename}" data-prompt="${safePrompt}" data-timestamp="${safeTimestamp}" />`;
}
