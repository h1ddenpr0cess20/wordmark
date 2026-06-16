/**
 * Conversation persistence.
 *
 * @remarks
 * Saves, renames, loads, and starts conversations, bridging the in-memory chat
 * state with the IndexedDB-backed store and the rendered transcript.
 */

import { elements, state } from "../../init/state.ts";
import {
  saveConversationToDb,
  loadConversationFromDb,
  renameConversationInDb,
} from "../../utils/storage/conversationStorage.ts";
import { config } from "../../../config/config.ts";
import { logVerbose } from "../../utils/logger.ts";
import { loadImageFromDb } from "../../utils/storage/imageStorage.ts";
import { ensureImagesHaveMessageIds } from "../streaming/imageGeneration.ts";
import { renderChatHistoryList } from "./list.ts";
import { renderConversationMessages } from "./render.ts";
import { processImageForStorage, markMessagesWithImages } from "./persistenceImages.ts";
import type { ConversationRecord } from "../../../types/common.ts";

/**
 * Resolves the system-prompt type and content to persist with a conversation,
 * preferring an already-loaded prompt and otherwise reading the selected
 * personality/custom radio inputs. Defaults to `{ type: "none", content: "" }`.
 */
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

/**
 * Resolves immediately; render-path libraries are bundled, not loaded at runtime.
 *
 * @remarks
 * `marked` and `highlight.js` are imported directly by the render path, so there
 * is nothing to load on demand. Retained as an async seam for callers that await
 * library readiness.
 */
function ensureLibrariesLoaded() {
  return Promise.resolve();
}

/**
 * Loads a conversation's DB-stored images into an in-memory cache before
 * rendering, so the transcript can resolve image placeholders synchronously.
 *
 * @param convo - The conversation whose `images` references are preloaded.
 * @returns A promise for a `filename -> data` cache; failures yield an empty map.
 */
function preloadImages(convo: ConversationRecord) {
  const imageLoadPromises: Promise<void>[] = [];
  const imageCache = new Map<string, string | Blob>();

  (Array.isArray(convo.images) ? convo.images : []).forEach((imgRef) => {
    const filename = imgRef.filename;
    if (imgRef.isStoredInDb && filename) {
      const loadPromise = loadImageFromDb?.(filename)
        .then((imageRecord) => {
          if (imageRecord?.data) {
            imageCache.set(filename, imageRecord.data);
            logVerbose(`Loaded image from IndexedDB: ${filename}`);
          }
        })
        .catch((err) => {
          console.warn(`Failed to load image ${filename} from IndexedDB:`, err);
        });

      if (loadPromise) {
        imageLoadPromises.push(loadPromise);
      }
    }
  });

  return Promise.all(imageLoadPromises).then(() => imageCache).catch((err) => {
    console.error("Error loading images from IndexedDB:", err);
    return new Map<string, string | Blob>();
  });
}

/**
 * Returns `messages` with developer-role entries (and nullish items) removed,
 * or an empty array when the input is not an array. Developer messages are
 * internal scaffolding that is never persisted or replayed.
 */
function withoutDeveloperMessages<T extends { role?: string }>(messages: T[] | null | undefined): T[] {
  return Array.isArray(messages) ? messages.filter(msg => msg && msg.role !== "developer") : [];
}

/** Clears the in-memory conversation state (history, images, ids, prompt, thinking). */
function resetConversationState() {
  state.conversationHistory = [];
  state.generatedImages = [];
  state.currentConversationId = null;
  state.currentConversationName = null;
  state.loadedSystemPrompt = null;
  state.userThinkingState = {};
}

/**
 * Persists the current conversation (messages, generated images, model, and
 * prompt state) to IndexedDB, creating an id on first save. Images are stored
 * separately and referenced by placeholder.
 *
 * @param meta - Optional name/created overrides for the saved record.
 */
export function saveCurrentConversation(meta: { name?: string; created?: string } = {}) {
  if (!state.generatedImages) {
    state.generatedImages = [];
  }

  const updatedCount = ensureImagesHaveMessageIds();
  if (updatedCount > 0) {
    logVerbose(`Associated ${updatedCount} images with messages before saving`);
  }

  const now = new Date();
  const baseHistory = withoutDeveloperMessages(state.conversationHistory);

  const { promptType, promptContent } = normalizePromptState();
  const savePromises: Promise<unknown>[] = [];
  const processedImages = (state.generatedImages || []).map(img => processImageForStorage(img, savePromises));
  const markedMessages = markMessagesWithImages(baseHistory, processedImages);

  const conversation: ConversationRecord = {
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

  if (state.activePartyConfig) {
    conversation.mode = "party";
    conversation.characters = state.activePartyConfig.characters;
    conversation.scenario = state.activePartyConfig.scenario;
    conversation.userName = state.activePartyConfig.userName;
  }

  state.currentConversationId = conversation.id ?? null;
  state.currentConversationName = conversation.name ?? null;

  Promise.all(savePromises)
    .then((results) => {
      if (results.length > 0) {
        logVerbose(`Saved ${results.filter(Boolean).length} images to IndexedDB`);
      }
    })
    .catch((err) => {
      console.error("Error saving images to IndexedDB:", err);
    });

  saveConversationToDb?.(conversation)
    .then((id) => {
      logVerbose("Saved conversation to IndexedDB:", id);
    })
    .catch((err) => {
      console.error("Failed to save conversation to IndexedDB:", err);
    });
};

/** Renames a stored conversation and refreshes the history list. */
export function renameConversation(id: string, newName: string) {
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

/**
 * Saves the current conversation (if any) and resets state for a fresh one,
 * optionally naming it.
 */
export function startNewConversation(name: string | null = null) {
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

  logVerbose("Started new conversation");
};

/**
 * Loads a stored conversation by id: preloads its images, then renders it into
 * the UI.
 *
 * @returns A promise resolving `false` if the conversation was not found.
 */
export function loadConversation(id: string) {
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

/**
 * Replaces the in-memory state with a loaded conversation (dropping developer
 * messages), clears the chat box, and renders the transcript with `imageCache`.
 *
 * @param convo - The loaded conversation record.
 * @param imageCache - Preloaded `filename -> data` map from {@link preloadImages}.
 */
function loadConversationIntoUI(convo: ConversationRecord, imageCache: Map<string, string | Blob>) {
  const filteredMessages = withoutDeveloperMessages(convo.messages);

  state.conversationHistory = filteredMessages;
  state.generatedImages = Array.isArray(convo.images) ? convo.images : [];
  state.currentConversationId = convo.id || null;
  state.currentConversationName = convo.name || null;
  state.loadedSystemPrompt = convo.systemPrompt || null;
  state.userThinkingState = {};

  if (convo.mode === "party" && Array.isArray(convo.characters)) {
    state.partyMode = true;
    state.activePartyConfig = {
      characters: convo.characters,
      scenario: convo.scenario || { topic: "", setting: "", mood: "friendly", conversationType: "conversation" },
      userName: convo.userName,
    };
  } else {
    state.partyMode = false;
    state.activePartyConfig = null;
  }

  if (elements.chatBox) {
    elements.chatBox.innerHTML = "";
  }

  renderConversationMessages(convo, imageCache);
}
