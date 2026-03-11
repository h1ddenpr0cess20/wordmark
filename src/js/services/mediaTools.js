/**
 * Client-side media generation/editing tools for xAI Grok Imagine and OpenAI Sora.
 */

const XAI_IMAGE_MODEL = 'grok-imagine-image';
const XAI_VIDEO_MODEL = 'grok-imagine-video';
const OPENAI_VIDEO_MODEL = 'sora-2';

const XAI_IMAGE_ASPECT_RATIOS = [
  '1:1', '16:9', '9:16', '4:3', '3:4',
  '3:2', '2:3', '2:1', '1:2',
  '19.5:9', '9:19.5', '20:9', '9:20', 'auto',
];
const XAI_VIDEO_ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3'];
const XAI_VIDEO_RESOLUTIONS = ['480p', '720p'];
const OPENAI_SORA_SIZES = ['720x1280', '1280x720', '1024x1792', '1792x1024'];
const OPENAI_SORA_SECONDS = [4, 8, 12];

const VIDEO_POLL_INTERVAL_MS = 4000;
const VIDEO_POLL_TIMEOUT_MS = 8 * 60 * 1000;

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

function sleep(ms) {
  return new Promise(resolve => {
    window.setTimeout(resolve, ms);
  });
}

function getProviderBaseUrl(provider) {
  const baseUrl = window.config?.services?.[provider]?.baseUrl || '';
  if (!baseUrl) {
    throw new Error(`Base URL is not configured for ${provider}.`);
  }
  return baseUrl.replace(/\/+$/, '');
}

function getProviderApiKey(provider) {
  const apiKey = window.getApiKey?.(provider) || window.config?.services?.[provider]?.apiKey || '';
  const trimmed = typeof apiKey === 'string' ? apiKey.trim() : '';
  if (!trimmed) {
    const providerLabel = provider === 'xai' ? 'xAI' : provider === 'openai' ? 'OpenAI' : provider;
    throw new Error(`Add your ${providerLabel} API key in Settings → API Keys.`);
  }
  return trimmed;
}

function buildHeaders(provider, options = {}) {
  const { multipart = false } = options;
  const headers = {};
  const apiKey = getProviderApiKey(provider);
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  if (!multipart) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
}

function isVideoMimeType(mimeType = '') {
  return /^video\//i.test(mimeType);
}

function inferMimeTypeFromFilename(filename = '') {
  const lowered = String(filename || '').toLowerCase();
  if (lowered.endsWith('.mp4')) return 'video/mp4';
  if (lowered.endsWith('.mov')) return 'video/quicktime';
  if (lowered.endsWith('.webm')) return 'video/webm';
  if (lowered.endsWith('.m4v')) return 'video/mp4';
  if (lowered.endsWith('.jpg') || lowered.endsWith('.jpeg')) return 'image/jpeg';
  if (lowered.endsWith('.webp')) return 'image/webp';
  if (lowered.endsWith('.gif')) return 'image/gif';
  return 'image/png';
}

function detectMediaType(source = {}) {
  const explicitType = typeof source.mediaType === 'string' ? source.mediaType.trim().toLowerCase() : '';
  if (explicitType === 'video' || explicitType === 'image') {
    return explicitType;
  }

  const mimeType = typeof source.mimeType === 'string' ? source.mimeType : inferMimeTypeFromFilename(source.filename);
  if (isVideoMimeType(mimeType)) {
    return 'video';
  }

  const url = typeof source.url === 'string' ? source.url : '';
  if (url.startsWith('data:video/')) {
    return 'video';
  }

  return 'image';
}

