/**
 * Message preparation helpers for the Responses API.
 *
 * @remarks
 * Converts stored conversation messages into the Responses API input shape —
 * expanding `[[IMAGE: ...]]` placeholders and attachments into multimodal
 * content parts — and extracts tool/function calls back out of a response.
 */

import { state } from "../../init/state.ts";
import { createImagePlaceholderRegex } from "../../utils/placeholders.ts";
import type {
  Attachment,
  CollectedFunctionCall,
  ContentPart,
  Message,
  ResponseOutputItem,
  ToolCallLike,
} from "../../../types/api.ts";

/** Maps a message role to the Responses API text content-part type. */
function getTextPartType(role: string = "") {
  if (role === "assistant") {
    return "output_text";
  }
  if (role === "tool") {
    return "tool_result";
  }
  return "input_text";
}

/** Maps a message role to the Responses API image content-part type. */
function getImagePartType(role: string = "") {
  return role === "assistant" ? "output_image" : "input_image";
}

/**
 * Appends a trimmed text content part for `segment` to `parts`, using the
 * role-appropriate text type. No-ops when the segment is empty or whitespace.
 */
function appendTextPart(parts: ContentPart[], role: string | undefined, segment: unknown) {
  if (segment === undefined || segment === null) {
    return;
  }
  const normalized = `${segment}`.replace(/\r/g, "");
  if (!normalized.trim()) {
    return;
  }
  parts.push({
    type: getTextPartType(role),
    text: normalized.trim(),
  });
}

/**
 * Resolves a usable image URL/data-URL for `filename`, checking the message's
 * attachments first, then the runtime image cache and generated-image gallery.
 *
 * @returns The resolved URL, or `null` when no image data is available.
 */
function resolveImageUrl(filename: string | undefined, attachments: Attachment[] = []): string | null {
  if (!filename) {
    return null;
  }
  const normalized = filename.trim();
  if (!normalized) {
    return null;
  }
  let candidate = null;

  if (Array.isArray(attachments)) {
    const attachment = attachments.find(att => att && att.filename === normalized);
    if (attachment) {
      candidate = typeof attachment.dataUrl === "string" && attachment.dataUrl
        ? attachment.dataUrl
        : (attachment.url || null);
    }
  }

  if (!candidate) {
    try {
      if (state.imageDataCache && typeof state.imageDataCache.get === "function") {
        const cached = state.imageDataCache.get(normalized);
        if (cached) {
          candidate = cached;
        }
      }
      if (!candidate && Array.isArray(state.generatedImages)) {
        const galleryEntry = state.generatedImages.find(img =>
          img && img.filename === normalized,
        );
        if (galleryEntry) {
          if (galleryEntry.url) {
            candidate = galleryEntry.url;
          } else if (typeof galleryEntry.dataUrl === "string" && galleryEntry.dataUrl) {
            candidate = galleryEntry.dataUrl;
          }
        }
      }
    } catch (cacheError) {
      console.warn("Image cache lookup failed for", normalized, cacheError);
    }
  }

  return typeof candidate === "string" && candidate ? candidate : null;
}

/**
 * Builds an image content part for `filename`, resolving its data via
 * {@link resolveImageUrl}. Returns `null` (and warns when verbose logging is on)
 * if no image data can be found.
 */
function createImagePart(filename: string, role: string | undefined, attachments?: Attachment[]): ContentPart | null {
  const imageUrl = resolveImageUrl(filename, attachments);
  if (!imageUrl) {
    if (typeof window !== "undefined" && state.verboseLogging) {
      const isImageAttachment = Array.isArray(attachments) &&
        attachments.some(att => att && att.filename === filename && att.type === "image");

      if (isImageAttachment) {
        console.warn(`No image data found for attachment '${filename}'.`);
      }
    }
    return null;
  }
  return {
    type: getImagePartType(role),
    image_url: imageUrl,
  };
}

/**
 * Builds a user message's request content from its string body, splicing
 * `[[IMAGE: ...]]` placeholders and any unreferenced attachments into image
 * content parts interleaved with the surrounding text.
 *
 * @returns The original string when no images apply, otherwise the content-part
 * array; falls back to the raw string if no image part could be produced.
 */
function buildUserContentFromString(message: Message): string | ContentPart[] {
  const rawContent = typeof message.content === "string" ? message.content : "";
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  const hasAttachments = attachments.length > 0;
  const placeholderTestRegex = createImagePlaceholderRegex();
  const hasPlaceholders = placeholderTestRegex.test(rawContent);

  if (!hasAttachments && !hasPlaceholders) {
    return rawContent;
  }

  const parts: ContentPart[] = [];
  const usedFilenames = new Set<string>();
  let lastIndex = 0;

  const replaceRegex = createImagePlaceholderRegex();
  rawContent.replace(replaceRegex, (match: string, filename: string, offset: number) => {
    const preceding = rawContent.slice(lastIndex, offset);
    appendTextPart(parts, message.role, preceding);

    const trimmedFilename = (filename || "").trim();
    const imagePart = createImagePart(trimmedFilename, message.role, attachments);
    if (imagePart) {
      parts.push(imagePart);
      usedFilenames.add(trimmedFilename);
    } else {
      appendTextPart(parts, message.role, match);
    }
    lastIndex = offset + match.length;
    return match;
  });

  const trailing = rawContent.slice(lastIndex);
  appendTextPart(parts, message.role, trailing);

  attachments.forEach(att => {
    if (!att || !att.filename) {
      return;
    }
    const trimmed = att.filename.trim();
    if (trimmed && !usedFilenames.has(trimmed)) {
      const imagePart = createImagePart(trimmed, message.role, attachments);
      if (imagePart) {
        parts.push(imagePart);
        usedFilenames.add(trimmed);
      }
    }
  });

  const hasImagePart = parts.some(part =>
    part && typeof part === "object" && typeof part.type === "string" && part.type.includes("_image"),
  );

  if (!hasImagePart) {
    return rawContent;
  }

  return parts;
}

