/**
 * Media element construction for conversation rendering.
 *
 * @remarks
 * Leaf helpers used by {@link ./render.ts} to turn a conversation's stored image
 * references into DOM media elements (or a fallback placeholder): looking up the
 * record, resolving a usable source URL, and building the `<img>`/`<video>`.
 */

import { detectMediaType, getMediaDisplayUrl } from "../mediaTools.ts";
import { escapeHtml } from "../../utils/sanitize.ts";
import type { ConversationRecord, GeneratedImage } from "../../../types/common.ts";

/** Builds the placeholder markup shown when a referenced media file cannot be loaded. */
export function createMissingMediaPlaceholder(filename: string, mediaType = "image") {
  const label = mediaType === "video" ? "Video" : "Image";
  return `<div class='image-placeholder' style='padding:40px;background:#f1f1f1;border-radius:8px;margin:8px 0;text-align:center;font-style:italic;color:#666;'>${label} could not be loaded: ${escapeHtml(filename)}</div>`;
}

/** Finds a conversation's stored image record by filename, or `null`. */
export function findMediaRecord(convo: ConversationRecord, filename: string) {
  return (convo.images || []).find((imageRef) => imageRef.filename === filename) || null;
}

/**
 * Resolves a usable source URL for a media record: its inline URL, or the
 * cached IndexedDB blob when stored. Returns `""` when none is available.
 */
export function resolveMediaSource(mediaRecord: GeneratedImage | null, filename: string, imageCache: Map<string, string | Blob>): string {
  if (!mediaRecord) {
    return "";
  }

  if (typeof mediaRecord.url === "string" && mediaRecord.url.trim()) {
    return mediaRecord.url;
  }

  if (mediaRecord.isStoredInDb && imageCache?.has(filename)) {
    return getMediaDisplayUrl(imageCache.get(filename), filename);
  }

  return "";
}

/** Builds a `<video>` or `<img>` element for a media record, tagged with dataset metadata. */
export function createMediaElement(mediaRecord: GeneratedImage, src: string, messageId = "") {
  const mediaType = detectMediaType(mediaRecord);

  if (mediaType === "video") {
    const videoEl = document.createElement("video");
    videoEl.src = src;
    videoEl.className = "generated-video-thumbnail";
    videoEl.controls = true;
    videoEl.playsInline = true;
    videoEl.preload = "metadata";
    videoEl.dataset.mediaType = "video";
    videoEl.dataset.filename = mediaRecord.filename || "";
    videoEl.dataset.messageId = messageId;
    videoEl.dataset.prompt = mediaRecord.prompt || "";
    videoEl.dataset.timestamp = String(mediaRecord.timestamp || "");
    return videoEl;
  }

  const imgEl = document.createElement("img");
  imgEl.src = src;
  imgEl.alt = mediaRecord.prompt || "Generated Image";
  imgEl.className = "generated-image-thumbnail";
  imgEl.dataset.mediaType = "image";
  imgEl.dataset.filename = mediaRecord.filename || "";
  imgEl.dataset.messageId = messageId;
  imgEl.dataset.prompt = mediaRecord.prompt || "";
  imgEl.dataset.timestamp = String(mediaRecord.timestamp || "");
  return imgEl;
}