function makeFilename(prefix, mimeType) {
  const mediaType = isVideoMimeType(mimeType) ? 'video' : 'image';
  const extension = (() => {
    if (mimeType === 'image/jpeg') return 'jpg';
    if (mimeType === 'image/webp') return 'webp';
    if (mimeType === 'image/gif') return 'gif';
    if (mimeType === 'video/webm') return 'webm';
    if (mimeType === 'video/quicktime') return 'mov';
    return mediaType === 'video' ? 'mp4' : 'png';
  })();
  const base = prefix || mediaType;
  return `${base}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
}

function buildMediaRecordHtml(record) {
  const mediaType = detectMediaType(record);
  const safeFilename = escapeHtmlAttribute(record.filename || '');
  const safePrompt = escapeHtmlAttribute(record.prompt || '');
  const safeTimestamp = escapeHtmlAttribute(record.timestamp || '');
  const safeAlt = escapeHtmlAttribute(record.prompt || (mediaType === 'video' ? 'Generated video' : 'Generated image'));
  const src = escapeHtmlAttribute(record.url || '');

  if (mediaType === 'video') {
    return `<video src="${src}" class="generated-video-thumbnail" data-media-type="video" data-filename="${safeFilename}" data-prompt="${safePrompt}" data-timestamp="${safeTimestamp}" controls playsinline preload="metadata"></video>`;
  }

  return `<img src="${src}" alt="${safeAlt}" class="generated-image-thumbnail" data-media-type="image" data-filename="${safeFilename}" data-prompt="${safePrompt}" data-timestamp="${safeTimestamp}" />`;
}

function createObjectUrl(value) {
  if (value instanceof Blob) {
    return URL.createObjectURL(value);
  }
  if (typeof value === 'string') {
    return value;
  }
  return '';
}

async function responseToJson(response) {
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`${response.status} ${response.statusText}${text ? `: ${text}` : ''}`);
  }
  return response.json();
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  return responseToJson(response);
}

async function fetchBlob(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`${response.status} ${response.statusText}${text ? `: ${text}` : ''}`);
  }
  return response.blob();
}

function decodeDataUri(reference) {
  const [header, encoded] = String(reference).split(',', 2);
  const mimeMatch = /^data:([^;]+)/i.exec(header || '');
  const mimeType = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const binary = window.atob(encoded || '');
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

async function referenceToBlob(reference, options = {}) {
  if (!reference) {
    throw new Error('Missing media reference.');
  }
  if (reference instanceof Blob) {
    return reference;
  }
  const referenceString = String(reference).trim();
  if (!referenceString) {
    throw new Error('Missing media reference.');
  }
  if (referenceString.startsWith('data:')) {
    return decodeDataUri(referenceString);
  }
  if (referenceString.startsWith('blob:')) {
    return fetchBlob(referenceString);
  }

  const { provider = null } = options;
  const requestOptions = {};
  if (provider && referenceString.startsWith(getProviderBaseUrl(provider))) {
    requestOptions.headers = buildHeaders(provider, { multipart: true });
  }
  return fetchBlob(referenceString, requestOptions);
}

function loadImageElementFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const imageUrl = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(imageUrl);
      resolve(image);
    };
    image.onerror = (error) => {
      URL.revokeObjectURL(imageUrl);
      reject(error);
    };
    image.src = imageUrl;
  });
}

function parseSize(size) {
  const [width, height] = String(size || '').split('x').map(value => Number.parseInt(value, 10));
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error(`Invalid size '${size}'.`);
  }
  return { width, height };
}

function chooseSoraSize(width, height, requestedSize) {
  if (requestedSize && OPENAI_SORA_SIZES.includes(requestedSize)) {
    return requestedSize;
  }
  const sourceRatio = width && height ? width / height : 1;
  return OPENAI_SORA_SIZES
    .map(size => {
      const parsed = parseSize(size);
      return {
        size,
        delta: Math.abs((parsed.width / parsed.height) - sourceRatio),
      };
    })
    .sort((a, b) => a.delta - b.delta)[0]?.size || OPENAI_SORA_SIZES[0];
}

async function canvasToBlob(canvas, type = 'image/png', quality = 0.92) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error('Failed to create blob from canvas.'));
        return;
      }
      resolve(blob);
    }, type, quality);
  });
}

async function prepareSoraReference(imageReference, requestedSize) {
  const sourceBlob = await referenceToBlob(imageReference);
  const image = await loadImageElementFromBlob(sourceBlob);
  const selectedSize = chooseSoraSize(image.naturalWidth || image.width, image.naturalHeight || image.height, requestedSize);
  const { width, height } = parseSize(selectedSize);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas 2D context is unavailable.');
  }

  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = width / height;

  let drawWidth = sourceWidth;
  let drawHeight = sourceHeight;
  let offsetX = 0;
  let offsetY = 0;

  if (sourceRatio > targetRatio) {
    drawWidth = sourceHeight * targetRatio;
    offsetX = (sourceWidth - drawWidth) / 2;
  } else if (sourceRatio < targetRatio) {
    drawHeight = sourceWidth / targetRatio;
    offsetY = (sourceHeight - drawHeight) / 2;
  }

  context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight, 0, 0, width, height);
  const pngBlob = await canvasToBlob(canvas, 'image/png');
  return {
    size: selectedSize,
    blob: pngBlob,
    filename: `input-reference-${Date.now()}.png`,
    mimeType: 'image/png',
  };
}

async function pollVideo(provider, requestId, onStatus) {
  const deadline = Date.now() + VIDEO_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const payload = await fetchJson(`${getProviderBaseUrl(provider)}/videos/${requestId}`, {
      headers: buildHeaders(provider, { multipart: true }),
    });
    const status = String(payload.status || '').trim().toLowerCase();
    if (typeof onStatus === 'function') {
      onStatus(status || 'pending');
    }
    if (['done', 'completed', 'succeeded', 'success'].includes(status) || typeof extractVideoUrl(payload) === 'string') {
      return payload;
    }
    if (['expired', 'failed', 'error', 'cancelled'].includes(status)) {
      throw new Error(`Video generation ended with status '${status}'.`);
    }
    await sleep(VIDEO_POLL_INTERVAL_MS);
  }
  throw new Error(`Timed out waiting for video generation request '${requestId}'.`);
}

function extractVideoUrl(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  if (typeof payload.url === 'string' && payload.url.trim()) {
    return payload.url.trim();
  }
  const keys = ['video', 'result', 'output'];
  for (const key of keys) {
    const candidate = payload[key];
    if (candidate && typeof candidate === 'object' && typeof candidate.url === 'string' && candidate.url.trim()) {
      return candidate.url.trim();
    }
  }
  return null;
}

function normalizeSeconds(seconds) {
  if (!Number.isFinite(seconds)) {
    return null;
  }
  return OPENAI_SORA_SECONDS.includes(seconds) ? seconds : OPENAI_SORA_SECONDS[0];
}

function normalizePrompt(args = {}) {
  const prompt = String(args.prompt || '').trim();
  if (!prompt) {
    throw new Error('A prompt is required.');
  }
  return prompt;
}

async function resolveStoredReference(record) {
  if (!record || !record.filename) {
    return null;
  }
  if (window.imageDataCache?.has(record.filename)) {
    const cached = window.imageDataCache.get(record.filename);
    if (cached) {
      return cached;
    }
  }
  try {
    const stored = await window.loadImageFromDb?.(record.filename);
    const displayUrl = window.getMediaDisplayUrl?.(stored?.data, record.filename) || '';
    if (displayUrl && window.imageDataCache?.set) {
      window.imageDataCache.set(record.filename, displayUrl);
    }
    return displayUrl || null;
  } catch (error) {
    console.warn('Failed to resolve stored media reference:', record.filename, error);
    return null;
  }
}

async function findLatestConversationImage() {
  const history = Array.isArray(window.conversationHistory) ? [...window.conversationHistory].reverse() : [];
  for (const message of history) {
    const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
    for (let index = attachments.length - 1; index >= 0; index -= 1) {
      const attachment = attachments[index];
      if (!attachment || attachment.type !== 'image') {
        continue;
      }
      if (typeof attachment.dataUrl === 'string' && attachment.dataUrl.trim()) {
        return attachment.dataUrl.trim();
      }
      if (typeof attachment.url === 'string' && attachment.url.trim()) {
        return attachment.url.trim();
      }
      if (attachment.filename) {
        const storedRef = await resolveStoredReference(attachment);
        if (storedRef) {
          return storedRef;
        }
      }
    }
  }
  return null;
}

async function findLatestGeneratedMedia(kind) {
  const media = Array.isArray(window.generatedImages) ? [...window.generatedImages].reverse() : [];
  for (const item of media) {
    if (!item) {
      continue;
    }
    const mediaType = detectMediaType(item);
    if (mediaType !== kind) {
      continue;
    }
    if (typeof item.url === 'string' && item.url.trim()) {
      return item.url.trim();
    }
    if (item.filename) {
      const storedRef = await resolveStoredReference(item);
      if (storedRef) {
        return storedRef;
      }
    }
  }
  return null;
}

async function resolveLatestMediaReference(kind) {
  const generated = await findLatestGeneratedMedia(kind);
  if (generated) {
    return generated;
  }
  if (kind === 'image') {
    return findLatestConversationImage();
  }
  return null;
}

function parseImageResponse(payload) {
  const candidates = Array.isArray(payload?.data) ? payload.data : [];
  return candidates
    .map(item => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      if (typeof item.b64_json === 'string' && item.b64_json.trim()) {
        const mimeType = item.mime_type || 'image/png';
        return {
          mimeType,
          url: `data:${mimeType};base64,${item.b64_json.trim()}`,
        };
      }
      if (typeof item.url === 'string' && item.url.trim()) {
        return {
          mimeType: item.mime_type || 'image/png',
          url: item.url.trim(),
        };
      }
      return null;
    })
    .filter(Boolean);
}

function notifyStatus(message) {
  if (window.VERBOSE_LOGGING) {
    console.info('[media-tools]', message);
  }
  if (typeof window.showInfo === 'function') {
    window.showInfo(message);
  }
}

window.isVideoMimeType = isVideoMimeType;
window.detectMediaType = detectMediaType;
window.getMediaDisplayUrl = function(value, filename = '') {
  if (!value) {
    return '';
  }
  if (value instanceof Blob) {
    const cacheKey = filename || `blob-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (window.imageDataCache?.has(cacheKey)) {
      return window.imageDataCache.get(cacheKey);
    }
    const objectUrl = createObjectUrl(value);
    if (window.imageDataCache?.set) {
      window.imageDataCache.set(cacheKey, objectUrl);
    }
    return objectUrl;
  }
  if (typeof value === 'string') {
    if (value.startsWith('data:') || value.startsWith('blob:') || /^https?:\/\//i.test(value) || value.startsWith('/')) {
      return value;
    }
    const mimeType = inferMimeTypeFromFilename(filename);
    return `data:${mimeType};base64,${value}`;
  }
  return '';
};

