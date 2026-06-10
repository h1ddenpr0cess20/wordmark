import { elements, state } from "../../init/state.ts";
import { getMemoriesForPrompt } from "../../utils/memoryStorage.ts";
import { getLocationForPrompt } from "../location.ts";
import { getMediaToolInstructions } from "../mediaTools.ts";
import { getToolsDescription } from "../../components/tools.ts";
import { DEFAULT_PERSONALITY, DEFAULT_SYSTEM_PROMPT, PERSONALITY_PROMPT_TEMPLATE, config } from "../../../config/config.ts";
import type {
  Attachment,
  CollectedFunctionCall,
  ContentPart,
  Message,
  ResponseOutputItem,
  ToolCallLike,
} from "../../../types/api.ts";
/**
 * Message preparation helpers for the Responses API.
 */

const IMAGE_PLACEHOLDER_PATTERN = "\\[\\[IMAGE:\\s*([^\\]]+)\\]\\]";

function createPlaceholderRegex() {
  return new RegExp(IMAGE_PLACEHOLDER_PATTERN, "g");
}

function getTextPartType(role: string = "") {
  if (role === "assistant") {
    return "output_text";
  }
  if (role === "tool") {
    return "tool_result";
  }
  return "input_text";
}

function getImagePartType(role: string = "") {
  return role === "assistant" ? "output_image" : "input_image";
}

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

function createImagePart(filename: string, role: string | undefined, attachments?: Attachment[]): ContentPart | null {
  const imageUrl = resolveImageUrl(filename, attachments);
  if (!imageUrl) {
    // Only show warning for actual image attachments, not document/vector store files
    if (typeof window !== "undefined" && state.verboseLogging) {
      // Check if this filename corresponds to an image attachment
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

function buildUserContentFromString(message: Message): string | ContentPart[] {
  const rawContent = typeof message.content === "string" ? message.content : "";
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  const hasAttachments = attachments.length > 0;
  const placeholderTestRegex = createPlaceholderRegex();
  const hasPlaceholders = placeholderTestRegex.test(rawContent);

  if (!hasAttachments && !hasPlaceholders) {
    return rawContent;
  }

  const parts: ContentPart[] = [];
  const usedFilenames = new Set<string>();
  let lastIndex = 0;

  const replaceRegex = createPlaceholderRegex();
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

  // Append any attachments that did not have explicit placeholders
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

// ---- Token-budget history windowing ----

/**
 * Rough token estimate for a string (~4 chars/token heuristic).
 * @param {string} text
 * @returns {number}
 */
export function estimateTokens(text: unknown): number {
  if (!text) {
    return 0;
  }
  return Math.ceil(`${text}`.length / 4);
}

/**
 * Estimate the token cost of a single conversation message, including a small
 * fixed overhead for the role/structure envelope.
 * @param {object} message
 * @returns {number}
 */
export function estimateMessageTokens(message: Message): number {
  if (!message || typeof message !== "object") {
    return 0;
  }
  let text = "";
  if (typeof message.content === "string") {
    text = message.content;
  } else if (Array.isArray(message.content)) {
    text = message.content
      .map(part => {
        if (typeof part === "string") {
          return part;
        }
        if (part && typeof part === "object") {
          return part.text || part.output || "";
        }
        return "";
      })
      .join(" ");
  } else if (message.content && typeof message.content === "object") {
    text = message.content.text || "";
  }
  return estimateTokens(text) + 4;
}

/**
 * Trim a conversation message list to fit within a token budget, keeping the most
 * recent messages and dropping the oldest first. The latest message is always
 * retained even if it alone exceeds the budget. A budget of 0 or less disables
 * trimming (the full list is returned).
 * @param {object[]} messages
 * @param {number} budget - token budget; 0 or negative means "no limit"
 * @returns {object[]} a trimmed copy in original order
 */
export function windowMessagesByTokenBudget(messages: Message[], budget: number): Message[] {
  if (!Array.isArray(messages)) {
    return [];
  }
  if (!budget || budget <= 0) {
    return messages.slice();
  }
  const kept: Message[] = [];
  let total = 0;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const cost = estimateMessageTokens(messages[i]);
    if (kept.length > 0 && total + cost > budget) {
      break;
    }
    kept.unshift(messages[i]);
    total += cost;
  }
  return kept;
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
        // fall through to manual construction
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

/**
 * Resolves the active system instructions from the prompt settings: empty for
 * "no prompt", the custom prompt, the personality prompt, or the default.
 */
export function buildInstructions() {
  if (elements.noPromptRadio && elements.noPromptRadio.checked) {
    return "";
  }
  if (elements.customPromptRadio && elements.customPromptRadio.checked && elements.systemPromptCustom) {
    const custom = elements.systemPromptCustom.value.trim();
    if (custom) {
      return custom;
    }
  }
  if (elements.personalityPromptRadio && elements.personalityPromptRadio.checked) {
    return buildPersonalityInstruction();
  }
  const basePrompt = DEFAULT_SYSTEM_PROMPT || "";
  return `${basePrompt}${state.shortResponseGuideline || ""}`.trim();
}

/**
 * Builds the developer/system message: the active instructions augmented with
 * location context and the current timestamp. Returns `""` when there are no
 * instructions.
 */
export function buildDeveloperMessage() {
  const instructions = buildInstructions();
  if (!instructions) {
    return "";
  }
  const locationInfo = getLocationForPrompt();
  const timestamp = (() => {
    try {
      return new Intl.DateTimeFormat(undefined, { dateStyle: "full", timeStyle: "short" })
        .format(new Date());
    } catch {
      return new Date().toISOString();
    }
  })();
  let developerBlock = instructions;
  if (locationInfo && !developerBlock.includes(locationInfo)) {
    developerBlock += `\nCurrent location context${locationInfo}`;
  }
  if (!developerBlock.includes(timestamp)) {
    developerBlock += `\n(Generated on ${timestamp})`;
  }
  if (config?.enableFunctionCalling) {
    const toolsDescription = getToolsDescription();
    if (toolsDescription) {
      developerBlock += `\n${toolsDescription.trim()}`;
    }
  }
  if (config?.enableFunctionCalling) {
    const mediaToolInstructions = getMediaToolInstructions();
    if (mediaToolInstructions) {
      developerBlock += `\n${mediaToolInstructions.trim()}`;
    }
  }
  const memories = getMemoriesForPrompt();
  if (memories) {
    developerBlock += `\n${memories.trim()}`;
  }
  const trimmed = developerBlock.trim();
  return trimmed ? trimmed : null;
}

function buildPersonalityInstruction() {
  const personality = (elements.personalityInput && elements.personalityInput.value.trim())
    || DEFAULT_PERSONALITY
    || "a helpful assistant";
  const template = PERSONALITY_PROMPT_TEMPLATE
    || "Assume the personality of {personality}. Roleplay and never break character.{guideline}";
  const guideline = state.shortResponseGuideline || "";
  const datetime = buildTimestampString();
  const location = buildLocationString();
  return template
    .replace("{personality}", personality)
    .replace("{guideline}", guideline)
    .replace("{datetime}", datetime)
    .replace("{location}", location || "Unknown location");
}

function buildLocationString() {
  return getLocationForPrompt();
  return "";
}

function buildTimestampString() {
  try {
    const options: Intl.DateTimeFormatOptions = { dateStyle: "full", timeStyle: "short" };
    return new Intl.DateTimeFormat(undefined, options).format(new Date());
  } catch {
    return new Date().toISOString();
  }
}
