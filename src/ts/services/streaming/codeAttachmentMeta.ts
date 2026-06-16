/**
 * Code Interpreter attachment metadata helpers.
 *
 * @remarks
 * Pure, dependency-light helpers for naming and describing Code Interpreter file
 * attachments (display filename, human-readable size, metadata line, header
 * filename parsing, MIME-to-extension). Split out of {@link ./codeInterpreterRender.ts}
 * so this string/metadata logic stays free of DOM and network concerns and is
 * independently testable.
 */

import type { CodeAttachment } from "./codeInterpreter.ts";

/** Picks a display filename for an attachment: its name, else file id, else a positional default. */
export function fallbackFilename(attachment: CodeAttachment, index: number | null) {
  if (attachment && attachment.filename) {
    return attachment.filename;
  }
  if (attachment && attachment.fileId) {
    return attachment.fileId;
  }
  return `code-output-${typeof index === "number" ? index + 1 : 1}`;
}

/** Formats a byte count as a human-readable size (B/KB/MB/GB/TB), or `null` if not a valid number. */
export function formatBytes(bytes: unknown) {
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
export function describeAttachment(attachment: CodeAttachment) {
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
export function parseContentDispositionFilename(header: string | null) {
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
export function guessExtension(mimeType: unknown) {
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
