/**
 * Helpers for handling Code Interpreter outputs (files, logs) within responses.
 */

import { icon } from "../../utils/icons.ts";
import { showError } from "../../utils/notifications.ts";
import {
  ensureApiKey,
  getBaseUrl,
} from "../api/clientConfig.ts";
import type { ResponseObject } from "../../../types/api.ts";
import { isRecord } from "../../utils/utils.ts";

const FILE_METADATA_CACHE = new Map<string, any>();
const FILE_METADATA_PROMISES = new Map<string, Promise<any>>();

/** A file produced by a Code Interpreter call. */
export interface CodeAttachment {
  kind: "attachment";
  subtype: string;
  callId: string | null;
  fileId: string;
  containerId?: string | null;
  filename: string | null;
  mimeType: string | null;
  bytes: number | null;
  index: number | null;
  status: string;
  error: string | null;
}

/** Textual log output emitted by a Code Interpreter call. */
export interface CodeLog {
  kind: "logs";
  callId: string | null;
  text: string;
}

/** Collected Code Interpreter outputs: produced files and log lines. */
export interface CodeInterpreterOutputs {
  attachments: CodeAttachment[];
  logs: CodeLog[];
}

interface GatherContext {
  callId: string | null;
  pushAttachment: (attachment: CodeAttachment | null) => void;
  pushLog: (logEntry: CodeLog) => void;
  visitedObjects: WeakSet<object> | null;
}

function isCodeInterpreterName(rawName: unknown) {
  if (typeof rawName !== "string") {
    return false;
  }
  const name = rawName.toLowerCase();
  return name === "code_interpreter" || name === "python" || name === "code-interpreter";
}

function looksLikeFileId(value: unknown) {
  if (typeof value !== "string" || !value) {
    return false;
  }
  return /^(cfile_|file_)[a-zA-Z0-9]+$/.test(value);
}

function inferSubtype(type: unknown, mimeType: unknown) {
  const lowerType = typeof type === "string" ? type.toLowerCase() : "";
  const lowerMime = typeof mimeType === "string" ? mimeType.toLowerCase() : "";
  if (lowerType.includes("image") || lowerMime.startsWith("image/")) {
    return "image";
  }
  return "file";
}

/**
 * Returns the first own property among `keys` whose value is a non-empty
 * string.
 *
 * @param record - Source object.
 * @param keys - Candidate keys in priority order.
 * @returns The matching string, or null when none qualify.
 */
function pickString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value) {
      return value;
    }
  }
  return null;
}

function extractFileId(candidate: unknown): string | null {
  if (!isRecord(candidate)) {
    return null;
  }
  const possibleKeys = [
    "file_id",
    "fileId",
    "id",
    "result",
    "output_file_id",
    "artifact_id",
    "asset_id",
  ];
  for (const key of possibleKeys) {
    if (!Object.prototype.hasOwnProperty.call(candidate, key)) {
      continue;
    }
    const value = candidate[key];
    if (typeof value === "string" && looksLikeFileId(value)) {
      return value;
    }
  }
  return null;
}

function buildAttachmentFromObject(candidate: unknown, callId: string | null): CodeAttachment | null {
  const fileId = extractFileId(candidate);
  if (!fileId || !isRecord(candidate)) {
    return null;
  }
  const mimeType = pickString(candidate, ["mime_type", "content_type", "media_type"]);
  const filename = pickString(candidate, ["filename", "name", "path", "display_name"]);
  const bytes = typeof candidate.bytes === "number"
    ? candidate.bytes
    : (typeof candidate.size === "number" ? candidate.size : null);

  const containerId = pickString(candidate, ["container_id"]);

  return {
    kind: "attachment",
    subtype: inferSubtype(candidate.type, mimeType),
    callId: callId || null,
    fileId,
    containerId,
    filename,
    mimeType,
    bytes,
    index: null,
    status: "pending",
    error: null,
  };
}

function gatherOutputsFromValue(value: unknown, context: GatherContext) {
  const {
    callId,
    pushAttachment,
    pushLog,
    visitedObjects,
  } = context;

  if (value === null || value === undefined) {
    return;
  }

  if (typeof value === "string") {
    if (looksLikeFileId(value)) {
      pushAttachment({
        kind: "attachment",
        subtype: "file",
        callId: callId || null,
        fileId: value,
        filename: null,
        mimeType: null,
        bytes: null,
        index: null,
        status: "pending",
        error: null,
      });
    }
    return;
  }

  if (typeof value !== "object") {
    return;
  }

  if (visitedObjects && visitedObjects.has(value)) {
    return;
  }
  if (visitedObjects) {
    visitedObjects.add(value);
  }

  if (isRecord(value)) {
    const type = typeof value.type === "string" ? value.type.toLowerCase() : "";
    if (type && (type.includes("log") || type === "stderr")) {
      const raw = value.logs ?? value.text ?? value.content ?? "";
      const text = Array.isArray(raw) ? raw.join("\n") : (raw ? String(raw) : "");
      if (text && text.trim()) {
        pushLog({
          kind: "logs",
          callId: callId || null,
          text: text.trim(),
        });
      }
    }

    const attachment = buildAttachmentFromObject(value, callId);
    if (attachment) {
      pushAttachment(attachment);
    }
  }

  const indexable = value as Record<string, unknown>;
  for (const key of Object.keys(value)) {
    if (key === "logs") {
      continue;
    }
    gatherOutputsFromValue(indexable[key], context);
  }
}

