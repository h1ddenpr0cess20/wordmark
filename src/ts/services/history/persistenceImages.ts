/**
 * Image handling for conversation persistence.
 *
 * @remarks
 * Helpers used by the conversation-save path in {@link ./persistence.ts}:
 * normalizing each generated/uploaded image into a storable record (persisting
 * data URLs/blobs to IndexedDB as needed) and flagging the assistant messages
 * that own images. Kept separate so the save flow stays focused on transcript
 * and metadata.
 */

import { saveImageToDb } from "../../utils/imageStorage.ts";
import { detectMediaType } from "../mediaTools.ts";
import type { Message } from "../../../types/api.ts";
import type { GeneratedImage } from "../../../types/common.ts";

/**
 * Normalizes a generated/uploaded image into a storable record. Already-stored
 * images return their metadata as-is; data-URL or blob-backed images are
 * persisted to IndexedDB (the save promise is pushed onto `savePromises`) and a
 * filename is generated when missing. Returns a fallback record on failure.
 */
export function processImageForStorage(img: GeneratedImage, savePromises: Promise<unknown>[]) {
  const processedImg = { ...img };
  const mediaType = detectMediaType(processedImg);
  const mimeType = processedImg.mimeType
    || (typeof processedImg.url === "string" && processedImg.url.startsWith("data:")
      ? processedImg.url.slice(5).split(";", 1)[0]
      : (mediaType === "video" ? "video/mp4" : "image/png"));

  if (processedImg.isStoredInDb && processedImg.filename) {
    return {
      filename: processedImg.filename,
      prompt: processedImg.prompt || "",
      tool: processedImg.tool || "",
      timestamp: processedImg.timestamp || new Date().toISOString(),
      associatedMessageId: processedImg.associatedMessageId || "",
      isStoredInDb: true,
      mediaType,
      mimeType,
      uploaded: Boolean(processedImg.uploaded),
      callId: processedImg.callId || "",
      model: processedImg.model || "",
    };
  }

  if ((processedImg.url && processedImg.url.startsWith("data:")) || processedImg.pendingStorageData instanceof Blob) {
    try {
      if (!processedImg.filename) {
        const extension = mimeType === "image/jpeg"
          ? "jpg"
          : mimeType === "image/webp"
            ? "webp"
            : mimeType === "video/webm"
              ? "webm"
              : mimeType === "video/quicktime"
                ? "mov"
                : mediaType === "video"
                  ? "mp4"
                  : "png";
        const prefix = mediaType === "video" ? "video" : "image";
        processedImg.filename = `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 10)}.${extension}`;
      }

      const savePayload: Blob | string = processedImg.pendingStorageData instanceof Blob
        ? processedImg.pendingStorageData
        : processedImg.url!;
      const savePromise = saveImageToDb?.(savePayload, processedImg.filename, {
        prompt: processedImg.prompt || "",
        tool: processedImg.tool || "",
        associatedMessageId: processedImg.associatedMessageId || "",
        mediaType,
        mimeType,
        uploaded: Boolean(processedImg.uploaded),
        callId: processedImg.callId || "",
        model: processedImg.model || "",
      }).catch((err) => {
        console.error("Failed to save image to IndexedDB:", err);
        return null;
      });

      if (savePromise) {
        savePromises.push(savePromise);
      }

      return {
        filename: processedImg.filename,
        prompt: processedImg.prompt || "",
        tool: processedImg.tool || "",
        timestamp: processedImg.timestamp || new Date().toISOString(),
        associatedMessageId: processedImg.associatedMessageId || "",
        isStoredInDb: true,
        mediaType,
        mimeType,
        uploaded: Boolean(processedImg.uploaded),
        callId: processedImg.callId || "",
        model: processedImg.model || "",
      };
    } catch (error) {
      console.error("Error processing image for storage:", error);
      return {
        filename: processedImg.filename || `fallback-${Date.now()}.${mediaType === "video" ? "mp4" : "png"}`,
        prompt: processedImg.prompt || "",
        timestamp: new Date().toISOString(),
        imageUnavailable: true,
        error: error instanceof Error ? error.message : "",
        mediaType,
        mimeType,
      };
    }
  }

  return processedImg;
}

/**
 * Returns a copy of the history with assistant messages that own images flagged
 * (`hasImages`), assigning an id to any such message that lacks one.
 */
export function markMessagesWithImages(baseHistory: Message[], processedImages: GeneratedImage[]) {
  return baseHistory.map((msg) => {
    const markedMsg = { ...msg };

    if (markedMsg.role === "assistant") {
      const hasAssociatedImages = processedImages.some((img) => img.associatedMessageId === markedMsg.id);
      if (hasAssociatedImages) {
        markedMsg.hasImages = true;
        if (!markedMsg.id) {
          markedMsg.id = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
        }
      }
    }

    return markedMsg;
  });
}
