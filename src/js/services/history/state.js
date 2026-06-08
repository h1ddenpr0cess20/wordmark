import { elements, state } from "../../init/state.js";
import { saveConversationToDb } from "../../utils/conversationStorage.js";
import { appendMessage } from "../../components/ui/chatMessages.js";
import { updateHeaderInfo } from "../../components/settings.js";
import { config } from "../../../config/config.js";

export function updateBrowserHistory() {
  let systemPromptValue = '';
  let promptType = 'none';

  if (elements.personalityPromptRadio?.checked) {
    promptType = 'personality';
    systemPromptValue = elements.personalityInput?.value?.trim() || '';
  } else if (elements.customPromptRadio?.checked) {
    promptType = 'custom';
    systemPromptValue = elements.systemPromptCustom?.value || '';
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

  window.history.pushState(newHistoryState, 'Chat');
};

export function loadFromUrl() {
  if (!window.location.search) {
    return;
  }

  try {
    const urlParams = new URLSearchParams(window.location.search);
    if (!urlParams.has('chat')) {
      return;
    }

    const chatData = JSON.parse(decodeURIComponent(urlParams.get('chat')));
    state.conversationHistory = chatData.messages || [];

    (chatData.messages || []).forEach((msg) => {
      if (msg.role !== 'system') {
        appendMessage(msg.role === 'user' ? 'You' : '  ', msg.content, msg.role);
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
      model: chatData.model || elements.modelSelector?.value || 'Unknown',
      service: chatData.service || config?.defaultService || 'Unknown',
      systemPrompt: chatData.systemPrompt || {
        type: 'none',
        content: '',
      },
    };

    state.currentConversationId = conversation.id;
    state.currentConversationName = conversation.name;

    saveConversationToDb?.(conversation)
      .then((id) => {
        if (state.verboseLogging) {
          console.info('Saved URL-imported conversation to IndexedDB:', id);
        }
      })
      .catch((err) => {
        console.error('Failed to save URL-imported conversation to IndexedDB:', err);
      });
  } catch (error) {
    console.error('Error loading chat from URL:', error);
  }
};

