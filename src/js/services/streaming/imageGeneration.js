/**
 * Image generation and attachment helpers used during streaming.
 */

export const IMAGE_GENERATION_CALL_TYPE = 'image_generation_call';

export function ensureImagesHaveMessageIds() {
  if (!window.generatedImages || !window.conversationHistory) {
    return 0;
  }

  let updatedCount = 0;
  const unassociatedImages = window.generatedImages.filter(img => !img.associatedMessageId);

  if (unassociatedImages.length === 0) {
    return 0;
  }

  const assistantMessages = window.conversationHistory
    .filter(msg => msg.role === 'assistant' && msg.id)
    .sort((a, b) => {
      const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return timeB - timeA;
    });

  unassociatedImages.forEach(img => {
    let associatedMessage = null;

    for (const msg of assistantMessages) {
      if (msg.content && msg.content.includes(`[[IMAGE: ${img.filename}]]`)) {
        associatedMessage = msg;
        break;
      }
    }

    if (!associatedMessage && assistantMessages.length > 0) {
      if (img.timestamp) {
        let closestMessage = assistantMessages[0];
        let smallestTimeDiff = Infinity;

        for (const msg of assistantMessages) {
          if (!msg.timestamp) {
            continue;
          }
          const timeDiff = Math.abs(
            new Date(msg.timestamp).getTime() - new Date(img.timestamp).getTime(),
          );
          if (timeDiff < smallestTimeDiff) {
            smallestTimeDiff = timeDiff;
            closestMessage = msg;
          }
        }
        associatedMessage = closestMessage;
      } else {
        associatedMessage = assistantMessages[0];
      }
    }

    if (associatedMessage) {
      img.associatedMessageId = associatedMessage.id;
      updatedCount += 1;

      if (!associatedMessage.hasImages) {
        associatedMessage.hasImages = true;
      }
    }
  });

  return updatedCount;
}

function isProbablyBase64(value) {
  if (typeof value !== 'string') {
    return false;
  }
  const sanitized = value.replace(/\s+/g, '');
  if (sanitized.length < 120) {
    return false;
  }
  if (sanitized.length % 4 !== 0) {
    return false;
  }
  return /^[A-Za-z0-9+/=]+$/.test(sanitized);
}

export function imageDebugLog(...args) {
  if (typeof window !== 'undefined' && (window.DEBUG_IMAGE_STREAM === true || window.VERBOSE_LOGGING)) {
    console.info('[image-debug]', ...args);
  }
}

function escapeHtmlAttribute(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function extractMimeFromDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') {
    return null;
  }
  const match = /^data:([^;]+);/i.exec(dataUrl);
  return match ? match[1].toLowerCase() : null;
}

function normaliseMimeType(mimeType) {
  if (typeof mimeType === 'string' && mimeType.trim()) {
    return mimeType.trim().toLowerCase();
  }
  return 'image/png';
}

function coerceImageDataUrl(rawValue, mimeTypeHint) {
  if (typeof rawValue !== 'string') {
    return null;
  }
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return null;
  }
  if (/^data:image\//i.test(trimmed) || /^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  const cleaned = trimmed.replace(/\s+/g, '');
  if (!isProbablyBase64(cleaned)) {
    return null;
  }
  const mimeType = normaliseMimeType(mimeTypeHint);
  const base64 = cleaned.replace(/^base64,?/i, '');
  return `data:${mimeType};base64,${base64}`;
}

export function collectImageCandidates(value, accumulator, defaultMime, seen, visited) {
  if (value === null || value === undefined) {
    return;
  }

  if (typeof value === 'object' && value !== null) {
    if (visited) {
      try {
        if (visited.has(value)) {
          return;
        }
        visited.add(value);
      } catch {
        /* ignore WeakSet errors */
      }
    }
  }

  const pushCandidate = (candidate, mimeType) => {
    const dataUrl = coerceImageDataUrl(candidate, mimeType || defaultMime);
    if (!dataUrl) {
      return;
    }
    if (seen.has(dataUrl)) {
      return;
    }
    seen.add(dataUrl);
    accumulator.push({
      dataUrl,
      mimeType: extractMimeFromDataUrl(dataUrl) || mimeType || defaultMime || 'image/png',
    });
  };

  if (Array.isArray(value)) {
    value.forEach(item => collectImageCandidates(item, accumulator, defaultMime, seen, visited));
    return;
  }

  if (typeof value === 'string') {
    pushCandidate(value, defaultMime);
    return;
  }

  if (typeof value === 'object') {
    const candidateMime = value.mime_type || value.media_type || value.content_type || defaultMime;
    const candidateKeys = [
      'b64_json',
      'base64',
      'image_base64',
      'data',
      'image',
      'result',
      'content',
      'image_base64_json',
      'image_url',
      'data_url',
      'image_data',
      'image_base64_data',
    ];

    candidateKeys.forEach(key => {
      if (!Object.prototype.hasOwnProperty.call(value, key)) {
        return;
      }
      const candidateValue = value[key];
      if (typeof candidateValue === 'string') {
        pushCandidate(candidateValue, candidateMime);
      } else if (candidateValue && typeof candidateValue === 'object') {
        collectImageCandidates(candidateValue, accumulator, candidateMime, seen, visited);
      }
    });

    if (typeof value.url === 'string') {
      pushCandidate(value.url, candidateMime);
    } else if (value.url && typeof value.url === 'object') {
      collectImageCandidates(value.url, accumulator, candidateMime, seen, visited);
    }

    Object.keys(value).forEach(key => {
      if (candidateKeys.includes(key) || key === 'url') {
        return;
      }
      collectImageCandidates(value[key], accumulator, candidateMime, seen, visited);
    });
  }
}

