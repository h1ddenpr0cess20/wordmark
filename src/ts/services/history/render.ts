import { elements, state } from "../../init/state.ts";
import { detectMediaType, getMediaDisplayUrl } from "../mediaTools.ts";
import { updateMessageContent } from "../streaming/messageLifecycle.ts";
import { updatePromptVisibility } from "../../components/ui/settingsControls.ts";
import { highlightAndAddCopyButtons, addMessageCopyButton } from "../../components/messages.ts";
import { appendMessage } from "../../components/ui/chatMessages.ts";
import { renderWordmarkLogo } from "../../components/logo.ts";
import { setupImageInteractions } from "../../components/ui/imageInteractions.ts";
import { updateHeaderInfo, updateModelSelector } from "../../components/settings.ts";
import { config } from "../../../config/config.ts";

function createMissingMediaPlaceholder(filename, mediaType = "image") {
  const label = mediaType === "video" ? "Video" : "Image";
  return `<div class='image-placeholder' style='padding:40px;background:#f1f1f1;border-radius:8px;margin:8px 0;text-align:center;font-style:italic;color:#666;'>${label} could not be loaded: ${filename}</div>`;
}

function findMediaRecord(convo, filename) {
  return (convo.images || []).find(imageRef => imageRef.filename === filename) || null;
}

function resolveMediaSource(mediaRecord, filename, imageCache) {
  if (!mediaRecord) {
    return "";
  }

  if (typeof mediaRecord.url === "string" && mediaRecord.url.trim()) {
    return mediaRecord.url;
  }

  if (mediaRecord.isStoredInDb && imageCache?.has(filename)) {
    return getMediaDisplayUrl(imageCache.get(filename), filename) || imageCache.get(filename);
  }

  return "";
}

function createMediaElement(mediaRecord, src, messageId = "") {
  const mediaType = detectMediaType(mediaRecord);

  if (mediaType === "video") {
    const videoEl = document.createElement("video");
    videoEl.src = src;
    videoEl.className = "generated-video-thumbnail";
    videoEl.controls = true;
    videoEl.playsInline = true;
    videoEl.preload = "metadata";
    videoEl.dataset.mediaType = "video";
    videoEl.dataset.filename = mediaRecord.filename || "";
    videoEl.dataset.messageId = messageId;
    videoEl.dataset.prompt = mediaRecord.prompt || "";
    videoEl.dataset.timestamp = mediaRecord.timestamp || "";
    return videoEl;
  }

  const imgEl = document.createElement("img");
  imgEl.src = src;
  imgEl.alt = mediaRecord.prompt || "Generated Image";
  imgEl.className = "generated-image-thumbnail";
  imgEl.dataset.mediaType = "image";
  imgEl.dataset.filename = mediaRecord.filename || "";
  imgEl.dataset.messageId = messageId;
  imgEl.dataset.prompt = mediaRecord.prompt || "";
  imgEl.dataset.timestamp = mediaRecord.timestamp || "";
  return imgEl;
}

function extractTextContent(content) {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    const part = content.find(p => p.type === "input_text" || p.type === "text");
    return part ? (part.text || part.content || "") : "";
  }
  return "";
}

function replaceImagePlaceholders(content, convo, imageCache) {
  const text = extractTextContent(content);
  if (!text) {
    return "";
  }

  return text.replace(/\[\[IMAGE: ([^\]]+)\]\]/g, (match, filename) => {
    const trimmed = filename.trim();
    const img = findMediaRecord(convo, trimmed);
    if (!img) {
      return createMissingMediaPlaceholder(trimmed, "image");
    }

    const src = resolveMediaSource(img, trimmed, imageCache);

    if (!src) {
      return createMissingMediaPlaceholder(trimmed, "image");
    }

    if (!img.url) {
      img.url = src;
    }
    if (state.imageDataCache?.set) {
      state.imageDataCache.set(trimmed, src);
    }

    return `<img src="${src}" alt="${img.prompt || "Generated Image"}" class="generated-image-thumbnail" data-media-type="image" data-filename="${trimmed}" data-prompt="${img.prompt || ""}" data-timestamp="${img.timestamp || ""}" style="max-width:160px;max-height:160px;border-radius:8px;margin:8px 0;cursor:pointer;" />`;
  });
}

