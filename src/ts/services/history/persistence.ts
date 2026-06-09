import { elements, state } from "../../init/state.js";
import {
  getAllConversationsFromDb,
  saveConversationToDb,
  loadConversationFromDb,
  deleteConversationFromDb,
  renameConversationInDb,
} from "../../utils/conversationStorage.js";
import { config } from "../../../config/config.js";
import { saveImageToDb, loadImageFromDb } from "../../utils/imageStorage.js";
import { detectMediaType } from "../mediaTools.js";
import { ensureImagesHaveMessageIds } from "../streaming/imageGeneration.js";
import { renderChatHistoryList } from "./list.js";
import { renderConversationMessages } from "./render.js";

function processImageForStorage(img, savePromises) {
  const processedImg = { ...img };
  const mediaType = detectMediaType(processedImg);
  const mimeType = processedImg.mimeType
    || (typeof processedImg.url === "string" && processedImg.url.startsWith("data:")
      ? processedImg.url.slice(5).split(";", 1)[0]
      : (mediaType === "video" ? "video/mp4" : "image/png"));

  if (processedImg.isStoredInDb && processedImg.filename) {
    return {
      filename: processedImg.filename,
      prompt: processedImg.prompt || "",
      tool: processedImg.tool || "",
      timestamp: processedImg.timestamp || new Date().toISOString(),
      associatedMessageId: processedImg.associatedMessageId || "",
      isStoredInDb: true,
      mediaType,
      mimeType,
      uploaded: Boolean(processedImg.uploaded),
      callId: processedImg.callId || "",
      model: processedImg.model || "",
    };
  }

  if ((processedImg.url && processedImg.url.startsWith("data:")) || processedImg.pendingStorageData instanceof Blob) {
    try {
      if (!processedImg.filename) {
        const extension = mimeType === "image/jpeg"
          ? "jpg"
          : mimeType === "image/webp"
            ? "webp"
            : mimeType === "video/webm"
              ? "webm"
              : mimeType === "video/quicktime"
                ? "mov"
                : mediaType === "video"
                  ? "mp4"
                  : "png";
        const prefix = mediaType === "video" ? "video" : "image";
        processedImg.filename = `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 10)}.${extension}`;
      }

      const savePayload = processedImg.pendingStorageData instanceof Blob
        ? processedImg.pendingStorageData
        : processedImg.url;
      const savePromise = saveImageToDb?.(savePayload, processedImg.filename, {
        prompt: processedImg.prompt || "",
        tool: processedImg.tool || "",
        associatedMessageId: processedImg.associatedMessageId || "",
        mediaType,
        mimeType,
        uploaded: Boolean(processedImg.uploaded),
        callId: processedImg.callId || "",
        model: processedImg.model || "",
      }).catch((err) => {
        console.error("Failed to save image to IndexedDB:", err);
        return null;
      });

      if (savePromise) {
        savePromises.push(savePromise);
      }

      return {
        filename: processedImg.filename,
        prompt: processedImg.prompt || "",
        tool: processedImg.tool || "",
        timestamp: processedImg.timestamp || new Date().toISOString(),
        associatedMessageId: processedImg.associatedMessageId || "",
        isStoredInDb: true,
        mediaType,
        mimeType,
        uploaded: Boolean(processedImg.uploaded),
        callId: processedImg.callId || "",
        model: processedImg.model || "",
      };
    } catch (error) {
      console.error("Error processing image for storage:", error);
      return {
        filename: processedImg.filename || `fallback-${Date.now()}.${mediaType === "video" ? "mp4" : "png"}`,
        prompt: processedImg.prompt || "",
        timestamp: new Date().toISOString(),
        imageUnavailable: true,
        error: error.message,
        mediaType,
        mimeType,
      };
    }
  }

  return processedImg;
}

