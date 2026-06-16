/**
 * xAI Grok Imagine image generation/edit tool.
 *
 * @remarks
 * Implements the `grok_generate_image` and `grok_edit_image` client-side tool
 * handlers: builds the request to the xAI images endpoints, parses the
 * response, and registers each produced image via the media helpers in
 * {@link ./mediaTools.ts}. Importing this module registers the handlers on
 * {@link toolImplementations} as a side effect.
 */

import { config } from "../../config/config.ts";
import { getApiKey } from "./apiKeyStorage.ts";
import { isRecord } from "../utils/utils.ts";
import { toolImplementations } from "./toolImplementations.ts";
import { registerGeneratedMedia, resolveLatestMediaReference, makeFilename } from "./mediaTools.ts";

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

/**
 * Parses an image API response into {@link ParsedImage} entries, accepting both
 * base64 (`b64_json`) and URL-based items and skipping anything unusable.
 */
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
 * Returns the configured, trailing-slash-trimmed base URL for `provider`.
 *
 * @throws If no base URL is configured for the provider.
 */
function getProviderBaseUrl(provider: string): string {
  const baseUrl = config?.services?.[provider]?.baseUrl || "";
  if (!baseUrl) {
    throw new Error(`Base URL is not configured for ${provider}.`);
  }
  return baseUrl.replace(/\/+$/, "");
}

/**
 * Returns the API key for `provider`, preferring stored keys over config.
 *
 * @throws With a user-facing message if no key is configured.
 */
function getProviderApiKey(provider: string): string {
  const apiKey = getApiKey?.(provider) || config?.services?.[provider]?.apiKey || "";
  const trimmed = typeof apiKey === "string" ? apiKey.trim() : "";
  if (!trimmed) {
    const providerLabel = provider === "xai" ? "xAI" : provider === "openai" ? "OpenAI" : provider;
    throw new Error(`Add your ${providerLabel} API key in Settings → API Keys.`);
  }
  return trimmed;
}

/** Builds JSON request headers for `provider`, including its bearer authorization. */
function buildHeaders(provider: string): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const apiKey = getProviderApiKey(provider);
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

/**
 * Parses a response body as JSON.
 *
 * @throws With the status and body text when the response is not ok.
 */
async function responseToJson(response: Response): Promise<unknown> {
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`${response.status} ${response.statusText}${text ? `: ${text}` : ""}`);
  }
  return response.json();
}

/** Fetches `url` and returns the parsed JSON body (throwing on a non-ok status). */
async function fetchJson(url: string, options: RequestInit = {}): Promise<unknown> {
  const response = await fetch(url, options);
  return responseToJson(response);
}

/**
 * Extracts and trims the `prompt` field from raw tool arguments.
 *
 * @throws If the prompt is missing or empty.
 */
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

/**
 * Calls the xAI Grok Imagine image API to generate or edit images, registers
 * each returned image in application state, and summarizes the result.
 *
 * @param args - Raw tool arguments (prompt, aspect_ratio, resolution, n, and
 *   for edits image_url/image_urls).
 * @param mode - `"generate"` for new images or `"edit"` to modify a source
 *   image; edits fall back to the latest available image when none is given.
 * @throws If the prompt is missing, no source image is available for an edit,
 *   or the API returns no images.
 */
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
