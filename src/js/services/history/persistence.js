function processImageForStorage(img, savePromises) {
  const processedImg = { ...img };

  if (processedImg.url && processedImg.url.startsWith('data:image')) {
    try {
      if (!processedImg.filename) {
        const extension = processedImg.url.startsWith('data:image/jpeg') ? 'jpg' : 'png';
        processedImg.filename = `image-${Date.now()}-${Math.random().toString(36).substring(2, 10)}.${extension}`;
      }

      const savePromise = window.saveImageToDb?.(processedImg.url, processedImg.filename, {
        prompt: processedImg.prompt || '',
        tool: processedImg.tool || '',
        associatedMessageId: processedImg.associatedMessageId || '',
      }).catch((err) => {
        console.error('Failed to save image to IndexedDB:', err);
        return null;
      });

      if (savePromise) {
        savePromises.push(savePromise);
      }

      return {
        filename: processedImg.filename,
        prompt: processedImg.prompt || '',
        tool: processedImg.tool || '',
        timestamp: processedImg.timestamp || new Date().toISOString(),
        associatedMessageId: processedImg.associatedMessageId || '',
        isStoredInDb: true,
      };
    } catch (error) {
      console.error('Error processing image for storage:', error);
      return {
        filename: processedImg.filename || `fallback-${Date.now()}.png`,
        prompt: processedImg.prompt || '',
        timestamp: new Date().toISOString(),
        imageUnavailable: true,
        error: error.message,
      };
    }
  }

  return processedImg;
}

function markMessagesWithImages(baseHistory, processedImages) {
  return baseHistory.map((msg) => {
    const markedMsg = { ...msg };

    if (markedMsg.role === 'assistant') {
      const hasAssociatedImages = processedImages.some((img) => img.associatedMessageId === markedMsg.id);
      if (hasAssociatedImages) {
        markedMsg.hasImages = true;
        if (!markedMsg.id) {
          markedMsg.id = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
        }
      }
    }

    return markedMsg;
  });
}

function normalizePromptState() {
  let promptType = 'none';
  let promptContent = '';

  if (window.loadedSystemPrompt && window.currentConversationId) {
    promptType = window.loadedSystemPrompt.type;
    promptContent = window.loadedSystemPrompt.content;
  } else if (window.personalityPromptRadio?.checked) {
    promptType = 'personality';
    promptContent = window.personalityInput?.value || '';
  } else if (window.customPromptRadio?.checked) {
    promptType = 'custom';
    promptContent = window.systemPromptCustom?.value || '';
  }

  return { promptType, promptContent };
}

function ensureLibrariesLoaded() {
  const ensureHighlight = typeof hljs === 'undefined' && typeof window.loadHighlightJS === 'function'
    ? window.loadHighlightJS()
    : Promise.resolve();
  const ensureMarked = typeof marked === 'undefined' && typeof window.loadMarkedLibrary === 'function'
    ? window.loadMarkedLibrary()
    : Promise.resolve();

  return Promise.all([ensureHighlight, ensureMarked]);
}

function preloadImages(convo) {
  const imageLoadPromises = [];
  const imageCache = new Map();

  (convo.images || []).forEach((imgRef) => {
    if (imgRef.isStoredInDb && imgRef.filename) {
      const loadPromise = window.loadImageFromDb?.(imgRef.filename)
        .then((imageRecord) => {
          if (imageRecord?.data) {
            imageCache.set(imgRef.filename, imageRecord.data);
            if (window.VERBOSE_LOGGING) {
              console.info(`Loaded image from IndexedDB: ${imgRef.filename}`);
            }
          }
        })
        .catch((err) => {
          console.warn(`Failed to load image ${imgRef.filename} from IndexedDB:`, err);
        });

      if (loadPromise) {
        imageLoadPromises.push(loadPromise);
      }
    }
  });

  return Promise.all(imageLoadPromises).then(() => imageCache).catch((err) => {
    console.error('Error loading images from IndexedDB:', err);
    return new Map();
  });
}

function resetConversationState() {
  window.conversationHistory = [];
  window.generatedImages = [];
  window.currentConversationId = null;
  window.currentConversationName = null;
  window.loadedSystemPrompt = null;
  window.userThinkingState = {};
}

window.getAllConversations = function() {
  return window.getAllConversationsFromDb?.();
};

