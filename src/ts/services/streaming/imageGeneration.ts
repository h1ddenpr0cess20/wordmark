/**
 * Image generation and attachment helpers used during streaming.
 */

import { state } from "../../init/state.ts";
import { registerGeneratedMedia } from "../mediaTools.ts";
import { imagePlaceholder, mediaPlaceholder } from "../../utils/placeholders.ts";
import type { ResponseObject } from "../../../types/api.ts";
import { isRecord, pickString } from "../../utils/utils.ts";
import { extractMimeFromDataUrl, normaliseMimeType, coerceImageDataUrl } from "./imageDataUrl.ts";
import { extractPromptFromImageCall, detectImageCallMode, determineSourceLabel } from "./imageCallParsing.ts";

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
      if (typeof msg.content === "string" && img.filename && (msg.content.includes(imagePlaceholder(img.filename)) || msg.content.includes(mediaPlaceholder(img.filename)))) {
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

/** Logs an `[image-debug]` message to the console when verbose logging is on. */
export function imageDebugLog(...args: unknown[]) {
  if (typeof window !== "undefined" && state.verboseLogging) {
    console.info("[image-debug]", ...args);
  }
}

/**
 * Recursively walks an arbitrary response value, collecting image data URLs into
 * `accumulator`. Uses `seen` to de-duplicate and `visited` to guard against
 * cyclic structures.
 */
export function collectImageCandidates(
  value: unknown,
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
    value.forEach((item: unknown) => collectImageCandidates(item, accumulator, defaultMime, seen, visited));
    return;
  }

  if (typeof value === "string") {
    pushCandidate(value, defaultMime);
    return;
  }

  if (isRecord(value)) {
    const candidateMime = pickString(value, ["mime_type", "media_type", "content_type"]) ?? defaultMime;
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
    rawOutputKeys: outputs.map((item) => item && item.type),
  });

  if (!Array.isArray(state.currentGeneratedImageHtml)) {
    state.currentGeneratedImageHtml = [];
  }
  if (!Array.isArray(state.generatedImages)) {
    state.generatedImages = [];
  }

  const globalSeen = new Set();

  const imageGenerationOutputs = outputs.filter((entry) => {
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
    types: imageGenerationOutputs.map((item) => item.type),
  });

  const candidateEntries = imageGenerationOutputs.length ? imageGenerationOutputs : [];

  candidateEntries.forEach((entry, idx: number) => {
    if (!isRecord(entry)) {
      return;
    }
    const entrySeen = new Set<string>();
    const localVisited = typeof WeakSet !== "undefined" ? new WeakSet() : null;
    const collected: ImageCandidate[] = [];
    const entryType = typeof entry.type === "string" ? entry.type : null;
    const entryMime = pickString(entry, ["mime_type", "media_type"]) ?? undefined;

    imageDebugLog("Inspecting response output entry", {
      index: idx,
      type: entryType,
      keys: Object.keys(entry),
    });

    collectImageCandidates(entry, collected, entryMime, entrySeen, localVisited);
    collectImageCandidates(entry.result, collected, entryMime, entrySeen, localVisited);
    collectImageCandidates(entry.output, collected, entryMime, entrySeen, localVisited);
    collectImageCandidates(entry.images, collected, entryMime, entrySeen, localVisited);

    imageDebugLog("Collected image candidates from entry", {
      index: idx,
      candidateCount: collected.length,
      entryType,
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
    const callId = (typeof entry.id === "string" ? entry.id : null)
      || (typeof responsePayload.id === "string" ? responsePayload.id : null)
      || undefined;

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