window.downloadMediaSource = async function(source, filename) {
  let blob = null;
  const remoteUrl = typeof source === 'string' && /^https?:\/\//i.test(source)
    ? source.trim()
    : '';

  if (source instanceof Blob) {
    blob = source;
  } else if (typeof source === 'string' && source.startsWith('data:')) {
    blob = decodeDataUri(source);
  } else if (typeof source === 'string' && source.startsWith('blob:')) {
    blob = await fetchBlob(source);
  } else if (remoteUrl) {
    try {
      blob = await fetchBlob(remoteUrl);
    } catch (error) {
      const anchor = document.createElement('a');
      anchor.href = remoteUrl;
      anchor.target = '_blank';
      anchor.rel = 'noopener';
      if (filename) {
        anchor.download = filename;
      }
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      return;
    }
  } else if (typeof source === 'string' && source.trim()) {
    blob = await fetchBlob(source.trim());
  } else {
    throw new Error('No downloadable media source was provided.');
  }

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename || makeFilename('media', blob.type || inferMimeTypeFromFilename(filename));
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 1000);
};

window.createGeneratedMediaHtml = buildMediaRecordHtml;
window.resolveLatestMediaReference = resolveLatestMediaReference;
window.getMediaToolInstructions = function() {
  return [
    'For Grok image edits or video generation/editing, if the user refers to the most recent uploaded or generated image/video, you may omit image_url, image_urls, or video_url.',
    'The runtime will automatically supply the latest available local image or video when a matching media tool is called without an explicit media URL.',
    'Never pass both image_url and video_url to the same video tool call.',
  ].join(' ');
};

