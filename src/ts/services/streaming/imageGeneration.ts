/**
 * Image generation and attachment helpers used during streaming.
 */

import { state } from "../../init/state.ts";
import { registerGeneratedMedia } from "../mediaTools.ts";
import type { ResponseObject } from "../../../types/api.ts";
import { isRecord } from "../../utils/utils.ts";

/** Response output type identifying an image-generation call. */
export const IMAGE_GENERATION_CALL_TYPE = "image_generation_call";

/** A generated image: its data URL and MIME type. */
export interface ImageCandidate {
  dataUrl: string;
  mimeType: string;
}

/**
 * Backfills `messageId` onto generated images that predate per-message tracking
 * by matching them to assistant turns.
 *
 * @returns The number of images updated.
 */
export function ensureImagesHaveMessageIds() {
  if (!state.generatedImages || !state.conversationHistory) {
    return 0;
  }

  let updatedCount = 0;
  const unassociatedImages = state.generatedImages.filter(img => !img.associatedMessageId);

  if (unassociatedImages.length === 0) {
    return 0;
  }

  const assistantMessages = state.conversationHistory
    .filter(msg => msg.role === "assistant" && msg.id)
    .sort((a, b) => {
      const timeA = a.timestamp ? new Date(a.timestamp as string | number).getTime() : 0;
      const timeB = b.timestamp ? new Date(b.timestamp as string | number).getTime() : 0;
      return timeB - timeA;
    });

  unassociatedImages.forEach(img => {
    let associatedMessage = null;

    for (const msg of assistantMessages) {
      if (typeof msg.content === "string" && (msg.content.includes(`[[IMAGE: ${img.filename}]]`) || msg.content.includes(`[[MEDIA: ${img.filename}]]`))) {
        associatedMessage = msg;
        break;
      }
    }

    if (!associatedMessage && assistantMessages.length > 0) {
      if (img.timestamp) {
        let closestMessage = assistantMessages[0];
        let smallestTimeDiff = Infinity;

        for (const msg of assistantMessages) {
          if (!msg.timestamp) {
            continue;
          }
          const timeDiff = Math.abs(
            new Date(msg.timestamp as string | number).getTime() - new Date(img.timestamp as string | number).getTime(),
          );
          if (timeDiff < smallestTimeDiff) {
            smallestTimeDiff = timeDiff;
            closestMessage = msg;
          }
        }
        associatedMessage = closestMessage;
      } else {
        associatedMessage = assistantMessages[0];
      }
    }

    if (associatedMessage) {
      img.associatedMessageId = associatedMessage.id;
      updatedCount += 1;

      if (!associatedMessage.hasImages) {
        associatedMessage.hasImages = true;
      }
    }
  });

  return updatedCount;
}

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

/** Logs an `[image-debug]` message to the console when verbose logging is on. */
export function imageDebugLog(...args: unknown[]) {
  if (typeof window !== "undefined" && state.verboseLogging) {
    console.info("[image-debug]", ...args);
  }
}

function extractMimeFromDataUrl(dataUrl: unknown) {
  if (typeof dataUrl !== "string") {
    return null;
  }
  const match = /^data:([^;]+);/i.exec(dataUrl);
  return match ? match[1].toLowerCase() : null;
}

function normaliseMimeType(mimeType: unknown) {
  if (typeof mimeType === "string" && mimeType.trim()) {
    return mimeType.trim().toLowerCase();
  }
  return "image/png";
}

