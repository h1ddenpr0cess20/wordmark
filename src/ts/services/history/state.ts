/**
 * Conversation URL state.
 *
 * @remarks
 * Syncs the active conversation id to the browser address bar and restores a
 * conversation from the URL on load.
 */

import { elements, state } from "../../init/state.ts";
import { logVerbose } from "../../utils/logger.ts";
import { saveConversationToDb } from "../../utils/storage/conversationStorage.ts";
import { appendMessage } from "../../components/ui/chatMessages.ts";
import { updateHeaderInfo } from "../../components/settings.ts";
import { config } from "../../../config/config.ts";
import type { Message } from "../../../types/api.ts";

/**
 * Mirrors the current model/service selection and prompt settings onto the
 * browser history entry.
 *
 * @remarks
 * Uses `replaceState`, not `pushState`: nothing listens for `popstate`, so
 * pushing an entry per selection change or message only grew the history stack
 * and trapped the back button. The conversation itself is persisted to
 * IndexedDB, never to history state.
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
    historyStateId: Date.now(),
    modelSelection: elements.modelSelector?.value,
    serviceSelection: elements.serviceSelector?.value,
    promptType,
    personalityValue: elements.personalityInput?.value,
    systemPrompt: systemPromptValue,
  };

  window.history.replaceState(newHistoryState, "Chat");
};

/**
 * Imports a conversation from a `?chat=` URL parameter, rendering its messages,
 * restoring the model selection, and saving the imported conversation.
 *
 * @remarks
 * The URL is attacker-controllable (anyone can send a crafted link), so the
 * import is gated behind an explicit confirmation, only `user`/`assistant`
 * messages are accepted (no `system`/`developer` roles), and the imported
 * conversation never carries a system prompt.
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
    if (!chatData || typeof chatData !== "object") {
      return;
    }
    const messages: Message[] = (Array.isArray(chatData.messages) ? chatData.messages : [])
      .filter((msg: Message) => msg
        && (msg.role === "user" || msg.role === "assistant")
        && typeof msg.content === "string");

    if (messages.length === 0) {
      return;
    }

    const confirmed = window.confirm(
      "This link contains a shared conversation. Import it into your chat history?",
    );
    if (!confirmed) {
      return;
    }

    state.conversationHistory = messages;

    messages.forEach((msg: Message) => {
      appendMessage(msg.role === "user" ? "You" : "Assistant", msg.content as string, msg.role || "");
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
      id: `url-import-${now.getTime()}`,
      name: typeof chatData.name === "string" && chatData.name
        ? chatData.name
        : `Imported Conversation ${now.toLocaleString()}`,
      created: chatData.created || now.toISOString(),
      updated: now.toISOString(),
      messages: state.conversationHistory,
      images: chatData.images || [],
      model: chatData.model || elements.modelSelector?.value || "Unknown",
      service: chatData.service || config?.defaultService || "Unknown",
      systemPrompt: {
        type: "none",
        content: "",
      },
    };

    state.currentConversationId = conversation.id;
    state.currentConversationName = conversation.name;

    saveConversationToDb?.(conversation)
      .then((id) => {
        logVerbose("Saved URL-imported conversation to IndexedDB:", id);
      })
      .catch((err) => {
        console.error("Failed to save URL-imported conversation to IndexedDB:", err);
      });
  } catch (error) {
    console.error("Error loading chat from URL:", error);
  }
};

