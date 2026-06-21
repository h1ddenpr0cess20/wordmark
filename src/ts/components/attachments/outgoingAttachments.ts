/**
 * Outgoing attachment assembly for message send.
 *
 * @remarks
 * Turns the pending image/document uploads into the markup, placeholder tokens,
 * and history attachment records consumed by {@link ../interaction.ts}'s
 * `sendMessage`. As a side effect it stamps each upload with a generated
 * filename/timestamp and primes `state.imageDataCache`, matching the inline
 * behavior it replaced.
 */

import { state } from "../../init/state.ts";
import { imagePlaceholder } from "../../utils/placeholders.ts";
import { formatFileSize } from "../../utils/utils.ts";
import { escapeHtml } from "../../utils/sanitize.ts";
import type { Attachment } from "../../../types/api.ts";
import type { PendingDocument, PendingUpload } from "../../../types/attachments.ts";

/** The assembled pieces needed to render and record an outgoing message's attachments. */
export interface OutgoingAttachments {
  /** HTML for the uploaded-image thumbnails. */
  uploadHtml: string;
  /** HTML for the attached-document chips. */
  documentsHtml: string;
  /** `[[IMAGE: ...]]` placeholder tokens for the persisted history content. */
  placeholders: string[];
  /** Attachment records to store on the user message in conversation history. */
  attachmentsForHistory: Attachment[];
}

/**
 * Builds the markup, placeholders, and history records for the pending uploads
 * and documents about to be sent.
 *
 * @param uploads - Pending image uploads; each is stamped with a generated
 * `filename`/`timestamp` and cached in `state.imageDataCache`.
 * @param documents - Pending document/directory uploads.
 * @returns The assembled {@link OutgoingAttachments}.
 */
export function buildOutgoingAttachments(uploads: PendingUpload[], documents: PendingDocument[]): OutgoingAttachments {
  let uploadHtml = "";
  const placeholders: string[] = [];
  const attachmentsForHistory: Attachment[] = [];

  uploads.forEach(up => {
    const ext = up.file && up.file.name.includes(".") ? up.file.name.split(".").pop() : "png";
    const filename = `upload-${Date.now()}-${Math.random().toString(36).substring(2,8)}.${ext}`;
    up.filename = filename;
    up.timestamp = new Date().toISOString();
    uploadHtml += `<img src="${up.dataUrl}" alt="Uploaded Image" class="generated-image-thumbnail" data-filename="${filename}" data-timestamp="${up.timestamp}" />`;
    placeholders.push(imagePlaceholder(filename));
    const mimeType = (up.file && up.file.type) || (typeof up.dataUrl === "string" && up.dataUrl.startsWith("data:")
      ? up.dataUrl.split(";")[0].replace("data:", "")
      : "image/png");
    attachmentsForHistory.push({
      type: "image",
      filename,
      mimeType,
      mediaType: "image",
      dataUrl: up.dataUrl,
      source: "upload",
      uploaded: true,
      timestamp: up.timestamp,
    });
    if (state.imageDataCache && typeof state.imageDataCache.set === "function" && filename && up.dataUrl) {
      state.imageDataCache.set(filename, up.dataUrl);
    }
  });

  let documentsHtml = "";

  documents.forEach(doc => {
    const icon = doc.isDirectory ? "📁" : "📄";

    if (doc.isDirectory) {
      const directoryFiles = doc.files || [];
      const totalSize = directoryFiles.reduce((sum, f) => sum + f.size, 0);
      const directoryMarkup = [
        "<div class=\"attached-document\">",
        `<span class="doc-icon">${icon}</span>`,
        `<span class="doc-name">${escapeHtml(doc.directoryName)}</span>`,
        `<span class="doc-size">${directoryFiles.length} file${directoryFiles.length !== 1 ? "s" : ""} (${formatFileSize(totalSize)})</span>`,
        "</div>",
      ].join("\n");
      documentsHtml += directoryMarkup;
      directoryFiles.forEach(file => {
        attachmentsForHistory.push({
          type: "document",
          filename: file.name,
          mimeType: file.type,
          size: file.size,
          source: "upload",
          uploaded: true,
          timestamp: new Date().toISOString(),
          directory: doc.directoryName,
        });
      });
    } else {
      const fileMarkup = [
        "<div class=\"attached-document\">",
        `<span class="doc-icon">${icon}</span>`,
        `<span class="doc-name">${escapeHtml(doc.name)}</span>`,
        `<span class="doc-size">${formatFileSize(doc.size || 0)}</span>`,
        "</div>",
      ].join("\n");
      documentsHtml += fileMarkup;
      attachmentsForHistory.push({
        type: "document",
        filename: doc.name,
        mimeType: doc.type,
        size: doc.size,
        source: "upload",
        uploaded: true,
        timestamp: new Date().toISOString(),
      });
    }
  });

  return { uploadHtml, documentsHtml, placeholders, attachmentsForHistory };
}