window.registerGeneratedMedia = function({
  mediaType,
  sourceData,
  prompt = '',
  tool = '',
  filename,
  mimeType,
  associatedMessageId = null,
  callId = null,
  model = null,
  uploaded = false,
}) {
  const effectiveMimeType = mimeType || (sourceData instanceof Blob
    ? (sourceData.type || inferMimeTypeFromFilename(filename))
    : (typeof sourceData === 'string' && sourceData.startsWith('data:')
      ? String(sourceData).slice(5).split(';', 1)[0]
      : inferMimeTypeFromFilename(filename)));
  const effectiveMediaType = mediaType || (isVideoMimeType(effectiveMimeType) ? 'video' : 'image');
  const effectiveFilename = filename || makeFilename(effectiveMediaType === 'video' ? 'video' : 'generated', effectiveMimeType);
  const timestamp = new Date().toISOString();
  const displayUrl = window.getMediaDisplayUrl?.(sourceData, effectiveFilename) || createObjectUrl(sourceData);

  const record = {
    url: displayUrl,
    prompt: prompt || '',
    tool: tool || '',
    timestamp,
    filename: effectiveFilename,
    associatedMessageId,
    callId,
    mimeType: effectiveMimeType,
    mediaType: effectiveMediaType,
    model: model || undefined,
    uploaded: Boolean(uploaded),
    isStoredInDb: false,
    pendingStorageData: sourceData,
  };

  window.generatedImages = Array.isArray(window.generatedImages) ? window.generatedImages : [];
  window.currentGeneratedImageHtml = Array.isArray(window.currentGeneratedImageHtml) ? window.currentGeneratedImageHtml : [];
  window.generatedImages.push(record);
  window.currentGeneratedImageHtml.push(buildMediaRecordHtml(record));

  if (window.imageDataCache?.set && displayUrl) {
    window.imageDataCache.set(effectiveFilename, displayUrl);
  }

  if (typeof window.saveImageToDb === 'function') {
    window.saveImageToDb(sourceData, effectiveFilename, {
      prompt: record.prompt,
      tool: record.tool,
      timestamp: record.timestamp,
      associatedMessageId: record.associatedMessageId || '',
      callId: record.callId || '',
      model: record.model || '',
      mimeType: record.mimeType,
      mediaType: record.mediaType,
      uploaded: record.uploaded,
    }).then(() => {
      record.isStoredInDb = true;
      delete record.pendingStorageData;
    }).catch(error => {
      console.error('Failed to save generated media to storage:', error);
    });
  }

  return record;
};

