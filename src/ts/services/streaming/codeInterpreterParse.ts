/**
 * Code Interpreter attachment parsing primitives.
 *
 * @remarks
 * Pure predicates and the attachment builder used by {@link ./codeInterpreter.ts}'s
 * recursive output walk: recognizing code-interpreter tool names and provider
 * file ids, classifying image vs. file subtypes, and constructing a
 * {@link CodeAttachment} from a candidate object. Kept free of the traversal
 * logic so they can be reasoned about and tested in isolation.
 */

import { isRecord, pickString } from "../../utils/utils.ts";
import type { CodeAttachment } from "./codeInterpreter.ts";

/** Reports whether a tool name denotes a code-interpreter call (`code_interpreter`/`python`). */
export function isCodeInterpreterName(rawName: unknown) {
  if (typeof rawName !== "string") {
    return false;
  }
  const name = rawName.toLowerCase();
  return name === "code_interpreter" || name === "python" || name === "code-interpreter";
}

/** Reports whether a string matches a provider file-id shape (`cfile_`/`file_` prefix). */
export function looksLikeFileId(value: unknown) {
  if (typeof value !== "string" || !value) {
    return false;
  }
  return /^(cfile_|file_)[a-zA-Z0-9]+$/.test(value);
}

/** Classifies an attachment as `"image"` (by type or MIME) or otherwise `"file"`. */
export function inferSubtype(type: unknown, mimeType: unknown) {
  const lowerType = typeof type === "string" ? type.toLowerCase() : "";
  const lowerMime = typeof mimeType === "string" ? mimeType.toLowerCase() : "";
  if (lowerType.includes("image") || lowerMime.startsWith("image/")) {
    return "image";
  }
  return "file";
}

/** Finds the first file-id-shaped value among a record's known id keys, or `null`. */
export function extractFileId(candidate: unknown): string | null {
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

/**
 * Builds a {@link CodeAttachment} from a candidate object that carries a file
 * id, resolving MIME type, filename, byte size, and container id.
 *
 * @returns The attachment, or `null` if no usable file id is present.
 */
export function buildAttachmentFromObject(candidate: unknown, callId: string | null): CodeAttachment | null {
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