function coerceImageDataUrl(rawValue: unknown, mimeTypeHint: unknown) {
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

/**
 * Recursively walks an arbitrary response value, collecting image data URLs into
 * `accumulator`. Uses `seen` to de-duplicate and `visited` to guard against
 * cyclic structures.
 */
export function collectImageCandidates(
  value: any,
  accumulator: ImageCandidate[],
  defaultMime: string | undefined,
  seen: Set<string>,
  visited: WeakSet<object> | null,
) {
  if (value === null || value === undefined) {
    return;
  }

  if (typeof value === "object" && value !== null) {
    if (visited) {
      try {
        if (visited.has(value)) {
          return;
        }
        visited.add(value);
      } catch {
        /* ignore WeakSet errors */
      }
    }
  }

  const pushCandidate = (candidate: unknown, mimeType: string | undefined) => {
    const dataUrl = coerceImageDataUrl(candidate, mimeType || defaultMime);
    if (!dataUrl) {
      return;
    }
    if (seen.has(dataUrl)) {
      return;
    }
    seen.add(dataUrl);
    accumulator.push({
      dataUrl,
      mimeType: extractMimeFromDataUrl(dataUrl) || mimeType || defaultMime || "image/png",
    });
  };

  if (Array.isArray(value)) {
    value.forEach(item => collectImageCandidates(item, accumulator, defaultMime, seen, visited));
    return;
  }

  if (typeof value === "string") {
    pushCandidate(value, defaultMime);
    return;
  }

  if (typeof value === "object") {
    const candidateMime = value.mime_type || value.media_type || value.content_type || defaultMime;
    const candidateKeys = [
      "b64_json",
      "base64",
      "image_base64",
      "data",
      "image",
      "result",
      "content",
      "image_base64_json",
      "image_url",
      "data_url",
      "image_data",
      "image_base64_data",
    ];

    candidateKeys.forEach(key => {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        return;
      }
      const candidateValue = value[key];
      if (typeof candidateValue === "string") {
        pushCandidate(candidateValue, candidateMime);
      } else if (candidateValue && typeof candidateValue === "object") {
        collectImageCandidates(candidateValue, accumulator, candidateMime, seen, visited);
      }
    });

    if (typeof value.url === "string") {
      pushCandidate(value.url, candidateMime);
    } else if (value.url && typeof value.url === "object") {
      collectImageCandidates(value.url, accumulator, candidateMime, seen, visited);
    }

    Object.keys(value).forEach(key => {
      if (candidateKeys.includes(key) || key === "url") {
        return;
      }
      collectImageCandidates(value[key], accumulator, candidateMime, seen, visited);
    });
  }
}