window.saveCurrentConversation = function(meta = {}) {
  if (!window.generatedImages) {
    window.generatedImages = [];
  }

  if (typeof window.ensureImagesHaveMessageIds === 'function') {
    const updatedCount = window.ensureImagesHaveMessageIds();
    if (window.VERBOSE_LOGGING && updatedCount > 0) {
      console.info(`Associated ${updatedCount} images with messages before saving`);
    }
  }

  const now = new Date();
  const baseHistory = Array.isArray(window.conversationHistory)
    ? window.conversationHistory.filter(msg => msg && msg.role !== 'developer')
    : [];

  const { promptType, promptContent } = normalizePromptState();
  const savePromises = [];
  const processedImages = (window.generatedImages || []).map(img => processImageForStorage(img, savePromises));
  const markedMessages = markMessagesWithImages(baseHistory, processedImages);

  const conversation = {
    id: window.currentConversationId || `${now.getTime()}`,
    name: meta.name || window.currentConversationName || `Conversation ${now.toLocaleString()}`,
    created: meta.created || now.toISOString(),
    updated: now.toISOString(),
    messages: markedMessages,
    images: processedImages,
    model: window.modelSelector?.value || 'Unknown',
    service: window.config?.defaultService || 'Unknown',
    systemPrompt: {
      type: promptType,
      content: promptContent,
    },
  };

  window.currentConversationId = conversation.id;
  window.currentConversationName = conversation.name;

  Promise.all(savePromises)
    .then((results) => {
      if (window.VERBOSE_LOGGING && results.length > 0) {
        console.info(`Saved ${results.filter(Boolean).length} images to IndexedDB`);
      }
    })
    .catch((err) => {
      console.error('Error saving images to IndexedDB:', err);
    });

  window.saveConversationToDb?.(conversation)
    .then((id) => {
      if (window.VERBOSE_LOGGING) {
        console.info('Saved conversation to IndexedDB:', id);
      }
    })
    .catch((err) => {
      console.error('Failed to save conversation to IndexedDB:', err);
    });
};

window.deleteConversation = function(id) {
  window.deleteConversationFromDb?.(id)
    .then(() => {
      if (window.currentConversationId === id) {
        window.currentConversationId = null;
        window.currentConversationName = null;
      }
      window.renderChatHistoryList?.();
    })
    .catch((err) => {
      console.error('Failed to delete conversation from IndexedDB:', err);
    });
};

window.renameConversation = function(id, newName) {
  window.renameConversationInDb?.(id, newName)
    .then(() => {
      if (window.currentConversationId === id) {
        window.currentConversationName = newName;
      }
      window.renderChatHistoryList?.();
    })
    .catch((err) => {
      console.error('Failed to rename conversation in IndexedDB:', err);
    });
};

window.startNewConversation = function(name = null) {
  if (window.conversationHistory?.length > 0 && window.currentConversationId) {
    window.saveCurrentConversation();
  }

  resetConversationState();

  if (name) {
    window.currentConversationName = name;
  }

  if (window.chatBox) {
    window.chatBox.innerHTML = '';
  }

  if (window.VERBOSE_LOGGING) {
    console.info('Started new conversation');
  }
};

window.loadConversation = function(id) {
  return window.loadConversationFromDb?.(id)
    .then((convo) => {
      if (!convo) {
        console.warn(`Conversation ${id} not found in IndexedDB`);
        return false;
      }

      return ensureLibrariesLoaded().then(() => preloadImages(convo)
        .then((imageCache) => {
          loadConversationIntoUI(convo, imageCache);
          return true;
        }));
    })
    .catch((err) => {
      console.error('Error loading conversation from IndexedDB:', err);
      return false;
    });
};

function loadConversationIntoUI(convo, imageCache) {
  const filteredMessages = Array.isArray(convo.messages)
    ? convo.messages.filter(msg => msg && msg.role !== 'developer')
    : [];

  window.conversationHistory = filteredMessages;
  window.generatedImages = convo.images || [];
  window.currentConversationId = convo.id;
  window.currentConversationName = convo.name;
  window.loadedSystemPrompt = convo.systemPrompt;
  window.userThinkingState = {};

  if (window.chatBox) {
    window.chatBox.innerHTML = '';
  }

  window.renderConversationMessages?.(convo, imageCache);
}