// Grok Imagine image generation/editing commented out due to CORS issues
// async function generateGrokImage(args, mode) {
//   const prompt = normalizePrompt(args);
//   const provider = 'xai';
//   const endpoint = mode === 'edit' ? '/images/edits' : '/images/generations';
//   const payload = {
//     model: XAI_IMAGE_MODEL,
//     prompt,
//     n: Number.isFinite(Number(args.n)) ? Math.max(1, Math.min(10, Number(args.n))) : 1,
//     response_format: 'b64_json',
//   };
//
//   if (typeof args.aspect_ratio === 'string' && XAI_IMAGE_ASPECT_RATIOS.includes(args.aspect_ratio)) {
//     payload.aspect_ratio = args.aspect_ratio;
//   }
//   if (typeof args.resolution === 'string' && ['1k', '2k'].includes(args.resolution)) {
//     payload.resolution = args.resolution;
//   }
//
//   if (mode === 'edit') {
//     let imageUrls = Array.isArray(args.image_urls)
//       ? args.image_urls.filter(value => typeof value === 'string' && value.trim()).map(value => value.trim())
//       : [];
//     if (!imageUrls.length && typeof args.image_url === 'string' && args.image_url.trim()) {
//       imageUrls = [args.image_url.trim()];
//     }
//     if (!imageUrls.length) {
//       const latestImage = await resolveLatestMediaReference('image');
//       if (!latestImage) {
//         throw new Error('No source image is available for editing.');
//       }
//       imageUrls = [latestImage];
//     }
//     if (imageUrls.length === 1) {
//       payload.image = { type: 'image_url', url: imageUrls[0] };
//     } else {
//       payload.images = imageUrls.slice(0, 3).map(url => ({ type: 'image_url', url }));
//     }
//   }
//
//   const response = await fetchJson(`${getProviderBaseUrl(provider)}${endpoint}`, {
//     method: 'POST',
//     headers: buildHeaders(provider),
//     body: JSON.stringify(payload),
//   });
//
//   const images = parseImageResponse(response);
//   if (!images.length) {
//     throw new Error('The image API did not return any images.');
//   }
//
//   const records = images.map((image, index) => window.registerGeneratedMedia({
//     mediaType: 'image',
//     sourceData: image.url,
//     prompt,
//     tool: mode === 'edit' ? 'grok_edit_image' : 'grok_generate_image',
//     filename: makeFilename(mode === 'edit' ? 'edited' : 'generated', image.mimeType),
//     mimeType: image.mimeType,
//     model: XAI_IMAGE_MODEL,
//     callId: response.id || null,
//   }));
//
//   return {
//     ok: true,
//     backend: 'grok',
//     mediaType: 'image',
//     count: records.length,
//     filenames: records.map(record => record.filename),
//   };
// }