function extractPromptFromImageCall(call: unknown) {
  if (!isRecord(call)) {
    return "";
  }
  if (typeof call.revised_prompt === "string" && call.revised_prompt.trim()) {
    return call.revised_prompt.trim();
  }
  if (typeof call.prompt === "string" && call.prompt.trim()) {
    return call.prompt.trim();
  }
  let argumentsSource: unknown = call.arguments;
  if (typeof argumentsSource === "string") {
    try {
      argumentsSource = JSON.parse(argumentsSource);
    } catch {
      argumentsSource = null;
    }
  }
  if (isRecord(argumentsSource)) {
    if (typeof argumentsSource.prompt === "string" && argumentsSource.prompt.trim()) {
      return argumentsSource.prompt.trim();
    }
    if (typeof argumentsSource.input === "string" && argumentsSource.input.trim()) {
      return argumentsSource.input.trim();
    }
    if (typeof argumentsSource.description === "string" && argumentsSource.description.trim()) {
      return argumentsSource.description.trim();
    }
  }
  if (isRecord(call.metadata)) {
    const metadata = call.metadata;
    const keys = ["prompt", "description", "request"];
    for (const key of keys) {
      const value = metadata[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
  }
  return "";
}

function detectImageCallMode(call: unknown) {
  const record = isRecord(call) ? call : undefined;
  const metadata = record && isRecord(record.metadata) ? record.metadata : undefined;
  const candidates: unknown[] = [
    record?.mode,
    metadata?.mode,
  ];
  const args = record?.arguments;
  if (isRecord(args)) {
    if (typeof args.mode === "string") {
      candidates.push(args.mode);
    }
    if (typeof args.purpose === "string") {
      candidates.push(args.purpose);
    }
  }
  if (typeof args === "string") {
    try {
      const parsed: unknown = JSON.parse(args);
      if (isRecord(parsed) && typeof parsed.mode === "string") {
        candidates.push(parsed.mode);
      }
    } catch {
      /* ignore parse */
    }
  }
  const found = candidates.find(value => typeof value === "string" && value.trim());
  return typeof found === "string" ? found.trim().toLowerCase() : "";
}

function determineSourceLabel(node: unknown, mode: string) {
  if (mode) {
    if (mode.includes("edit")) {
      return "image_edit";
    }
    if (mode.includes("variation")) {
      return "image_variation";
    }
  }
  if (isRecord(node) && typeof node.type === "string") {
    const lowered = node.type.toLowerCase();
    if (lowered.includes("edit")) {
      return "image_edit";
    }
    if (lowered.includes("variation")) {
      return "image_variation";
    }
  }
  return "image_generation";
}

/**
 * Extracts generated images from a response payload and registers each as
 * generated media so it renders and persists. No-op for an invalid payload.
 */
export function processImageGenerationOutputs(responsePayload: ResponseObject | null) {
  if (!responsePayload || typeof responsePayload !== "object") {
    imageDebugLog("Skipping image extraction: response payload missing or invalid.");
    return;
  }

  const outputs = Array.isArray(responsePayload.output) ? responsePayload.output : [];
  imageDebugLog("Scanning response payload for image calls.", {
    outputLength: outputs.length,
    rawOutputKeys: outputs.map((item: any) => item && item.type),
  });

  if (!Array.isArray(state.currentGeneratedImageHtml)) {
    state.currentGeneratedImageHtml = [];
  }
  if (!Array.isArray(state.generatedImages)) {
    state.generatedImages = [];
  }

  const globalSeen = new Set();

  const imageGenerationOutputs = outputs.filter((entry: any) => {
    if (!entry || typeof entry !== "object") {
      return false;
    }
    const entryType = entry.type || "";
    return entryType === IMAGE_GENERATION_CALL_TYPE ||
           entryType === "image_generation" ||
           entryType === "image_edit" ||
           entryType === "image_variation";
  });

  imageDebugLog("Filtered to image generation outputs only.", {
    totalOutputs: outputs.length,
    imageGenerationOutputs: imageGenerationOutputs.length,
    types: imageGenerationOutputs.map((item: any) => item.type),
  });

  const candidateEntries = imageGenerationOutputs.length ? imageGenerationOutputs : [];

  candidateEntries.forEach((entry: any, idx: number) => {
    if (!entry || typeof entry !== "object") {
      return;
    }
    const entrySeen = new Set<string>();
    const localVisited = typeof WeakSet !== "undefined" ? new WeakSet() : null;
    const collected: ImageCandidate[] = [];

    imageDebugLog("Inspecting response output entry", {
      index: idx,
      type: entry.type || null,
      keys: Object.keys(entry || {}),
    });

    collectImageCandidates(entry, collected, entry.mime_type || entry.media_type, entrySeen, localVisited);
    collectImageCandidates(entry.result, collected, entry.mime_type || entry.media_type, entrySeen, localVisited);
    collectImageCandidates(entry.output, collected, entry.mime_type || entry.media_type, entrySeen, localVisited);
    collectImageCandidates(entry.images, collected, entry.mime_type || entry.media_type, entrySeen, localVisited);

    imageDebugLog("Collected image candidates from entry", {
      index: idx,
      candidateCount: collected.length,
      entryType: entry.type,
    });

    imageDebugLog("Collected image candidates", {
      index: idx,
      candidateCount: collected.length,
      candidatesPreview: collected.map((candidate, candidateIdx) => ({
        index: candidateIdx,
        mimeType: candidate.mimeType,
        prefix: typeof candidate.dataUrl === "string" ? candidate.dataUrl.substring(0, 32) : null,
      })),
    });

    if (!collected.length) {
      return;
    }

    const prompt = extractPromptFromImageCall(entry) || extractPromptFromImageCall(responsePayload);
    const mode = detectImageCallMode(entry) || detectImageCallMode(responsePayload);
    const sourceLabel = determineSourceLabel(entry, mode);
    const callId = entry.id || responsePayload.id || undefined;

    collected.forEach((image, index) => {
      if (globalSeen.has(image.dataUrl)) {
        return;
      }
      globalSeen.add(image.dataUrl);

      const mimeType = normaliseMimeType(image.mimeType);
      const extension = mimeType === "image/jpeg" || mimeType === "image/jpg"
        ? "jpg"
        : (mimeType === "image/webp" ? "webp" : "png");
      const randomChunk = Math.random().toString(36).substring(2, 10);
      const filenameBase = sourceLabel === "image_edit" ? "edited" : "generated";
      const filename = `${filenameBase}-${Date.now()}-${randomChunk}-${index + 1}.${extension}`;
      registerGeneratedMedia({
        mediaType: "image",
        sourceData: image.dataUrl,
        prompt: prompt || "",
        tool: sourceLabel,
        filename,
        mimeType,
        callId,
        model: responsePayload.model || undefined,
      });
    });
  });

  imageDebugLog("currentGeneratedImageHtml snapshot", state.currentGeneratedImageHtml);
  imageDebugLog("generatedImages snapshot count", Array.isArray(state.generatedImages) ? state.generatedImages.length : 0);
}