export function renderConversationMessages(convo, imageCache) {
  if (!elements.chatBox) {
    return;
  }

  (convo.messages || []).forEach((msg) => {
    if (msg.role === "system" || msg.role === "developer") {
      return;
    }

    if (msg.role === "user") {
      const processed = replaceImagePlaceholders(msg.content, convo, imageCache);
      const userElement = appendMessage("You", processed, "user", true);
      if (userElement) {
        const messageId = msg.id || userElement.id;
        if (msg.id) {
          userElement.id = msg.id;
        }
        addMessageCopyButton(userElement, messageId);
      }
      return;
    }

    if (msg.role !== "assistant") {
      return;
    }

    const messageElement = document.createElement("div");
    messageElement.classList.add("message", "assistant");
    const messageId = msg.id || `msg-history-${Date.now()}`;
    messageElement.id = messageId;

    const sender = document.createElement("div");
    sender.className = "message-sender";
    sender.innerHTML = `
      <svg class="sender-icon assistant-icon" width="32" height="32" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <g stroke="var(--accent-color)" stroke-width="1"></g>
      </svg>
    `;

    const originalSelector = document.querySelector;
    document.querySelector = function(selector) {
      if (selector === "#wordmark-logo g") {
        return sender.querySelector("g") as any;
      }
      return originalSelector.call(document, selector);
    };

    try {
      renderWordmarkLogo();
    } finally {
      document.querySelector = originalSelector;
    }

    messageElement.appendChild(sender);

    const contentWrapper = document.createElement("div");
    contentWrapper.className = "message-content";
    messageElement.appendChild(contentWrapper);
    elements.chatBox.appendChild(messageElement);

    let displayContent = msg.content || "";
    const imageFilenames = [];
    const seenFilenames = new Set();
    const extractRegex = new RegExp("\\[\\[(?:MEDIA|IMAGE): ([^\\]]+)\\]\\]", "g");
    let match;

    while ((match = extractRegex.exec(displayContent)) !== null) {
      const trimmedFilename = match[1].trim();
      if (!seenFilenames.has(trimmedFilename)) {
        seenFilenames.add(trimmedFilename);
        imageFilenames.push(trimmedFilename);
      }
    }

    displayContent = displayContent.replace(new RegExp("\\[\\[(?:MEDIA|IMAGE): ([^\\]]+)\\]\\]", "g"), (placeholder) => `
      <span class="hidden-image-placeholder">${placeholder}</span>
    `);

    if (imageFilenames.length > 0) {
      const imagesContainer = document.createElement("div");
      imagesContainer.className = "generated-images";
      const imgHtmlArray = [];

      imageFilenames.forEach((filename) => {
        const img = findMediaRecord(convo, filename);
        if (!img) {
          const placeholder = document.createElement("div");
          placeholder.className = "image-placeholder";
          placeholder.textContent = `Media could not be loaded: ${filename}`;
          imagesContainer.appendChild(placeholder);
          return;
        }

        const src = resolveMediaSource(img, filename, imageCache);

        if (!src) {
          const placeholder = document.createElement("div");
          placeholder.className = "image-placeholder";
          placeholder.textContent = `Media could not be loaded: ${filename}`;
          imagesContainer.appendChild(placeholder);
          return;
        }

        const imgEl = createMediaElement(img, src, messageElement.id);

        if (!img.url) {
          img.url = src;
        }
        if (state.imageDataCache?.set) {
          state.imageDataCache.set(filename, src);
        }

        imagesContainer.appendChild(imgEl);
        imgHtmlArray.push(imgEl.outerHTML);
      });

      if (imagesContainer.childNodes.length > 0) {
        contentWrapper.appendChild(imagesContainer);
        if (!state.messageImages) {
          state.messageImages = {};
        }
        state.messageImages[messageElement.id] = imgHtmlArray;
      }
    }

    const reasoning = msg.reasoning || "";
    const contentObj = {
      content: displayContent,
      reasoning,
      codeInterpreterOutputs: msg.codeInterpreterOutputs || null,
    };

    updateMessageContent(messageElement, contentObj);
    highlightAndAddCopyButtons(messageElement);
    addMessageCopyButton(messageElement, messageId);
    setupImageInteractions(contentWrapper);
  });

  if (convo.systemPrompt) {
    const systemPrompt = convo.systemPrompt;
    state.loadedSystemPrompt = systemPrompt;

    if (systemPrompt.type === "personality" && elements.personalityPromptRadio) {
      elements.personalityPromptRadio.checked = true;
      if (elements.personalityInput) {
        elements.personalityInput.value = systemPrompt.content || "";
        elements.personalityInput.setAttribute("data-explicitly-set", "true");
      }
    } else if (systemPrompt.type === "custom" && elements.customPromptRadio) {
      elements.customPromptRadio.checked = true;
      if (elements.systemPromptCustom) {
        elements.systemPromptCustom.value = systemPrompt.content || "";
      }
    } else if (systemPrompt.type === "none" && elements.noPromptRadio) {
      elements.noPromptRadio.checked = true;
    }

    updatePromptVisibility();
  }

  if (convo.service && elements.serviceSelector && config) {
    const serviceOption = Array.from(elements.serviceSelector.options || []).find(
      option => option.value === convo.service,
    );

    if (serviceOption && !serviceOption.disabled) {
      config.defaultService = convo.service;
      elements.serviceSelector.value = convo.service;

      const serviceConfig = config.services?.[convo.service];
      if (serviceConfig && typeof serviceConfig.fetchAndUpdateModels === "function") {
        const serviceLabel = convo.service === "lmstudio"
          ? "LM Studio"
          : convo.service === "ollama"
            ? "Ollama"
            : convo.service;
        serviceConfig.fetchAndUpdateModels()
          .then(() => {
            updateModelSelector?.();
            if (convo.model && elements.modelSelector) {
              const modelOption = Array.from(elements.modelSelector.options || []).find(opt => opt.value === convo.model);
              if (modelOption) {
                elements.modelSelector.value = convo.model;
                updateHeaderInfo?.();
              }
            }
          })
          .catch((err) => {
            console.error(`Failed to refresh ${serviceLabel} models:`, err);
            updateModelSelector?.();
            if (convo.model && elements.modelSelector) {
              const modelOption = Array.from(elements.modelSelector.options || []).find(opt => opt.value === convo.model);
              if (modelOption) {
                elements.modelSelector.value = convo.model;
                updateHeaderInfo?.();
              }
            }
          });
      } else {
        updateModelSelector?.();
        if (convo.model && elements.modelSelector) {
          const modelOption = Array.from(elements.modelSelector.options || []).find(opt => opt.value === convo.model);
          if (modelOption) {
            elements.modelSelector.value = convo.model;
            updateHeaderInfo?.();
          }
        }
      }
    }
  }

  if (convo.model && elements.modelSelector) {
    const modelOption = Array.from(elements.modelSelector.options || []).find(option => option.value === convo.model);
    if (modelOption) {
      elements.modelSelector.value = convo.model;
      updateHeaderInfo?.();
    }
  }

  updateHeaderInfo?.();

  if (!convo.id) {
    state.loadedSystemPrompt = null;
  }
};
