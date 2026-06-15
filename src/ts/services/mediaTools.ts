/**
 * Client-side media display, storage, and registration helpers.
 *
 * @remarks
 * Handles media-type detection, thumbnail markup, display-URL resolution,
 * downloads, latest-media lookup, and registering generated/uploaded media in
 * application state. The xAI Grok Imagine generate/edit tool that produces this
 * media lives in {@link ./grokImageTool.ts}.
 */

import { state } from "../init/state.ts";
import { loadImageFromDb, saveImageToDb } from "../utils/imageStorage.ts";
import {
  detectMediaType,
  makeFilename,
  isVideoMimeType,
  buildMediaRecordHtml,
  inferMimeTypeFromFilename,
} from "./mediaType.ts";
import type { GeneratedImage } from "../../types/common.ts";

export { detectMediaType, makeFilename, isVideoMimeType, buildMediaRecordHtml };

interface RegisterMediaOptions {
  mediaType?: string;
  sourceData: Blob | string;
  prompt?: string;
  tool?: string;
  filename?: string;
  mimeType?: string;
  associatedMessageId?: string | null;
  callId?: string | null;
  model?: string | null;
  uploaded?: boolean;
}

/** Returns an object URL for a blob, the string as-is for strings, or `""` otherwise. */
function createObjectUrl(value: unknown): string {
  if (value instanceof Blob) {
    return URL.createObjectURL(value);
  }
  if (typeof value === "string") {
    return value;
  }
  return "";
}

/**
 * Fetches `url` and returns the response body as a {@link Blob}.
 *
 * @throws If the response status is not ok.
 */
async function fetchBlob(url: string, options: RequestInit = {}): Promise<Blob> {
  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`${response.status} ${response.statusText}${text ? `: ${text}` : ""}`);
  }
  return response.blob();
}

