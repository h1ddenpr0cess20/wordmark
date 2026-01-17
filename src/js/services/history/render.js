function replaceImagePlaceholders(content, convo, imageCache) {
  if (!content) {
    return '';
  }

  return content.replace(/\[\[IMAGE: ([^\]]+)\]\]/g, (match, filename) => {
    const trimmed = filename.trim();
    const img = (convo.images || []).find(imageRef => imageRef.filename === trimmed);
    if (!img) {
      return `<div class='image-placeholder' style='padding:40px;background:#f1f1f1;border-radius:8px;margin:8px 0;text-align:center;font-style:italic;color:#666;'>Image could not be loaded: ${trimmed}</div>`;
    }

    let src = '';
    if (img.url && img.url.startsWith('data:image')) {
      src = img.url;
    } else if (img.isStoredInDb && imageCache?.has(trimmed)) {
      src = imageCache.get(trimmed);
    }

    if (!src) {
      return `<div class='image-placeholder' style='padding:40px;background:#f1f1f1;border-radius:8px;margin:8px 0;text-align:center;font-style:italic;color:#666;'>Image could not be loaded: ${trimmed}</div>`;
    }

    if (!img.url) {
      img.url = src;
    }
    if (window.imageDataCache?.set) {
      window.imageDataCache.set(trimmed, src);
    }

    return `<img src="${src}" alt="${img.prompt || 'Generated Image'}" class="generated-image-thumbnail" data-filename="${trimmed}" data-prompt="${img.prompt || ''}" data-timestamp="${img.timestamp || ''}" style="max-width:160px;max-height:160px;border-radius:8px;margin:8px 0;cursor:pointer;" />`;
  });
}

