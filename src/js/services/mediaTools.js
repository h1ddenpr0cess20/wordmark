/**
 * Client-side media generation/display helpers for xAI Grok Imagine images.
 */

import { state } from "../init/state.js";
import { loadImageFromDb, saveImageToDb } from "../utils/imageStorage.js";
import { toolImplementations } from "./toolImplementations.js";
import { getApiKey } from "./apiKeys.js";

const XAI_IMAGE_MODEL = "grok-imagine-image";

const XAI_IMAGE_ASPECT_RATIOS = [
  "1:1", "16:9", "9:16", "4:3", "3:4",
  "3:2", "2:3", "2:1", "1:2",
  "19.5:9", "9:19.5", "20:9", "9:20", "auto",
];

function escapeHtmlAttribute(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function isVideoMimeType(mimeType = "") {
  return /^video\//i.test(mimeType);
}

function inferMimeTypeFromFilename(filename = "") {
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

export function detectMediaType(source = {}) {
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

function makeFilename(prefix, mimeType) {
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

export function buildMediaRecordHtml(record) {
  const mediaType = detectMediaType(record);
  const safeFilename = escapeHtmlAttribute(record.filename || "");
  const safePrompt = escapeHtmlAttribute(record.prompt || "");
  const safeTimestamp = escapeHtmlAttribute(record.timestamp || "");
  const safeAlt = escapeHtmlAttribute(record.prompt || (mediaType === "video" ? "Generated video" : "Generated image"));
  const src = escapeHtmlAttribute(record.url || "");

  if (mediaType === "video") {
    return `<video src="${src}" class="generated-video-thumbnail" data-media-type="video" data-filename="${safeFilename}" data-prompt="${safePrompt}" data-timestamp="${safeTimestamp}" controls playsinline preload="metadata"></video>`;
  }

  return `<img src="${src}" alt="${safeAlt}" class="generated-image-thumbnail" data-media-type="image" data-filename="${safeFilename}" data-prompt="${safePrompt}" data-timestamp="${safeTimestamp}" />`;
}

function createObjectUrl(value) {
  if (value instanceof Blob) {
    return URL.createObjectURL(value);
  }
  if (typeof value === "string") {
    return value;
  }
  return "";
}

async function fetchBlob(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`${response.status} ${response.statusText}${text ? `: ${text}` : ""}`);
  }
  return response.blob();
}

function decodeDataUri(reference) {
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

async function resolveStoredReference(record) {
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

async function findLatestGeneratedMedia(kind) {
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

export async function resolveLatestMediaReference(kind) {
  const generated = await findLatestGeneratedMedia(kind);
  if (generated) {
    return generated;
  }
  if (kind === "image") {
    return findLatestConversationImage();
  }
  return null;
}

function parseImageResponse(payload) {
  const candidates = Array.isArray(payload?.data) ? payload.data : [];
  return candidates
    .map(item => {
      if (!item || typeof item !== "object") {
        return null;
      }
      if (typeof item.b64_json === "string" && item.b64_json.trim()) {
        const mimeType = item.mime_type || "image/png";
        return {
          mimeType,
          url: `data:${mimeType};base64,${item.b64_json.trim()}`,
        };
      }
      if (typeof item.url === "string" && item.url.trim()) {
        return {
          mimeType: item.mime_type || "image/png",
          url: item.url.trim(),
        };
      }
      return null;
    })
    .filter(Boolean);
}

export function getMediaDisplayUrl(value, filename = "") {
  if (!value) {
    return "";
  }
  if (value instanceof Blob) {
    const cacheKey = filename || `blob-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (state.imageDataCache?.has(cacheKey)) {
      return state.imageDataCache.get(cacheKey);
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

export async function downloadMediaSource(source, filename) {
  let blob = null;
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

export function getMediaToolInstructions() {
  return [
    "For Grok image edits, if the user refers to the most recent uploaded or generated image, you may omit image_url or image_urls.",
    "The runtime will automatically supply the latest available local image when an image edit tool is called without an explicit image URL.",
  ].join(" ");
}

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
}) {
  const effectiveMimeType = mimeType || (sourceData instanceof Blob
    ? (sourceData.type || inferMimeTypeFromFilename(filename))
    : (typeof sourceData === "string" && sourceData.startsWith("data:")
      ? String(sourceData).slice(5).split(";", 1)[0]
      : inferMimeTypeFromFilename(filename)));
  const effectiveMediaType = mediaType || (isVideoMimeType(effectiveMimeType) ? "video" : "image");
  const effectiveFilename = filename || makeFilename(effectiveMediaType === "video" ? "video" : "generated", effectiveMimeType);
  const timestamp = new Date().toISOString();
  const displayUrl = getMediaDisplayUrl(sourceData, effectiveFilename) || createObjectUrl(sourceData);

  const record = {
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

function getProviderBaseUrl(provider) {
  const baseUrl = window.config?.services?.[provider]?.baseUrl || "";
  if (!baseUrl) {
    throw new Error(`Base URL is not configured for ${provider}.`);
  }
  return baseUrl.replace(/\/+$/, "");
}

function getProviderApiKey(provider) {
  const apiKey = getApiKey?.(provider) || window.config?.services?.[provider]?.apiKey || "";
  const trimmed = typeof apiKey === "string" ? apiKey.trim() : "";
  if (!trimmed) {
    const providerLabel = provider === "xai" ? "xAI" : provider === "openai" ? "OpenAI" : provider;
    throw new Error(`Add your ${providerLabel} API key in Settings → API Keys.`);
  }
  return trimmed;
}

function buildHeaders(provider) {
  const headers = { "Content-Type": "application/json" };
  const apiKey = getProviderApiKey(provider);
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

async function responseToJson(response) {
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`${response.status} ${response.statusText}${text ? `: ${text}` : ""}`);
  }
  return response.json();
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  return responseToJson(response);
}

function normalizePrompt(args = {}) {
  const prompt = String(args.prompt || "").trim();
  if (!prompt) {
    throw new Error("A prompt is required.");
  }
  return prompt;
}

async function generateGrokImage(args, mode) {
  const prompt = normalizePrompt(args);
  const provider = "xai";
  const endpoint = mode === "edit" ? "/images/edits" : "/images/generations";
  const payload = {
    model: XAI_IMAGE_MODEL,
    prompt,
    n: Number.isFinite(Number(args.n)) ? Math.max(1, Math.min(10, Number(args.n))) : 1,
    response_format: "b64_json",
  };

  if (typeof args.aspect_ratio === "string" && XAI_IMAGE_ASPECT_RATIOS.includes(args.aspect_ratio)) {
    payload.aspect_ratio = args.aspect_ratio;
  }
  if (typeof args.resolution === "string" && ["1k", "2k"].includes(args.resolution)) {
    payload.resolution = args.resolution;
  }

  if (mode === "edit") {
    let imageUrls = Array.isArray(args.image_urls)
      ? args.image_urls.filter(value => typeof value === "string" && value.trim()).map(value => value.trim())
      : [];
    if (!imageUrls.length && typeof args.image_url === "string" && args.image_url.trim()) {
      imageUrls = [args.image_url.trim()];
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
      payload.images = imageUrls.slice(0, 3).map(url => ({ type: "image_url", url }));
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
    callId: response.id || null,
  }));

  return {
    ok: true,
    backend: "grok",
    mediaType: "image",
    count: records.length,
    filenames: records.map(record => record.filename),
  };
}

toolImplementations.grok_generate_image = async function(args) {
  return generateGrokImage(args || {}, "generate");
};
toolImplementations.grok_edit_image = async function(args) {
  return generateGrokImage(args || {}, "edit");
};