/** Decodes a base64 `data:` URI into a {@link Blob}, preserving its MIME type. */
function decodeDataUri(reference: string): Blob {
  const [header, encoded] = String(reference).split(",", 2);
  const mimeMatch = /^data:([^;]+)/i.exec(header || "");
  const mimeType = mimeMatch ? mimeMatch[1] : "application/octet-stream";
  const binary = window.atob(encoded || "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

/**
 * Resolves a display URL for a stored media record by filename, using the
 * in-memory cache first and loading from IndexedDB on a miss.
 *
 * @returns The display URL, or `null` if it cannot be resolved.
 */
async function resolveStoredReference(record: { filename?: string } | null | undefined): Promise<string | null> {
  if (!record || !record.filename) {
    return null;
  }
  if (state.imageDataCache?.has(record.filename)) {
    const cached = state.imageDataCache.get(record.filename);
    if (cached) {
      return cached;
    }
  }
  try {
    const stored = await loadImageFromDb(record.filename);
    const displayUrl = getMediaDisplayUrl(stored?.data, record.filename) || "";
    if (displayUrl && state.imageDataCache?.set) {
      state.imageDataCache.set(record.filename, displayUrl);
    }
    return displayUrl || null;
  } catch (error) {
    console.warn("Failed to resolve stored media reference:", record.filename, error);
    return null;
  }
}

/**
 * Scans the conversation history newest-first for the most recent image
 * attachment, returning its data URL, remote URL, or resolved stored reference.
 *
 * @returns A usable image reference, or `null` if none is found.
 */
async function findLatestConversationImage() {
  const history = Array.isArray(state.conversationHistory) ? [...state.conversationHistory].reverse() : [];
  for (const message of history) {
    const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
    for (let index = attachments.length - 1; index >= 0; index -= 1) {
      const attachment = attachments[index];
      if (!attachment || attachment.type !== "image") {
        continue;
      }
      if (typeof attachment.dataUrl === "string" && attachment.dataUrl.trim()) {
        return attachment.dataUrl.trim();
      }
      if (typeof attachment.url === "string" && attachment.url.trim()) {
        return attachment.url.trim();
      }
      if (attachment.filename) {
        const storedRef = await resolveStoredReference(attachment);
        if (storedRef) {
          return storedRef;
        }
      }
    }
  }
  return null;
}

/**
 * Scans generated media newest-first for the most recent item matching `kind`
 * (`"image"` or `"video"`).
 *
 * @returns A usable media reference, or `null` if none is found.
 */
async function findLatestGeneratedMedia(kind: string): Promise<string | null> {
  const media = Array.isArray(state.generatedImages) ? [...state.generatedImages].reverse() : [];
  for (const item of media) {
    if (!item) {
      continue;
    }
    const mediaType = detectMediaType(item);
    if (mediaType !== kind) {
      continue;
    }
    if (typeof item.url === "string" && item.url.trim()) {
      return item.url.trim();
    }
    if (item.filename) {
      const storedRef = await resolveStoredReference(item);
      if (storedRef) {
        return storedRef;
      }
    }
  }
  return null;
}

/**
 * Resolves a usable reference to the most recent media of `kind`, preferring
 * generated media and falling back to the latest conversation image.
 *
 * @returns The media reference, or `null` if none is available.
 */
export async function resolveLatestMediaReference(kind: string): Promise<string | null> {
  const generated = await findLatestGeneratedMedia(kind);
  if (generated) {
    return generated;
  }
  if (kind === "image") {
    return findLatestConversationImage();
  }
  return null;
}

/**
 * Returns a displayable URL for media `value`: object URLs for blobs (cached by
 * filename), pass-through for URL-like strings, and a data URL for bare base64.
 */
export function getMediaDisplayUrl(value: unknown, filename: string = ""): string {
  if (!value) {
    return "";
  }
  if (value instanceof Blob) {
    const cacheKey = filename || `blob-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (state.imageDataCache?.has(cacheKey)) {
      return state.imageDataCache.get(cacheKey)!;
    }
    const objectUrl = createObjectUrl(value);
    if (state.imageDataCache?.set) {
      state.imageDataCache.set(cacheKey, objectUrl);
    }
    return objectUrl;
  }
  if (typeof value === "string") {
    if (value.startsWith("data:") || value.startsWith("blob:") || /^https?:\/\//i.test(value) || value.startsWith("/")) {
      return value;
    }
    const mimeType = inferMimeTypeFromFilename(filename);
    return `data:${mimeType};base64,${value}`;
  }
  return "";
}

/**
 * Downloads media to the user's device from a blob, data/blob URL, or remote
 * URL, falling back to opening remote URLs in a new tab when fetching is blocked.
 *
 * @throws If no usable source is provided.
 */
export async function downloadMediaSource(source: Blob | string, filename?: string): Promise<void> {
  let blob: Blob | null = null;
  const remoteUrl = typeof source === "string" && /^https?:\/\//i.test(source)
    ? source.trim()
    : "";

  if (source instanceof Blob) {
    blob = source;
  } else if (typeof source === "string" && source.startsWith("data:")) {
    blob = decodeDataUri(source);
  } else if (typeof source === "string" && source.startsWith("blob:")) {
    blob = await fetchBlob(source);
  } else if (remoteUrl) {
    try {
      blob = await fetchBlob(remoteUrl);
    } catch {
      const anchor = document.createElement("a");
      anchor.href = remoteUrl;
      anchor.target = "_blank";
      anchor.rel = "noopener";
      if (filename) {
        anchor.download = filename;
      }
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      return;
    }
  } else if (typeof source === "string" && source.trim()) {
    blob = await fetchBlob(source.trim());
  } else {
    throw new Error("No downloadable media source was provided.");
  }

  if (!blob) {
    throw new Error("No downloadable media source was provided.");
  }
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename || makeFilename("media", blob.type || inferMimeTypeFromFilename(filename));
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 1000);
}

/** Returns the prompt guidance describing implicit "latest image" handling for media tools. */
export function getMediaToolInstructions() {
  return [
    "For Grok image edits, if the user refers to the most recent uploaded or generated image, you may omit image_url or image_urls.",
    "The runtime will automatically supply the latest available local image when an image edit tool is called without an explicit image URL.",
  ].join(" ");
}

/**
 * Normalizes a generated/uploaded media source into a {@link GeneratedImage}
 * record (resolving MIME type, media type, filename, and display URL) and
 * registers it in application state.
 *
 * @returns The created media record.
 */
export function registerGeneratedMedia({
  mediaType,
  sourceData,
  prompt = "",
  tool = "",
  filename,
  mimeType,
  associatedMessageId = null,
  callId = null,
  model = null,
  uploaded = false,
}: RegisterMediaOptions): GeneratedImage {
  const effectiveMimeType = mimeType || (sourceData instanceof Blob
    ? (sourceData.type || inferMimeTypeFromFilename(filename))
    : (typeof sourceData === "string" && sourceData.startsWith("data:")
      ? String(sourceData).slice(5).split(";", 1)[0]
      : inferMimeTypeFromFilename(filename)));
  const effectiveMediaType = mediaType || (isVideoMimeType(effectiveMimeType) ? "video" : "image");
  const effectiveFilename = filename || makeFilename(effectiveMediaType === "video" ? "video" : "generated", effectiveMimeType);
  const timestamp = new Date().toISOString();
  const displayUrl = getMediaDisplayUrl(sourceData, effectiveFilename) || createObjectUrl(sourceData);

  const record: GeneratedImage = {
    url: displayUrl,
    prompt: prompt || "",
    tool: tool || "",
    timestamp,
    filename: effectiveFilename,
    associatedMessageId,
    callId,
    mimeType: effectiveMimeType,
    mediaType: effectiveMediaType,
    model: model || undefined,
    uploaded: Boolean(uploaded),
    isStoredInDb: false,
    pendingStorageData: sourceData,
  };

  state.generatedImages = Array.isArray(state.generatedImages) ? state.generatedImages : [];
  state.currentGeneratedImageHtml = Array.isArray(state.currentGeneratedImageHtml) ? state.currentGeneratedImageHtml : [];
  state.generatedImages.push(record);
  state.currentGeneratedImageHtml.push(buildMediaRecordHtml(record));

  if (state.imageDataCache?.set && displayUrl) {
    state.imageDataCache.set(effectiveFilename, displayUrl);
  }

  saveImageToDb(sourceData, effectiveFilename, {
    prompt: record.prompt,
    tool: record.tool,
    timestamp: record.timestamp,
    associatedMessageId: record.associatedMessageId || "",
    callId: record.callId || "",
    model: record.model || "",
    mimeType: record.mimeType,
    mediaType: record.mediaType,
    uploaded: record.uploaded,
  }).then(() => {
    record.isStoredInDb = true;
    delete record.pendingStorageData;
  }).catch(error => {
    console.error("Failed to save generated media to storage:", error);
  });

  return record;
}