// Grok Imagine video generation commented out due to CORS issues
// async function generateGrokVideo(args) {
//   const prompt = normalizePrompt(args);
//   const provider = 'xai';
//   let imageUrl = typeof args.image_url === 'string' && args.image_url.trim() ? args.image_url.trim() : null;
//   let videoUrl = typeof args.video_url === 'string' && args.video_url.trim() ? args.video_url.trim() : null;
//
//   if (!imageUrl && !videoUrl) {
//     imageUrl = await resolveLatestMediaReference('image');
//     if (!imageUrl) {
//       videoUrl = await resolveLatestMediaReference('video');
//     }
//   }
//
//   if (imageUrl && videoUrl) {
//     throw new Error('Only one of image_url or video_url may be provided.');
//   }
//
//   const payload = {
//     model: XAI_VIDEO_MODEL,
//     prompt,
//   };
//   if (imageUrl) {
//     payload.image = { url: imageUrl };
//   }
//   if (videoUrl) {
//     payload.video_url = videoUrl;
//   } else {
//     if (Number.isFinite(Number(args.duration))) {
//       payload.duration = Math.max(1, Math.min(15, Number(args.duration)));
//     }
//     if (typeof args.aspect_ratio === 'string' && XAI_VIDEO_ASPECT_RATIOS.includes(args.aspect_ratio)) {
//       payload.aspect_ratio = args.aspect_ratio;
//     }
//     if (typeof args.resolution === 'string' && XAI_VIDEO_RESOLUTIONS.includes(args.resolution)) {
//       payload.resolution = args.resolution;
//     }
//   }
//
//   notifyStatus(imageUrl ? 'Animating image with Grok Imagine...' : videoUrl ? 'Editing video with Grok Imagine...' : 'Generating video with Grok Imagine...');
//
//   let created = await fetchJson(`${getProviderBaseUrl(provider)}/videos/generations`, {
//     method: 'POST',
//     headers: buildHeaders(provider),
//     body: JSON.stringify(payload),
//   });
//
//   const initialStatus = String(created.status || '').trim().toLowerCase();
//   if (!['done', 'completed', 'succeeded', 'success'].includes(initialStatus) && !extractVideoUrl(created)) {
//     const requestId = String(created.id || created.request_id || '').trim();
//     if (!requestId) {
//       throw new Error('Video generation did not return a request id.');
//     }
//     let lastStatus = '';
//     created = await pollVideo(provider, requestId, status => {
//       if (status !== lastStatus) {
//         lastStatus = status;
//         notifyStatus(`Generating video with Grok Imagine [${status}]`);
//       }
//     });
//   }
//
//   const directUrl = extractVideoUrl(created);
//   if (!directUrl) {
//     throw new Error('The video API did not return a downloadable video URL.');
//   }
//
//   const videoId = String(created.id || created.request_id || '').trim();
//   if (!videoId) {
//     throw new Error('Grok video response did not return a downloadable video id.');
//   }
//
//   notifyStatus('Downloading Grok Imagine video...');
//   const videoBlob = await fetchBlob(`${getProviderBaseUrl(provider)}/videos/${videoId}/content`, {
//     headers: buildHeaders(provider, { multipart: true }),
//   });
//
//   const record = window.registerGeneratedMedia({
//     mediaType: 'video',
//     sourceData: videoBlob,
//     prompt,
//     tool: 'grok_generate_video',
//     filename: makeFilename(videoUrl ? 'edited-video' : imageUrl ? 'animated-video' : 'generated-video', videoBlob.type || 'video/mp4'),
//     mimeType: videoBlob.type || 'video/mp4',
//     model: XAI_VIDEO_MODEL,
//     callId: videoId || null,
//   });
//
//   return {
//     ok: true,
//     backend: 'grok',
//     mediaType: 'video',
//     filename: record.filename,
//   };
// }

