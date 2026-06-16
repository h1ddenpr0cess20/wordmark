/**
 * Extraction helpers for Code Interpreter outputs (files, logs) within
 * responses. Rendering of these outputs lives in {@link ./codeInterpreterRender.ts}.
 */

import type { ResponseObject } from "../../../types/api.ts";
import { isRecord, pickString } from "../../utils/utils.ts";
import {
  isCodeInterpreterName,
  looksLikeFileId,
  buildAttachmentFromObject,
} from "./codeInterpreterParse.ts";

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

/** Shared collector state threaded through the recursive output walk. */
interface GatherContext {
  callId: string | null;
  pushAttachment: (attachment: CodeAttachment | null) => void;
  pushLog: (logEntry: CodeLog) => void;
  visitedObjects: WeakSet<object> | null;
}

/**
 * Recursively walks an arbitrary value, pushing any discovered file
 * attachments and log entries into the collector `context`. Bare file-id
 * strings, log-typed records, and attachment objects are all recognized;
 * `context.visitedObjects` guards against cyclic structures.
 */
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