/**
 * Walks a response payload and collects code-interpreter results, separating
 * file/image attachments from text logs and de-duplicating by id.
 */
export function extractCodeInterpreterOutputs(responsePayload: ResponseObject | null): CodeInterpreterOutputs {
  const attachments: CodeAttachment[] = [];
  const logs: CodeLog[] = [];
  const attachmentById = new Map<string, CodeAttachment>();
  const logKeys = new Set<string>();
  const visitedObjects = typeof WeakSet !== "undefined" ? new WeakSet() : null;

  const pushAttachment = (attachment: CodeAttachment | null) => {
    if (!attachment || !attachment.fileId) {
      return;
    }
    const existing = attachmentById.get(attachment.fileId);
    if (existing) {
      if (!existing.filename && attachment.filename) {
        existing.filename = attachment.filename;
      }
      if (!existing.containerId && attachment.containerId) {
        existing.containerId = attachment.containerId;
      }
      if (attachment.mimeType) {
        if (!existing.mimeType) {
          existing.mimeType = attachment.mimeType;
        }
        if (attachment.mimeType.toLowerCase().startsWith("image/")) {
          existing.subtype = "image";
        }
      }
      if (attachment.subtype === "image") {
        existing.subtype = "image";
      }
      if (existing.bytes == null && attachment.bytes != null) {
        existing.bytes = attachment.bytes;
      }
      return;
    }
    attachment.index = attachments.length;
    attachments.push(attachment);
    attachmentById.set(attachment.fileId, attachment);
  };

  const pushLog = (logEntry: CodeLog) => {
    if (!logEntry || !logEntry.text) {
      return;
    }
    const key = `${logEntry.callId || ""}|${logEntry.text}`;
    if (logKeys.has(key)) {
      return;
    }
    logKeys.add(key);
    logs.push({
      kind: "logs",
      callId: logEntry.callId || null,
      text: logEntry.text,
    });
  };

  const context: GatherContext = {
    callId: null,
    pushAttachment,
    pushLog,
    visitedObjects,
  };

  const inspectItem = (item: unknown, callIdHint?: string | null) => {
    if (!isRecord(item)) {
      return;
    }
    const callId = callIdHint || pickString(item, ["tool_call_id", "call_id", "id"]);
    const fn = isRecord(item.function) ? item.function : null;
    const toolName = pickString(item, ["tool_name", "name"]) || (fn ? pickString(fn, ["name"]) : null) || "";
    const type = item.type;
    const isRelevant =
      isCodeInterpreterName(toolName) ||
      (typeof type === "string" && type.toLowerCase().includes("code_interpreter")) ||
      Boolean(item.code_interpreter || item.code_interpreter_call);
    if (!isRelevant) {
      return;
    }
    context.callId = callId || null;
    gatherOutputsFromValue(item, context);
  };

  const rootOutputs = Array.isArray(responsePayload?.output) ? responsePayload.output : [];
  rootOutputs.forEach((item: unknown) => {
    inspectItem(item);
    if (isRecord(item) && Array.isArray(item.content)) {
      const itemId = typeof item.id === "string" ? item.id : null;
      item.content.forEach((contentItem: unknown) => {
        if (isRecord(contentItem) && Array.isArray(contentItem.annotations)) {
          contentItem.annotations.forEach((annotation: unknown) => {
            if (isRecord(annotation) && annotation.type === "container_file_citation") {
              const fileAttachment = buildAttachmentFromObject(annotation, itemId);
              if (fileAttachment) {
                pushAttachment(fileAttachment);
              }
            }
          });
        }
      });
    }
  });

  const toolCalls = Array.isArray(responsePayload?.tool_calls) ? responsePayload.tool_calls : [];
  toolCalls.forEach((call: unknown) => inspectItem(call));

  const ciCalls: unknown[] = [];
  if (Array.isArray(responsePayload?.code_interpreter_calls)) {
    ciCalls.push(...responsePayload.code_interpreter_calls);
  }
  if (responsePayload?.code_interpreter_call) {
    ciCalls.push(responsePayload.code_interpreter_call);
  }
  ciCalls.forEach((call: unknown) => {
    const callId = isRecord(call) ? pickString(call, ["id", "tool_call_id", "call_id"]) : null;
    context.callId = callId || null;
    gatherOutputsFromValue(call, context);
  });

  context.callId = null;

  return {
    attachments,
    logs,
  };
}

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

function fallbackFilename(attachment: CodeAttachment, index: number | null) {
  if (attachment && attachment.filename) {
    return attachment.filename;
  }
  if (attachment && attachment.fileId) {
    return attachment.fileId;
  }
  return `code-output-${typeof index === "number" ? index + 1 : 1}`;
}

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
    if (metadata && typeof metadata === "object") {
      if (!attachment.filename) {
        attachment.filename = metadata.filename || metadata.name || null;
      }
      if (!attachment.mimeType) {
        attachment.mimeType = metadata.mime_type || metadata.content_type || null;
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