async function generateSoraVideo(args) {
  const prompt = normalizePrompt(args);
  const provider = 'openai';
  let imageUrl = typeof args.image_url === 'string' && args.image_url.trim() ? args.image_url.trim() : null;
  if (!imageUrl) {
    imageUrl = await resolveLatestMediaReference('image');
  }

  const seconds = normalizeSeconds(Number(args.seconds));
  const formData = new FormData();
  formData.append('model', OPENAI_VIDEO_MODEL);
  formData.append('prompt', prompt);
  if (seconds) {
    formData.append('seconds', String(seconds));
  }

  let selectedSize = typeof args.size === 'string' && OPENAI_SORA_SIZES.includes(args.size)
    ? args.size
    : null;

  if (imageUrl) {
    const prepared = await prepareSoraReference(imageUrl, selectedSize);
    selectedSize = prepared.size;
    formData.append('input_reference', prepared.blob, prepared.filename);
  }

  if (selectedSize) {
    formData.append('size', selectedSize);
  }

  notifyStatus(imageUrl ? 'Animating image with Sora...' : 'Generating video with Sora...');

  let created = await fetchJson(`${getProviderBaseUrl(provider)}/videos`, {
    method: 'POST',
    headers: buildHeaders(provider, { multipart: true }),
    body: formData,
  });

  const initialStatus = String(created.status || '').trim().toLowerCase();
  if (!['done', 'completed', 'succeeded', 'success'].includes(initialStatus)) {
    const requestId = String(created.id || '').trim();
    if (!requestId) {
      throw new Error('Sora did not return a request id.');
    }
    let lastStatus = '';
    created = await pollVideo(provider, requestId, status => {
      if (status !== lastStatus) {
        lastStatus = status;
        notifyStatus(`Generating video with Sora [${status}]`);
      }
    });
  }

  const videoId = String(created.id || '').trim();
  if (!videoId) {
    throw new Error('Sora did not return a downloadable video id.');
  }

  notifyStatus('Downloading Sora video...');
  const videoBlob = await fetchBlob(`${getProviderBaseUrl(provider)}/videos/${videoId}/content`, {
    headers: buildHeaders(provider, { multipart: true }),
  });
  const record = window.registerGeneratedMedia({
    mediaType: 'video',
    sourceData: videoBlob,
    prompt,
    tool: 'sora_generate_video',
    filename: makeFilename(imageUrl ? 'animated-video' : 'generated-video', videoBlob.type || 'video/mp4'),
    mimeType: videoBlob.type || 'video/mp4',
    model: OPENAI_VIDEO_MODEL,
    callId: videoId,
  });

  return {
    ok: true,
    backend: 'sora',
    mediaType: 'video',
    filename: record.filename,
  };
}

window.toolImplementations = window.toolImplementations || {};
// Grok Imagine tools commented out due to CORS issues
// window.toolImplementations.grok_generate_image = async function(args) {
//   return generateGrokImage(args || {}, 'generate');
// };
// window.toolImplementations.grok_edit_image = async function(args) {
//   return generateGrokImage(args || {}, 'edit');
// };
// window.toolImplementations.grok_generate_video = async function(args) {
//   return generateGrokVideo(args || {});
// };
window.toolImplementations.sora_generate_video = async function(args) {
  return generateSoraVideo(args || {});
};
