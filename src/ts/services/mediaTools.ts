/**
 * Client-side media generation/display helpers for xAI Grok Imagine images.
 */

import { state } from "../init/state.ts";
import { loadImageFromDb, saveImageToDb } from "../utils/imageStorage.ts";
import { toolImplementations } from "./toolImplementations.ts";
import { getApiKey } from "./apiKeyStorage.ts";
import { config } from "../../config/config.ts";
import { escapeHtml } from "../utils/sanitize.ts";
import { isRecord } from "../utils/utils.ts";
import type { GeneratedImage } from "../../types/common.ts";

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

interface ParsedImage {
  mimeType: string;
  url: string;
}

const XAI_IMAGE_MODEL = "grok-imagine-image";

const XAI_IMAGE_ASPECT_RATIOS = [
  "1:1", "16:9", "9:16", "4:3", "3:4",
  "3:2", "2:3", "2:1", "1:2",
  "19.5:9", "9:19.5", "20:9", "9:20", "auto",
];

/** Reports whether a MIME type is a video type. */
export function isVideoMimeType(mimeType: string = ""): boolean {
  return /^video\//i.test(mimeType);
}

function inferMimeTypeFromFilename(filename: string = ""): string {
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

function makeFilename(prefix: string, mimeType: string): string {
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

function createObjectUrl(value: unknown): string {
  if (value instanceof Blob) {
    return URL.createObjectURL(value);
  }
  if (typeof value === "string") {
    return value;
  }
  return "";
}

async function fetchBlob(url: string, options: RequestInit = {}): Promise<Blob> {
  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`${response.status} ${response.statusText}${text ? `: ${text}` : ""}`);
  }
  return response.blob();
}

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

function parseImageResponse(payload: unknown): ParsedImage[] {
  const data = isRecord(payload) ? payload.data : undefined;
  const candidates = Array.isArray(data) ? data : [];
  return candidates
    .map((item: unknown): ParsedImage | null => {
      if (!isRecord(item)) {
        return null;
      }
      if (typeof item.b64_json === "string" && item.b64_json.trim()) {
        const mimeType = typeof item.mime_type === "string" ? item.mime_type : "image/png";
        return {
          mimeType,
          url: `data:${mimeType};base64,${item.b64_json.trim()}`,
        };
      }
      if (typeof item.url === "string" && item.url.trim()) {
        return {
          mimeType: typeof item.mime_type === "string" ? item.mime_type : "image/png",
          url: item.url.trim(),
        };
      }
      return null;
    })
    .filter((img: ParsedImage | null): img is ParsedImage => img !== null);
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

function getProviderBaseUrl(provider: string): string {
  const baseUrl = config?.services?.[provider]?.baseUrl || "";
  if (!baseUrl) {
    throw new Error(`Base URL is not configured for ${provider}.`);
  }
  return baseUrl.replace(/\/+$/, "");
}

function getProviderApiKey(provider: string): string {
  const apiKey = getApiKey?.(provider) || config?.services?.[provider]?.apiKey || "";
  const trimmed = typeof apiKey === "string" ? apiKey.trim() : "";
  if (!trimmed) {
    const providerLabel = provider === "xai" ? "xAI" : provider === "openai" ? "OpenAI" : provider;
    throw new Error(`Add your ${providerLabel} API key in Settings → API Keys.`);
  }
  return trimmed;
}

function buildHeaders(provider: string): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const apiKey = getProviderApiKey(provider);
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

async function responseToJson(response: Response): Promise<any> {
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`${response.status} ${response.statusText}${text ? `: ${text}` : ""}`);
  }
  return response.json();
}

async function fetchJson(url: string, options: RequestInit = {}): Promise<unknown> {
  const response = await fetch(url, options);
  return responseToJson(response);
}

function normalizePrompt(args: unknown) {
  const raw = isRecord(args) ? args.prompt : undefined;
  const prompt = String(raw ?? "").trim();
  if (!prompt) {
    throw new Error("A prompt is required.");
  }
  return prompt;
}

interface GrokImageResult {
  ok: true;
  backend: string;
  mediaType: string;
  count: number;
  filenames: (string | undefined)[];
}

async function generateGrokImage(args: unknown, mode: string): Promise<GrokImageResult> {
  const a = isRecord(args) ? args : {};
  const prompt = normalizePrompt(args);
  const provider = "xai";
  const endpoint = mode === "edit" ? "/images/edits" : "/images/generations";
  const n = Number(a.n);
  const payload: Record<string, unknown> = {
    model: XAI_IMAGE_MODEL,
    prompt,
    n: Number.isFinite(n) ? Math.max(1, Math.min(10, n)) : 1,
    response_format: "b64_json",
  };

  if (typeof a.aspect_ratio === "string" && XAI_IMAGE_ASPECT_RATIOS.includes(a.aspect_ratio)) {
    payload.aspect_ratio = a.aspect_ratio;
  }
  if (typeof a.resolution === "string" && ["1k", "2k"].includes(a.resolution)) {
    payload.resolution = a.resolution;
  }

  if (mode === "edit") {
    let imageUrls: string[] = Array.isArray(a.image_urls)
      ? a.image_urls.filter((value: unknown): value is string => typeof value === "string" && Boolean(value.trim())).map((value) => value.trim())
      : [];
    if (!imageUrls.length && typeof a.image_url === "string" && a.image_url.trim()) {
      imageUrls = [a.image_url.trim()];
    }
    if (!imageUrls.length) {
      const latestImage = await resolveLatestMediaReference("image");
      if (!latestImage) {
        throw new Error("No source image is available for editing.");
      }
      imageUrls = [latestImage];
    }
    if (imageUrls.length === 1) {
      payload.image = { type: "image_url", url: imageUrls[0] };
    } else {
      payload.images = imageUrls.slice(0, 3).map((url: string) => ({ type: "image_url", url }));
    }
  }

  const response = await fetchJson(`${getProviderBaseUrl(provider)}${endpoint}`, {
    method: "POST",
    headers: buildHeaders(provider),
    body: JSON.stringify(payload),
  });

  const images = parseImageResponse(response);
  if (!images.length) {
    throw new Error("The image API did not return any images.");
  }

  const records = images.map(image => registerGeneratedMedia({
    mediaType: "image",
    sourceData: image.url,
    prompt,
    tool: mode === "edit" ? "grok_edit_image" : "grok_generate_image",
    filename: makeFilename(mode === "edit" ? "edited" : "generated", image.mimeType),
    mimeType: image.mimeType,
    model: XAI_IMAGE_MODEL,
    callId: isRecord(response) && typeof response.id === "string" ? response.id : null,
  }));

  return {
    ok: true,
    backend: "grok",
    mediaType: "image",
    count: records.length,
    filenames: records.map(record => record.filename),
  };
}

toolImplementations.grok_generate_image = async function(args: unknown) {
  return generateGrokImage(args ?? {}, "generate");
};
toolImplementations.grok_edit_image = async function(args: unknown) {
  return generateGrokImage(args ?? {}, "edit");
};