/**
 * Converts conversation messages into Responses API input format, expanding
 * `[[IMAGE: ...]]` placeholders and inline attachments into multimodal content
 * parts. Invalid entries are dropped.
 */
export function serializeMessagesForRequest(messages: Message[] = []): Message[] {
  if (!Array.isArray(messages)) {
    return [];
  }
  return messages
    .map((msg: Message): Message | null => {
      if (!msg || typeof msg !== "object") {
        return null;
      }
      const payload: Message = {};
      if (msg.role) {
        payload.role = msg.role;
      }
      if (msg.type) {
        payload.type = msg.type;
      }
      if (msg.name) {
        payload.name = msg.name;
      }
      if (typeof msg.content === "string") {
        if (msg.role === "user") {
          payload.content = buildUserContentFromString(msg);
        } else {
          payload.content = msg.content;
        }
      } else if (Array.isArray(msg.content)) {
        payload.content = msg.content
          .map((part): ContentPart | null => {
            if (part && typeof part === "object") {
              return { ...part };
            }
            if (typeof part === "string") {
              return { type: "output_text", text: part };
            }
            return null;
          })
          .filter((part): part is ContentPart => part !== null);
      } else if (msg.content && typeof msg.content === "object") {
        payload.content = { ...msg.content };
      }
      if (msg.arguments) {
        payload.arguments = msg.arguments;
      }
      if (msg.call_id) {
        payload.call_id = msg.call_id;
      }
      if (msg.output) {
        payload.output = msg.output;
      }
      if (msg.tool_call_id) {
        payload.tool_call_id = msg.tool_call_id;
      }
      return payload;
    })
    .filter((msg): msg is Message => msg !== null);
}

/**
 * Extracts function/tool calls from a response's output array, handling the
 * several shapes providers use (top-level calls, message `tool_calls`, and
 * message content parts). Each result carries parsed args plus the raw JSON.
 */
export function collectFunctionCalls(responseOutput: ResponseOutputItem[] = []): CollectedFunctionCall[] {
  const calls: CollectedFunctionCall[] = [];

  const ensureJsonString = (value: unknown): string => {
    if (typeof value === "string") {
      return value;
    }
    try {
      return JSON.stringify(value ?? {});
    } catch {
      return "{}";
    }
  };

  const buildArgsDict = (rawArgs: unknown): Record<string, unknown> => {
    if (!rawArgs) {
      return {};
    }
    if (typeof rawArgs === "string") {
      try {
        return rawArgs ? JSON.parse(rawArgs) : {};
      } catch {
        return {};
      }
    }
    if (typeof rawArgs === "object") {
      return { ...rawArgs };
    }
    return {};
  };

  const buildToolCallInput = (
    name: string,
    argsJson: string,
    callId: string | null | undefined,
    original: ToolCallLike | undefined,
  ): ToolCallLike => {
    if (original && typeof original === "object") {
      try {
        return JSON.parse(JSON.stringify(original));
      } catch {
        /* fall through to manual construction */
      }
    }
    const input: ToolCallLike = {
      type: "tool_call",
      id: callId || undefined,
      function: {
        name,
        arguments: argsJson,
      },
    };
    if (original && typeof original === "object" && original.mode) {
      input.mode = original.mode;
    }
    return input;
  };

  responseOutput.forEach((item: ResponseOutputItem) => {
    if (!item) {
      return;
    }

    const processCall = (
      name: string | undefined,
      rawArgs: unknown,
      callId: string | undefined,
      source: ToolCallLike,
    ) => {
      if (!name) {
        return;
      }
      const argsJson = ensureJsonString(rawArgs);
      const argsDict = buildArgsDict(rawArgs);
      const effectiveId = callId || null;
      calls.push({
        name,
        argsDict,
        argsJson,
        callId: effectiveId,
        toolCallInput: buildToolCallInput(name, argsJson, effectiveId, source),
      });
    };

    if (item.type === "tool_call" || item.type === "function_call") {
      const fnName = item.name || item.tool_name || (item.function && item.function.name);
      const rawArgs = item.arguments ?? (item.function && item.function.arguments);
      const callId = item.id || item.call_id;
      processCall(fnName, rawArgs, callId, item);
      return;
    }

    if (item.type === "message") {
      if (Array.isArray(item.tool_calls)) {
        item.tool_calls.forEach(tc => {
          if (!tc) return;
          const fnName = tc.name || tc.tool_name || (tc.function && tc.function.name);
          const rawArgs = tc.arguments ?? (tc.function && tc.function.arguments);
          const callId = tc.id || tc.call_id;
          processCall(fnName, rawArgs, callId, tc);
        });
      }
      if (Array.isArray(item.content)) {
        item.content.forEach(part => {
          if (!part || (part.type !== "function_call" && part.type !== "tool_call")) {
            return;
          }
          const fnName = part.name || part.tool_name || (part.function && part.function.name);
          const rawArgs = part.arguments ?? (part.function && part.function.arguments);
          const callId = part.id || part.call_id || item.call_id || item.id;
          processCall(fnName, rawArgs, callId, part);
        });
      }
    }
  });

  return calls;
}

