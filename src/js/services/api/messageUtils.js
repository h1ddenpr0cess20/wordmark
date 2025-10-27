/**
 * Message preparation helpers for the Responses API.
 */

const IMAGE_PLACEHOLDER_PATTERN = '\\[\\[IMAGE:\\s*([^\\]]+)\\]\\]';

function createPlaceholderRegex() {
  return new RegExp(IMAGE_PLACEHOLDER_PATTERN, 'g');
}

function getTextPartType(role = '') {
  if (role === 'assistant') {
    return 'output_text';
  }
  if (role === 'tool') {
    return 'tool_result';
  }
  return 'input_text';
}

function getImagePartType(role = '') {
  return role === 'assistant' ? 'output_image' : 'input_image';
}

function appendTextPart(parts, role, segment) {
  if (segment === undefined || segment === null) {
    return;
  }
  const normalized = `${segment}`.replace(/\r/g, '');
  if (!normalized.trim()) {
    return;
  }
  parts.push({
    type: getTextPartType(role),
    text: normalized.trim(),
  });
}

function resolveImageUrl(filename, attachments = []) {
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
      candidate = typeof attachment.dataUrl === 'string' && attachment.dataUrl
        ? attachment.dataUrl
        : (attachment.url || null);
    }
  }

  if (!candidate && typeof window !== 'undefined') {
    try {
      if (window.imageDataCache && typeof window.imageDataCache.get === 'function') {
        const cached = window.imageDataCache.get(normalized);
        if (cached) {
          candidate = cached;
        }
      }
      if (!candidate && Array.isArray(window.generatedImages)) {
        const galleryEntry = window.generatedImages.find(img =>
          img && img.filename === normalized,
        );
        if (galleryEntry) {
          if (galleryEntry.url) {
            candidate = galleryEntry.url;
          } else if (typeof galleryEntry.dataUrl === 'string' && galleryEntry.dataUrl) {
            candidate = galleryEntry.dataUrl;
          }
        }
      }
    } catch (cacheError) {
      console.warn('Image cache lookup failed for', normalized, cacheError);
    }
  }

  return typeof candidate === 'string' && candidate ? candidate : null;
}

