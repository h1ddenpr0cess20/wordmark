/**
 * Conversation URL state.
 *
 * @remarks
 * Syncs the active conversation id to the browser address bar and restores a
 * conversation from the URL on load.
 */

import { elements, state } from "../../init/state.ts";
import { saveConversationToDb } from "../../utils/conversationStorage.ts";
import { appendMessage } from "../../components/ui/chatMessages.ts";
import { updateHeaderInfo } from "../../components/settings.ts";
import { config } from "../../../config/config.ts";
import type { Message } from "../../../types/api.ts";

/**
 * Pushes the current conversation, model/service selection, and prompt settings
 * onto the browser history stack so back/forward navigation restores them.
 */
export function updateBrowserHistory() {
  let systemPromptValue = "";
  let promptType = "none";

  if (elements.personalityPromptRadio?.checked) {
    promptType = "personality";
    systemPromptValue = elements.personalityInput?.value?.trim() || "";
  } else if (elements.customPromptRadio?.checked) {
    promptType = "custom";
    systemPromptValue = elements.systemPromptCustom?.value || "";
  }

  const newHistoryState = {
    conversationHistory: [...(state.conversationHistory || [])],
    historyStateId: Date.now(),
    modelSelection: elements.modelSelector?.value,
    serviceSelection: elements.serviceSelector?.value,
    promptType,
    personalityValue: elements.personalityInput?.value,
    systemPrompt: systemPromptValue,
  };

  window.history.pushState(newHistoryState, "Chat");
};

/**
 * Imports a conversation from a `?chat=` URL parameter, rendering its messages,
 * restoring the model selection, and saving the imported conversation.
 */
export function loadFromUrl() {
  if (!window.location.search) {
    return;
  }

  try {
    const urlParams = new URLSearchParams(window.location.search);
    if (!urlParams.has("chat")) {
      return;
    }

    const chatData = JSON.parse(decodeURIComponent(urlParams.get("chat") || ""));
    state.conversationHistory = chatData.messages || [];

    (chatData.messages || []).forEach((msg: Message) => {
      if (msg.role !== "system") {
        const content = typeof msg.content === "string" ? msg.content : "";
        appendMessage(msg.role === "user" ? "You" : "  ", content, msg.role || "");
      }
    });

    if (chatData.model && elements.modelSelector) {
      const modelOption = Array.from(elements.modelSelector.options || []).find(
        option => option.value === chatData.model,
      );
      if (modelOption) {
        elements.modelSelector.value = chatData.model;
        updateHeaderInfo?.();
      }
    }

    const now = new Date();
    const conversation = {
      id: chatData.id || `url-import-${now.getTime()}`,
      name: chatData.name || `Imported Conversation ${now.toLocaleString()}`,
      created: chatData.created || now.toISOString(),
      updated: now.toISOString(),
      messages: state.conversationHistory,
      images: chatData.images || [],
      model: chatData.model || elements.modelSelector?.value || "Unknown",
      service: chatData.service || config?.defaultService || "Unknown",
      systemPrompt: chatData.systemPrompt || {
        type: "none",
        content: "",
      },
    };

    state.currentConversationId = conversation.id;
    state.currentConversationName = conversation.name;

    saveConversationToDb?.(conversation)
      .then((id) => {
        if (state.verboseLogging) {
          console.info("Saved URL-imported conversation to IndexedDB:", id);
        }
      })
      .catch((err) => {
        console.error("Failed to save URL-imported conversation to IndexedDB:", err);
      });
  } catch (error) {
    console.error("Error loading chat from URL:", error);
  }
};