function extractPromptFromImageCall(call) {
  if (!call || typeof call !== 'object') {
    return '';
  }
  if (typeof call.revised_prompt === 'string' && call.revised_prompt.trim()) {
    return call.revised_prompt.trim();
  }
  if (typeof call.prompt === 'string' && call.prompt.trim()) {
    return call.prompt.trim();
  }
  let argumentsSource = call.arguments;
  if (typeof argumentsSource === 'string') {
    try {
      argumentsSource = JSON.parse(argumentsSource);
    } catch (error) {
      argumentsSource = null;
    }
  }
  if (argumentsSource && typeof argumentsSource === 'object') {
    if (typeof argumentsSource.prompt === 'string' && argumentsSource.prompt.trim()) {
      return argumentsSource.prompt.trim();
    }
    if (typeof argumentsSource.input === 'string' && argumentsSource.input.trim()) {
      return argumentsSource.input.trim();
    }
    if (typeof argumentsSource.description === 'string' && argumentsSource.description.trim()) {
      return argumentsSource.description.trim();
    }
  }
  if (call.metadata && typeof call.metadata === 'object') {
    const keys = ['prompt', 'description', 'request'];
    for (const key of keys) {
      if (typeof call.metadata[key] === 'string' && call.metadata[key].trim()) {
        return call.metadata[key].trim();
      }
    }
  }
  return '';
}

function detectImageCallMode(call) {
  const candidates = [
    call?.mode,
    call?.metadata?.mode,
  ];
  const args = call?.arguments;
  if (args && typeof args === 'object') {
    if (typeof args.mode === 'string') {
      candidates.push(args.mode);
    }
    if (typeof args.purpose === 'string') {
      candidates.push(args.purpose);
    }
  }
  if (typeof args === 'string') {
    try {
      const parsed = JSON.parse(args);
      if (parsed && typeof parsed === 'object' && typeof parsed.mode === 'string') {
        candidates.push(parsed.mode);
      }
    } catch {
      /* ignore parse */
    }
  }
  const found = candidates.find(value => typeof value === 'string' && value.trim());
  return found ? found.trim().toLowerCase() : '';
}

function determineSourceLabel(node, mode) {
  if (mode) {
    if (mode.includes('edit')) {
      return 'image_edit';
    }
    if (mode.includes('variation')) {
      return 'image_variation';
    }
  }
  if (node && typeof node.type === 'string') {
    const lowered = node.type.toLowerCase();
    if (lowered.includes('edit')) {
      return 'image_edit';
    }
    if (lowered.includes('variation')) {
      return 'image_variation';
    }
  }
  return 'image_generation';
}