function createImagePart(filename, role, attachments) {
  const imageUrl = resolveImageUrl(filename, attachments);
  if (!imageUrl) {
    // Only show warning for actual image attachments, not document/vector store files
    if (typeof window !== 'undefined' && window.VERBOSE_LOGGING) {
      // Check if this filename corresponds to an image attachment
      const isImageAttachment = Array.isArray(attachments) && 
        attachments.some(att => att && att.filename === filename && att.type === 'image');
      
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

function buildUserContentFromString(message) {
  const rawContent = typeof message.content === 'string' ? message.content : '';
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  const hasAttachments = attachments.length > 0;
  const placeholderTestRegex = createPlaceholderRegex();
  const hasPlaceholders = placeholderTestRegex.test(rawContent);

  if (!hasAttachments && !hasPlaceholders) {
    return rawContent;
  }

  const parts = [];
  const usedFilenames = new Set();
  let lastIndex = 0;

  const replaceRegex = createPlaceholderRegex();
  rawContent.replace(replaceRegex, (match, filename, offset) => {
    const preceding = rawContent.slice(lastIndex, offset);
    appendTextPart(parts, message.role, preceding);

    const trimmedFilename = (filename || '').trim();
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
    part && typeof part === 'object' && typeof part.type === 'string' && part.type.includes('_image'),
  );

  if (!hasImagePart) {
    return rawContent;
  }

  return parts;
}

export function serializeMessagesForRequest(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }
  return messages
    .map(msg => {
      if (!msg || typeof msg !== 'object') {
        return null;
      }
      const payload = {};
      if (msg.role) {
        payload.role = msg.role;
      }
      if (msg.type) {
        payload.type = msg.type;
      }
      if (msg.name) {
        payload.name = msg.name;
      }
      if (typeof msg.content === 'string') {
        if (msg.role === 'user') {
          payload.content = buildUserContentFromString(msg);
        } else {
          payload.content = msg.content;
        }
      } else if (Array.isArray(msg.content)) {
        payload.content = msg.content
          .map(part => {
            if (part && typeof part === 'object') {
              return { ...part };
            }
            if (typeof part === 'string') {
              return { type: 'output_text', text: part };
            }
            return null;
          })
          .filter(Boolean);
      } else if (msg.content && typeof msg.content === 'object') {
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
    .filter(Boolean);
}

export function collectFunctionCalls(responseOutput = []) {
  const calls = [];

  const ensureJsonString = value => {
    if (typeof value === 'string') {
      return value;
    }
    try {
      return JSON.stringify(value ?? {});
    } catch (_) {
      return '{}';
    }
  };

  const buildArgsDict = rawArgs => {
    if (!rawArgs) {
      return {};
    }
    if (typeof rawArgs === 'string') {
      try {
        return rawArgs ? JSON.parse(rawArgs) : {};
      } catch (_) {
        return {};
      }
    }
    if (typeof rawArgs === 'object') {
      return { ...rawArgs };
    }
    return {};
  };

  const buildToolCallInput = (name, argsJson, callId, original) => {
    if (original && typeof original === 'object') {
      try {
        return JSON.parse(JSON.stringify(original));
      } catch (_) {
        // fall through to manual construction
      }
    }
    const input = {
      type: 'tool_call',
      id: callId || undefined,
      function: {
        name,
        arguments: argsJson,
      },
    };
    if (original && typeof original === 'object' && original.mode) {
      input.mode = original.mode;
    }
    return input;
  };

  responseOutput.forEach(item => {
    if (!item) {
      return;
    }

    const processCall = (name, rawArgs, callId, source) => {
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

    if (item.type === 'tool_call' || item.type === 'function_call') {
      const fnName = item.name || item.tool_name || (item.function && item.function.name);
      const rawArgs = item.arguments ?? (item.function && item.function.arguments);
      const callId = item.id || item.call_id;
      processCall(fnName, rawArgs, callId, item);
      return;
    }

    if (item.type === 'message') {
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
          if (!part || (part.type !== 'function_call' && part.type !== 'tool_call')) {
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

export function buildInstructions() {
  if (window.noPromptRadio && window.noPromptRadio.checked) {
    return '';
  }
  if (window.customPromptRadio && window.customPromptRadio.checked && window.systemPromptCustom) {
    const custom = window.systemPromptCustom.value.trim();
    if (custom) {
      return custom;
    }
  }
  if (window.personalityPromptRadio && window.personalityPromptRadio.checked) {
    return buildPersonalityInstruction();
  }
  const basePrompt = window.DEFAULT_SYSTEM_PROMPT || '';
  return `${basePrompt}${window.SHORT_RESPONSE_GUIDELINE || ''}`.trim();
}

export function buildDeveloperMessage(model) {
  const instructions = buildInstructions();
  if (!instructions) {
    return '';
  }
  const locationInfo = typeof window.getLocationForPrompt === 'function'
    ? window.getLocationForPrompt()
    : '';
  const timestamp = (() => {
    try {
      return new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'short' })
        .format(new Date());
    } catch (_) {
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
  if (window.config?.enableFunctionCalling && typeof window.getToolsDescription === 'function') {
    const toolsDescription = window.getToolsDescription();
    if (toolsDescription) {
      developerBlock += `\n${toolsDescription.trim()}`;
    }
  }
  if (typeof window.getMemoriesForPrompt === 'function') {
    const memories = window.getMemoriesForPrompt();
    if (memories) {
      developerBlock += `\n${memories.trim()}`;
    }
  }
  const trimmed = developerBlock.trim();
  return trimmed ? trimmed : null;
}

function buildPersonalityInstruction() {
  const personality = (window.personalityInput && window.personalityInput.value.trim())
    || window.DEFAULT_PERSONALITY
    || 'a helpful assistant';
  const template = window.PERSONALITY_PROMPT_TEMPLATE
    || 'Assume the personality of {personality}. Roleplay and never break character.{guideline}';
  const guideline = window.SHORT_RESPONSE_GUIDELINE || '';
  const datetime = buildTimestampString();
  const location = buildLocationString();
  return template
    .replace('{personality}', personality)
    .replace('{guideline}', guideline)
    .replace('{datetime}', datetime)
    .replace('{location}', location || 'Unknown location');
}

function buildLocationString() {
  if (typeof window.getLocationForPrompt === 'function') {
    return window.getLocationForPrompt();
  }
  return '';
}

function buildTimestampString() {
  try {
    const options = { dateStyle: 'full', timeStyle: 'short' };
    return new Intl.DateTimeFormat(undefined, options).format(new Date());
  } catch (_) {
    return new Date().toISOString();
  }
}