window.renderConversationMessages = function(convo, imageCache) {
  if (!window.appendMessage || !window.chatBox) {
    return;
  }

  (convo.messages || []).forEach((msg) => {
    if (msg.role === 'system' || msg.role === 'developer') {
      return;
    }

    if (msg.role === 'user') {
      const processed = replaceImagePlaceholders(msg.content, convo, imageCache);
      const userElement = window.appendMessage('You', processed, 'user', true);
      if (userElement && window.addMessageCopyButton) {
        const messageId = msg.id || userElement.id;
        if (msg.id) {
          userElement.id = msg.id;
        }
        window.addMessageCopyButton(userElement, messageId);
      }
      return;
    }

    if (msg.role !== 'assistant') {
      return;
    }

    const messageElement = document.createElement('div');
    messageElement.classList.add('message', 'assistant');
    const messageId = msg.id || `msg-history-${Date.now()}`;
    messageElement.id = messageId;

    const sender = document.createElement('div');
    sender.className = 'message-sender';
    sender.innerHTML = `
      <svg class="sender-icon assistant-icon" width="32" height="32" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <g stroke="var(--accent-color)" stroke-width="1"></g>
      </svg>
    `;

    const originalSelector = document.querySelector;
    document.querySelector = function(selector) {
      if (selector === '#wordmark-logo g') {
        return sender.querySelector('g');
      }
      return originalSelector.call(document, selector);
    };

    window.renderWordmarkLogo?.();
    document.querySelector = originalSelector;

    messageElement.appendChild(sender);

    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'message-content';
    messageElement.appendChild(contentWrapper);
    window.chatBox.appendChild(messageElement);

    let displayContent = msg.content || '';
    const imageFilenames = [];
    const seenFilenames = new Set();
    const extractRegex = new RegExp('\\[\\[IMAGE: ([^\\]]+)\\]\\]', 'g');
    let match;

    while ((match = extractRegex.exec(displayContent)) !== null) {
      const trimmedFilename = match[1].trim();
      if (!seenFilenames.has(trimmedFilename)) {
        seenFilenames.add(trimmedFilename);
        imageFilenames.push(trimmedFilename);
      }
    }

    displayContent = displayContent.replace(new RegExp('\\[\\[IMAGE: ([^\\]]+)\\]\\]', 'g'), (placeholder) => `
      <span class="hidden-image-placeholder">${placeholder}</span>
    `);

    if (imageFilenames.length > 0) {
      const imagesContainer = document.createElement('div');
      imagesContainer.className = 'generated-images';
      const imgHtmlArray = [];

      imageFilenames.forEach((filename) => {
        const img = (convo.images || []).find(imageRef => imageRef.filename === filename);
        if (!img) {
          const placeholder = document.createElement('div');
          placeholder.className = 'image-placeholder';
          placeholder.textContent = `Image could not be loaded: ${filename}`;
          imagesContainer.appendChild(placeholder);
          return;
        }

        let src = '';
        if (img.url && img.url.startsWith('data:image')) {
          src = img.url;
        } else if (img.isStoredInDb && imageCache?.has(filename)) {
          src = imageCache.get(filename);
        }

        if (!src) {
          const placeholder = document.createElement('div');
          placeholder.className = 'image-placeholder';
          placeholder.textContent = `Image could not be loaded: ${filename}`;
          imagesContainer.appendChild(placeholder);
          return;
        }

        const imgEl = document.createElement('img');
        imgEl.src = src;
        imgEl.alt = img.prompt || 'Generated Image';
        imgEl.className = 'generated-image-thumbnail';
        imgEl.dataset.filename = filename;
        imgEl.dataset.messageId = messageElement.id;
        imgEl.dataset.prompt = img.prompt || '';
        imgEl.dataset.timestamp = img.timestamp || '';

        if (!img.url) {
          img.url = src;
        }
        if (window.imageDataCache?.set) {
          window.imageDataCache.set(filename, src);
        }

        imagesContainer.appendChild(imgEl);
        imgHtmlArray.push(imgEl.outerHTML);
      });

      if (imagesContainer.childNodes.length > 0) {
        contentWrapper.appendChild(imagesContainer);
        if (!window.messageImages) {
          window.messageImages = {};
        }
        window.messageImages[messageElement.id] = imgHtmlArray;
      }
    }

    const reasoning = msg.reasoning || '';
    const contentObj = {
      content: displayContent,
      reasoning,
      codeInterpreterOutputs: msg.codeInterpreterOutputs || null,
    };

    window.updateMessageContent?.(messageElement, contentObj);
    window.highlightAndAddCopyButtons?.(messageElement);
    window.addMessageCopyButton?.(messageElement, messageId);
    window.setupImageInteractions?.(contentWrapper);
  });

  if (convo.systemPrompt) {
    const systemPrompt = convo.systemPrompt;
    window.loadedSystemPrompt = systemPrompt;

    if (systemPrompt.type === 'personality' && window.personalityPromptRadio) {
      window.personalityPromptRadio.checked = true;
      if (window.personalityInput) {
        window.personalityInput.value = systemPrompt.content || '';
        window.personalityInput.setAttribute('data-explicitly-set', 'true');
      }
    } else if (systemPrompt.type === 'custom' && window.customPromptRadio) {
      window.customPromptRadio.checked = true;
      if (window.systemPromptCustom) {
        window.systemPromptCustom.value = systemPrompt.content || '';
      }
    } else if (systemPrompt.type === 'none' && window.noPromptRadio) {
      window.noPromptRadio.checked = true;
    }

    window.updatePromptVisibility?.();
  }

  if (convo.service && window.serviceSelector && window.config) {
    const serviceOption = Array.from(window.serviceSelector.options || []).find(
      option => option.value === convo.service,
    );

    if (serviceOption) {
      window.config.defaultService = convo.service;
      window.serviceSelector.value = convo.service;

      const serviceConfig = window.config.services?.[convo.service];
      if (serviceConfig && typeof serviceConfig.fetchAndUpdateModels === 'function') {
        const serviceLabel = convo.service === 'lmstudio'
          ? 'LM Studio'
          : convo.service === 'ollama'
            ? 'Ollama'
            : convo.service;
        serviceConfig.fetchAndUpdateModels()
          .then(() => {
            window.updateModelSelector?.();
            if (convo.model && window.modelSelector) {
              const modelOption = Array.from(window.modelSelector.options || []).find(opt => opt.value === convo.model);
              if (modelOption) {
                window.modelSelector.value = convo.model;
                window.updateHeaderInfo?.();
              }
            }
          })
          .catch((err) => {
            console.error(`Failed to refresh ${serviceLabel} models:`, err);
            window.updateModelSelector?.();
            if (convo.model && window.modelSelector) {
              const modelOption = Array.from(window.modelSelector.options || []).find(opt => opt.value === convo.model);
              if (modelOption) {
                window.modelSelector.value = convo.model;
                window.updateHeaderInfo?.();
              }
            }
          });
      } else {
        window.updateModelSelector?.();
        if (convo.model && window.modelSelector) {
          const modelOption = Array.from(window.modelSelector.options || []).find(opt => opt.value === convo.model);
          if (modelOption) {
            window.modelSelector.value = convo.model;
            window.updateHeaderInfo?.();
          }
        }
      }
    }
  }

  if (convo.model && window.modelSelector) {
    const modelOption = Array.from(window.modelSelector.options || []).find(option => option.value === convo.model);
    if (modelOption) {
      window.modelSelector.value = convo.model;
      window.updateHeaderInfo?.();
    }
  }

  window.updateHeaderInfo?.();

  if (!convo.id) {
    window.loadedSystemPrompt = null;
  }
};