export function processImageGenerationOutputs(responsePayload) {
  if (!responsePayload || typeof responsePayload !== 'object') {
    imageDebugLog('Skipping image extraction: response payload missing or invalid.');
    return;
  }

  const outputs = Array.isArray(responsePayload.output) ? responsePayload.output : [];
  imageDebugLog('Scanning response payload for image calls.', {
    outputLength: outputs.length,
    rawOutputKeys: outputs.map(item => item && item.type),
  });

  if (!Array.isArray(window.currentGeneratedImageHtml)) {
    window.currentGeneratedImageHtml = [];
  }
  if (!Array.isArray(window.generatedImages)) {
    window.generatedImages = [];
  }

  const globalSeen = new Set();

  const imageGenerationOutputs = outputs.filter(entry => {
    if (!entry || typeof entry !== 'object') {
      return false;
    }
    const entryType = entry.type || '';
    return entryType === IMAGE_GENERATION_CALL_TYPE ||
           entryType === 'image_generation' ||
           entryType === 'image_edit' ||
           entryType === 'image_variation';
  });

  imageDebugLog('Filtered to image generation outputs only.', {
    totalOutputs: outputs.length,
    imageGenerationOutputs: imageGenerationOutputs.length,
    types: imageGenerationOutputs.map(item => item.type),
  });

  const candidateEntries = imageGenerationOutputs.length ? imageGenerationOutputs : [];

  candidateEntries.forEach((entry, idx) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }
    const entrySeen = new Set();
    const localVisited = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
    const collected = [];

    imageDebugLog('Inspecting response output entry', {
      index: idx,
      type: entry.type || null,
      keys: Object.keys(entry || {}),
    });

    collectImageCandidates(entry, collected, entry.mime_type || entry.media_type, entrySeen, localVisited);
    collectImageCandidates(entry.result, collected, entry.mime_type || entry.media_type, entrySeen, localVisited);
    collectImageCandidates(entry.output, collected, entry.mime_type || entry.media_type, entrySeen, localVisited);
    collectImageCandidates(entry.images, collected, entry.mime_type || entry.media_type, entrySeen, localVisited);

    imageDebugLog('Collected image candidates from entry', {
      index: idx,
      candidateCount: collected.length,
      entryType: entry.type,
    });

    imageDebugLog('Collected image candidates', {
      index: idx,
      candidateCount: collected.length,
      candidatesPreview: collected.map((candidate, candidateIdx) => ({
        index: candidateIdx,
        mimeType: candidate.mimeType,
        prefix: typeof candidate.dataUrl === 'string' ? candidate.dataUrl.substring(0, 32) : null,
      })),
    });

    if (!collected.length) {
      return;
    }

    const prompt = extractPromptFromImageCall(entry) || extractPromptFromImageCall(responsePayload);
    const mode = detectImageCallMode(entry) || detectImageCallMode(responsePayload);
    const sourceLabel = determineSourceLabel(entry, mode);
    const callId = entry.id || responsePayload.id || undefined;

    collected.forEach((image, index) => {
      if (globalSeen.has(image.dataUrl)) {
        return;
      }
      globalSeen.add(image.dataUrl);

      const timestamp = new Date().toISOString();
      const mimeType = normaliseMimeType(image.mimeType);
      const extension = mimeType === 'image/jpeg' || mimeType === 'image/jpg'
        ? 'jpg'
        : (mimeType === 'image/webp' ? 'webp' : 'png');
      const randomChunk = Math.random().toString(36).substring(2, 10);
      const filenameBase = sourceLabel === 'image_edit' ? 'edited' : 'generated';
      const filename = `${filenameBase}-${Date.now()}-${randomChunk}-${index + 1}.${extension}`;
      const altText = prompt || (sourceLabel === 'image_edit' ? 'Edited image' : 'Generated image');
      const safeAlt = escapeHtmlAttribute(altText);
      const safePromptAttr = escapeHtmlAttribute(prompt);
      const html = `<img src="${image.dataUrl}" alt="${safeAlt}" class="generated-image-thumbnail" data-filename="${filename}" data-prompt="${safePromptAttr}" data-timestamp="${timestamp}" />`;

      window.currentGeneratedImageHtml.push(html);

      const record = {
        url: image.dataUrl,
        prompt: prompt || '',
        tool: sourceLabel,
        timestamp,
        filename,
        associatedMessageId: null,
        callId,
        mimeType,
        model: responsePayload.model || undefined,
        isStoredInDb: false,
      };

      window.generatedImages.push(record);

      if (window.imageDataCache && typeof window.imageDataCache.set === 'function') {
        window.imageDataCache.set(filename, image.dataUrl);
      }

      if (typeof window.saveImageToDb === 'function') {
        window.saveImageToDb(image.dataUrl, filename, {
          prompt: record.prompt,
          tool: record.tool,
          timestamp: record.timestamp,
          associatedMessageId: '',
          callId: record.callId || '',
          model: record.model || '',
          mimeType: record.mimeType,
        }).then(() => {
          record.isStoredInDb = true;
          imageDebugLog('Persisted generated image to IndexedDB', { filename });
        }).catch(error => {
          console.error('Failed to save generated image to storage:', error);
        });
      }
    });
  });

  imageDebugLog('currentGeneratedImageHtml snapshot', window.currentGeneratedImageHtml);
  imageDebugLog('generatedImages snapshot count', Array.isArray(window.generatedImages) ? window.generatedImages.length : 0);
}