function markMessagesWithImages(baseHistory, processedImages) {
  return baseHistory.map((msg) => {
    const markedMsg = { ...msg };

    if (markedMsg.role === "assistant") {
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
  let promptType = "none";
  let promptContent = "";

  if (state.loadedSystemPrompt && state.currentConversationId) {
    promptType = state.loadedSystemPrompt.type;
    promptContent = state.loadedSystemPrompt.content;
  } else if (elements.personalityPromptRadio?.checked) {
    promptType = "personality";
    promptContent = elements.personalityInput?.value || "";
  } else if (elements.customPromptRadio?.checked) {
    promptType = "custom";
    promptContent = elements.systemPromptCustom?.value || "";
  }

  return { promptType, promptContent };
}

function ensureLibrariesLoaded() {
  // marked and highlight.js are bundled and imported directly by the render
  // path; nothing to load at runtime.
  return Promise.resolve();
}

function preloadImages(convo) {
  const imageLoadPromises = [];
  const imageCache = new Map();

  (convo.images || []).forEach((imgRef) => {
    if (imgRef.isStoredInDb && imgRef.filename) {
      const loadPromise = loadImageFromDb?.(imgRef.filename)
        .then((imageRecord) => {
          if (imageRecord?.data) {
            imageCache.set(imgRef.filename, imageRecord.data);
            if (state.verboseLogging) {
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
    console.error("Error loading images from IndexedDB:", err);
    return new Map();
  });
}

function resetConversationState() {
  state.conversationHistory = [];
  state.generatedImages = [];
  state.currentConversationId = null;
  state.currentConversationName = null;
  state.loadedSystemPrompt = null;
  state.userThinkingState = {};
}

export function getAllConversations() {
  return getAllConversationsFromDb?.();
};

export function saveCurrentConversation(meta: any = {}) {
  if (!state.generatedImages) {
    state.generatedImages = [];
  }

  const updatedCount = ensureImagesHaveMessageIds();
  if (state.verboseLogging && updatedCount > 0) {
    console.info(`Associated ${updatedCount} images with messages before saving`);
  }

  const now = new Date();
  const baseHistory = Array.isArray(state.conversationHistory)
    ? state.conversationHistory.filter(msg => msg && msg.role !== "developer")
    : [];

  const { promptType, promptContent } = normalizePromptState();
  const savePromises = [];
  const processedImages = (state.generatedImages || []).map(img => processImageForStorage(img, savePromises));
  const markedMessages = markMessagesWithImages(baseHistory, processedImages);

  const conversation = {
    id: state.currentConversationId || `${now.getTime()}`,
    name: meta.name || state.currentConversationName || `Conversation ${now.toLocaleString()}`,
    created: meta.created || now.toISOString(),
    updated: now.toISOString(),
    messages: markedMessages,
    images: processedImages,
    model: elements.modelSelector?.value || "Unknown",
    service: config?.defaultService || "Unknown",
    systemPrompt: {
      type: promptType,
      content: promptContent,
    },
  };

  state.currentConversationId = conversation.id;
  state.currentConversationName = conversation.name;

  Promise.all(savePromises)
    .then((results) => {
      if (state.verboseLogging && results.length > 0) {
        console.info(`Saved ${results.filter(Boolean).length} images to IndexedDB`);
      }
    })
    .catch((err) => {
      console.error("Error saving images to IndexedDB:", err);
    });

  saveConversationToDb?.(conversation)
    .then((id) => {
      if (state.verboseLogging) {
        console.info("Saved conversation to IndexedDB:", id);
      }
    })
    .catch((err) => {
      console.error("Failed to save conversation to IndexedDB:", err);
    });
};

export function deleteConversation(id) {
  deleteConversationFromDb?.(id)
    .then(() => {
      if (state.currentConversationId === id) {
        state.currentConversationId = null;
        state.currentConversationName = null;
      }
      renderChatHistoryList();
    })
    .catch((err) => {
      console.error("Failed to delete conversation from IndexedDB:", err);
    });
};

export function renameConversation(id, newName) {
  renameConversationInDb?.(id, newName)
    .then(() => {
      if (state.currentConversationId === id) {
        state.currentConversationName = newName;
      }
      renderChatHistoryList();
    })
    .catch((err) => {
      console.error("Failed to rename conversation in IndexedDB:", err);
    });
};

export function startNewConversation(name = null) {
  if (state.conversationHistory?.length > 0 && state.currentConversationId) {
    saveCurrentConversation();
  }

  resetConversationState();

  if (name) {
    state.currentConversationName = name;
  }

  if (elements.chatBox) {
    elements.chatBox.innerHTML = "";
  }

  if (state.verboseLogging) {
    console.info("Started new conversation");
  }
};

export function loadConversation(id) {
  return loadConversationFromDb?.(id)
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
      console.error("Error loading conversation from IndexedDB:", err);
      return false;
    });
};

function loadConversationIntoUI(convo, imageCache) {
  const filteredMessages = Array.isArray(convo.messages)
    ? convo.messages.filter(msg => msg && msg.role !== "developer")
    : [];

  state.conversationHistory = filteredMessages;
  state.generatedImages = convo.images || [];
  state.currentConversationId = convo.id;
  state.currentConversationName = convo.name;
  state.loadedSystemPrompt = convo.systemPrompt;
  state.userThinkingState = {};

  if (elements.chatBox) {
    elements.chatBox.innerHTML = "";
  }

  renderConversationMessages(convo, imageCache);
}
