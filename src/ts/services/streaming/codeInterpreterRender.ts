/**
 * DOM rendering and file-download helpers for Code Interpreter outputs.
 *
 * @remarks
 * Consumes the {@link CodeInterpreterOutputs} produced by
 * {@link ./codeInterpreter.ts} and renders the attachment list into a message
 * element, lazily hydrating each file's metadata and wiring up downloads. The
 * extraction logic lives separately so it stays free of DOM and network
 * concerns.
 */

import { icon } from "../../utils/icons.ts";
import { showError } from "../../utils/notifications.ts";
import {
  ensureApiKey,
  getBaseUrl,
} from "../api/clientConfig.ts";
import { isRecord, pickString } from "../../utils/utils.ts";
import type { CodeAttachment, CodeInterpreterOutputs } from "./codeInterpreter.ts";

const FILE_METADATA_CACHE = new Map<string, unknown>();
const FILE_METADATA_PROMISES = new Map<string, Promise<unknown>>();

/**
 * Returns the `.code-interpreter-outputs` section inside the content wrapper,
 * creating it (with its heading) on first use.
 *
 * @returns The section element, or `null` if no wrapper was given.
 */
function ensureSection(contentWrapper: HTMLElement | null) {
  if (!contentWrapper) {
    return null;
  }
  let section = contentWrapper.querySelector<HTMLElement>(".code-interpreter-outputs");
  if (!section) {
    section = document.createElement("div");
    section.className = "code-interpreter-outputs";
    const heading = document.createElement("div");
    heading.className = "code-interpreter-title";
    heading.textContent = "Code Interpreter Files";
    section.appendChild(heading);
    contentWrapper.appendChild(section);
  }
  return section;
}

/** Picks a display filename for an attachment: its name, else file id, else a positional default. */
function fallbackFilename(attachment: CodeAttachment, index: number | null) {
  if (attachment && attachment.filename) {
    return attachment.filename;
  }
  if (attachment && attachment.fileId) {
    return attachment.fileId;
  }
  return `code-output-${typeof index === "number" ? index + 1 : 1}`;
}

/** Formats a byte count as a human-readable size (B/KB/MB/GB/TB), or `null` if not a valid number. */
function formatBytes(bytes: unknown) {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) {
    return null;
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

/** Builds the metadata line for an attachment (MIME type, size, and file id joined by bullets). */
function describeAttachment(attachment: CodeAttachment) {
  const parts: string[] = [];
  if (attachment.mimeType) {
    parts.push(attachment.mimeType);
  }
  const size = formatBytes(attachment.bytes);
  if (size) {
    parts.push(size);
  }
  if (attachment.fileId) {
    parts.push(attachment.fileId);
  }
  return parts.join(" • ");
}

/** Extracts a filename from a `Content-Disposition` header, or `null` if none is present. */
function parseContentDispositionFilename(header: string | null) {
  if (typeof header !== "string") {
    return null;
  }
  const filenameMatch = /filename\*=UTF-8''([^;]+)|filename=\"?([^\";]+)\"?/i.exec(header);
  if (filenameMatch) {
    return decodeURIComponent(filenameMatch[1] || filenameMatch[2] || "").trim();
  }
  return null;
}

/** Returns a file extension (incl. leading dot) for a known MIME type, or `""` if unrecognized. */
function guessExtension(mimeType: unknown) {
  if (typeof mimeType !== "string") {
    return "";
  }
  const lower = mimeType.toLowerCase();
  if (lower.includes("png")) return ".png";
  if (lower.includes("jpeg") || lower.includes("jpg")) return ".jpg";
  if (lower.includes("gif")) return ".gif";
  if (lower.includes("svg")) return ".svg";
  if (lower.includes("json")) return ".json";
  if (lower.includes("csv")) return ".csv";
  if (lower.includes("html")) return ".html";
  if (lower.includes("plain")) return ".txt";
  if (lower.includes("pdf")) return ".pdf";
  if (lower.includes("zip")) return ".zip";
  return "";
}

/**
 * Fetches and caches a provider file's metadata by id, de-duplicating concurrent
 * requests via an in-flight promise map.
 *
 * @throws If the metadata request fails.
 */
async function fetchFileMetadata(fileId: string) {
  if (FILE_METADATA_CACHE.has(fileId)) {
    return FILE_METADATA_CACHE.get(fileId);
  }
  if (FILE_METADATA_PROMISES.has(fileId)) {
    return FILE_METADATA_PROMISES.get(fileId);
  }
  const apiKey = ensureApiKey();
  const baseUrl = getBaseUrl();
  const url = `${baseUrl}/files/${fileId}`;
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  const promise = fetch(url, {
    method: "GET",
    headers,
  }).then(async response => {
    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(errorText || `Failed to fetch metadata for ${fileId}`);
    }
    const json = await response.json();
    FILE_METADATA_CACHE.set(fileId, json);
    FILE_METADATA_PROMISES.delete(fileId);
    return json;
  }).catch(error => {
    FILE_METADATA_PROMISES.delete(fileId);
    throw error;
  });
  FILE_METADATA_PROMISES.set(fileId, promise);
  return promise;
}

/**
 * Fills in an attachment's metadata by fetching it from the provider.
 *
 * @remarks
 * Container files are skipped: they already carry metadata from their
 * annotations and are marked ready immediately.
 */
