/**
 * OpenAI gpt-image-2 image generation/edit tool for non-OpenAI providers.
 *
 * @remarks
 * Implements the `openai_generate_image` and `openai_edit_image` client-side
 * tool handlers used when a non-OpenAI service is active (OpenAI itself uses
 * the provider's built-in `image_generation` tool instead): builds the request
 * to the OpenAI images endpoints, parses the response, and registers each
 * produced image via the media helpers in {@link ./mediaTools.ts}. Importing
 * this module registers the handlers on {@link toolImplementations} as a side
 * effect.
 */

import { config } from "../../config/config.ts";
import { getApiKey } from "./apiKeyStorage.ts";
import { isRecord } from "../utils/utils.ts";
import { toolImplementations } from "./toolImplementations.ts";
import { registerGeneratedMedia, resolveLatestMediaReference, makeFilename, decodeDataUri } from "./mediaTools.ts";

interface ParsedImage {
  mimeType: string;
  url: string;
}

const OPENAI_IMAGE_MODEL = "gpt-image-2";

const OPENAI_IMAGE_SIZES = ["1024x1024", "1536x1024", "1024x1536", "auto"];

const OPENAI_IMAGE_QUALITIES = ["low", "medium", "high", "auto"];

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
 * Returns the configured, trailing-slash-trimmed OpenAI base URL.
 *
 * @throws If no base URL is configured for OpenAI.
 */
function getOpenAiBaseUrl(): string {
  const baseUrl = config?.services?.openai?.baseUrl || "";
  if (!baseUrl) {
    throw new Error("Base URL is not configured for openai.");
  }
  return baseUrl.replace(/\/+$/, "");
}

/**
 * Returns the OpenAI API key, preferring stored keys over config.
 *
 * @throws With a user-facing message if no key is configured.
 */
function getOpenAiApiKey(): string {
  const apiKey = getApiKey?.("openai") || config?.services?.openai?.apiKey || "";
  const trimmed = typeof apiKey === "string" ? apiKey.trim() : "";
  if (!trimmed) {
    throw new Error("Add your OpenAI API key in Settings → API Keys.");
  }
  return trimmed;
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

/**
 * Resolves an image reference (data URI, blob URL, or remote URL) into a
 * {@link Blob} suitable for a multipart upload.
 *
 * @throws If the reference cannot be decoded or fetched.
 */
async function referenceToBlob(reference: string): Promise<Blob> {
  if (reference.startsWith("data:")) {
    return decodeDataUri(reference);
  }
  const response = await fetch(reference);
  if (!response.ok) {
    throw new Error(`Could not fetch source image: ${response.status} ${response.statusText}`);
  }
  return response.blob();
}

interface OpenAiImageResult {
  ok: true;
  backend: string;
  mediaType: string;
  count: number;
  filenames: (string | undefined)[];
}

/**
 * Calls the OpenAI gpt-image-2 API to generate or edit images, registers each
 * returned image in application state, and summarizes the result.
 *
 * @param args - Raw tool arguments (prompt, size, quality, n, and for edits
 *   image_url/image_urls).
 * @param mode - `"generate"` for new images or `"edit"` to modify a source
 *   image; edits fall back to the latest available image when none is given.
 * @throws If the prompt is missing, no source image is available for an edit,
 *   or the API returns no images.
 */
async function generateOpenAiImage(args: unknown, mode: string): Promise<OpenAiImageResult> {
  const a = isRecord(args) ? args : {};
  const prompt = normalizePrompt(args);
  const endpoint = mode === "edit" ? "/images/edits" : "/images/generations";
  const apiKey = getOpenAiApiKey();
  const rawN = Number(a.n);
  const n = Number.isFinite(rawN) ? Math.max(1, Math.min(10, rawN)) : 1;
  const size = typeof a.size === "string" && OPENAI_IMAGE_SIZES.includes(a.size) ? a.size : undefined;
  const quality = typeof a.quality === "string" && OPENAI_IMAGE_QUALITIES.includes(a.quality) ? a.quality : undefined;

  let requestBody: BodyInit;
  const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` };

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

    const blobs = await Promise.all(imageUrls.slice(0, 10).map(url => referenceToBlob(url)));
    const formData = new FormData();
    formData.append("model", OPENAI_IMAGE_MODEL);
    formData.append("prompt", prompt);
    formData.append("n", String(n));
    if (size) {
      formData.append("size", size);
    }
    if (quality) {
      formData.append("quality", quality);
    }
    blobs.forEach(blob => {
      formData.append("image[]", blob, makeFilename("source", blob.type || "image/png"));
    });
    requestBody = formData;
  } else {
    headers["Content-Type"] = "application/json";
    const payload: Record<string, unknown> = {
      model: OPENAI_IMAGE_MODEL,
      prompt,
      n,
    };
    if (size) {
      payload.size = size;
    }
    if (quality) {
      payload.quality = quality;
    }
    requestBody = JSON.stringify(payload);
  }

  const response = await fetch(`${getOpenAiBaseUrl()}${endpoint}`, {
    method: "POST",
    headers,
    body: requestBody,
  });
  const parsed = await responseToJson(response);

  const images = parseImageResponse(parsed);
  if (!images.length) {
    throw new Error("The image API did not return any images.");
  }

  const records = images.map(image => registerGeneratedMedia({
    mediaType: "image",
    sourceData: image.url,
    prompt,
    tool: mode === "edit" ? "openai_edit_image" : "openai_generate_image",
    filename: makeFilename(mode === "edit" ? "edited" : "generated", image.mimeType),
    mimeType: image.mimeType,
    model: OPENAI_IMAGE_MODEL,
    callId: isRecord(parsed) && typeof parsed.id === "string" ? parsed.id : null,
  }));

  return {
    ok: true,
    backend: "openai",
    mediaType: "image",
    count: records.length,
    filenames: records.map(record => record.filename),
  };
}

toolImplementations.openai_generate_image = async function(args: unknown) {
  return generateOpenAiImage(args ?? {}, "generate");
};
toolImplementations.openai_edit_image = async function(args: unknown) {
  return generateOpenAiImage(args ?? {}, "edit");
};