async function hydrateAttachment(attachment: CodeAttachment | null) {
  if (!attachment || !attachment.fileId) {
    return attachment;
  }

  if (attachment.containerId) {
    attachment.status = "ready";
    return attachment;
  }

  try {
    const metadata = await fetchFileMetadata(attachment.fileId);
    if (isRecord(metadata)) {
      if (!attachment.filename) {
        attachment.filename = pickString(metadata, ["filename", "name"]);
      }
      if (!attachment.mimeType) {
        attachment.mimeType = pickString(metadata, ["mime_type", "content_type"]);
      }
      if (attachment.bytes == null && typeof metadata.bytes === "number") {
        attachment.bytes = metadata.bytes;
      }
    }
    attachment.status = "ready";
  } catch (error) {
    attachment.status = "error";
    attachment.error = (error instanceof Error ? error.message : "") || "Failed to load metadata";
    throw error;
  }
  return attachment;
}

/**
 * Builds the DOM row for a single attachment (name, metadata, download button).
 *
 * @returns The row element plus its child elements and an `update()` that
 *   re-renders the row from the attachment's current state.
 */
function buildFileRow(attachment: CodeAttachment) {
  const row = document.createElement("div");
  row.className = "code-interpreter-file";

  const info = document.createElement("div");
  info.className = "code-interpreter-file-info";

  const nameEl = document.createElement("div");
  nameEl.className = "code-interpreter-file-name";
  nameEl.textContent = fallbackFilename(attachment, attachment.index);
  nameEl.title = attachment.fileId || "";

  const metaEl = document.createElement("div");
  metaEl.className = "code-interpreter-file-meta";
  metaEl.textContent = describeAttachment(attachment);

  info.appendChild(nameEl);
  info.appendChild(metaEl);
  row.appendChild(info);

  const actions = document.createElement("div");
  actions.className = "code-interpreter-file-actions";

  const downloadButton = document.createElement("button");
  downloadButton.type = "button";
  downloadButton.className = "code-interpreter-download-btn";
  downloadButton.setAttribute("data-file-id", attachment.fileId || "");
  downloadButton.setAttribute("aria-label", "Download file");
  downloadButton.innerHTML = `${icon("download", { width: 14, height: 14, className: "code-interpreter-download-icon" })}<span>Download</span>`;

  actions.appendChild(downloadButton);
  row.appendChild(actions);

  return {
    row,
    nameEl,
    metaEl,
    downloadButton,
    update() {
      nameEl.textContent = fallbackFilename(attachment, attachment.index);
      nameEl.title = attachment.fileId || nameEl.textContent;
      metaEl.textContent = attachment.status === "error"
        ? (attachment.error || "Unable to fetch metadata")
        : describeAttachment(attachment);
      if (attachment.status === "error") {
        row.classList.add("code-interpreter-file-error");
      } else {
        row.classList.remove("code-interpreter-file-error");
      }
      downloadButton.disabled = false;
    },
  };
}

/**
 * Downloads an attachment's content from the provider (container or file
 * endpoint) and triggers a browser save, inferring a filename and extension.
 *
 * @throws If the attachment lacks a file id or the download request fails.
 */
async function downloadFileContent(attachment: CodeAttachment | null) {
  if (!attachment || !attachment.fileId) {
    throw new Error("Missing file identifier for download.");
  }
  const apiKey = ensureApiKey();
  const baseUrl = getBaseUrl();

  const url = attachment.containerId
    ? `${baseUrl}/containers/${attachment.containerId}/files/${attachment.fileId}/content`
    : `${baseUrl}/files/${attachment.fileId}/content`;

  const headers: Record<string, string> = {};
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  const response = await fetch(url, {
    method: "GET",
    headers,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => response.statusText);
    throw new Error(text || `Failed to download ${attachment.fileId}`);
  }
  const blob = await response.blob();
  let filename = attachment.filename ||
    parseContentDispositionFilename(response.headers.get("content-disposition")) ||
    attachment.fileId ||
    "download";
  if (!/\.[a-z0-9]+$/i.test(filename)) {
    const inferred = guessExtension(attachment.mimeType || blob.type);
    if (inferred) {
      filename += inferred;
    }
  }
  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = blobUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => {
    URL.revokeObjectURL(blobUrl);
  }, 2000);
}

/**
 * Renders extracted code-interpreter outputs (attachments and logs) into a
 * message element. No-op when the element or outputs are missing.
 */
export function renderCodeInterpreterOutputs(messageElement: HTMLElement | null, outputs: CodeInterpreterOutputs | null) {
  if (!messageElement) {
    return;
  }
  const contentWrapper = messageElement.querySelector<HTMLElement>(".message-content");
  if (!contentWrapper) {
    return;
  }
  const attachments = outputs && Array.isArray(outputs.attachments)
    ? outputs.attachments
    : [];
  const section = contentWrapper.querySelector<HTMLElement>(".code-interpreter-outputs");

  if (!attachments.length) {
    if (section) {
      section.remove();
    }
    return;
  }

  const container = ensureSection(contentWrapper);
  if (!container) {
    return;
  }

  Array.from(container.querySelectorAll(".code-interpreter-file")).forEach((node) => node.remove());

  attachments.forEach((attachment: CodeAttachment) => {
    const rowControls = buildFileRow(attachment);
    container.appendChild(rowControls.row);
    rowControls.update();
    rowControls.downloadButton.addEventListener("click", async() => {
      rowControls.downloadButton.disabled = true;
      const originalText = rowControls.downloadButton.querySelector<HTMLElement>("span");
      if (originalText) {
        originalText.textContent = "Downloading...";
      }
      try {
        await downloadFileContent(attachment);
      } catch (error) {
        console.error("Failed to download Code Interpreter file:", error);
        if (showError) {
          showError("Failed to download Code Interpreter file. Check console for details.");
        }
      } finally {
        rowControls.downloadButton.disabled = false;
        if (originalText) {
          originalText.textContent = "Download";
        }
      }
    });

    hydrateAttachment(attachment)
      .then(() => {
        rowControls.update();
      })
      .catch(() => {
        rowControls.update();
      });
  });
}
