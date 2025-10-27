window.updateBrowserHistory = function() {
  let systemPromptValue = '';
  let promptType = 'none';

  if (window.personalityPromptRadio?.checked) {
    promptType = 'personality';
    systemPromptValue = window.personalityInput?.value?.trim() || '';
  } else if (window.customPromptRadio?.checked) {
    promptType = 'custom';
    systemPromptValue = window.systemPromptCustom?.value || '';
  }

  const newHistoryState = {
    conversationHistory: [...(window.conversationHistory || [])],
    historyStateId: Date.now(),
    modelSelection: window.modelSelector?.value,
    serviceSelection: window.serviceSelector?.value,
    promptType,
    personalityValue: window.personalityInput?.value,
    systemPrompt: systemPromptValue,
  };

  window.history.pushState(newHistoryState, 'Chat');
};

window.loadFromUrl = function() {
  if (!window.location.search) {
    return;
  }

  try {
    const urlParams = new URLSearchParams(window.location.search);
    if (!urlParams.has('chat')) {
      return;
    }

    const chatData = JSON.parse(decodeURIComponent(urlParams.get('chat')));
    window.conversationHistory = chatData.messages || [];

    (chatData.messages || []).forEach((msg) => {
      if (msg.role !== 'system') {
        window.appendMessage?.(msg.role === 'user' ? 'You' : '  ', msg.content, msg.role);
      }
    });

    if (chatData.model && window.modelSelector) {
      const modelOption = Array.from(window.modelSelector.options || []).find(
        option => option.value === chatData.model,
      );
      if (modelOption) {
        window.modelSelector.value = chatData.model;
        window.updateHeaderInfo?.();
      }
    }

    const now = new Date();
    const conversation = {
      id: chatData.id || `url-import-${now.getTime()}`,
      name: chatData.name || `Imported Conversation ${now.toLocaleString()}`,
      created: chatData.created || now.toISOString(),
      updated: now.toISOString(),
      messages: window.conversationHistory,
      images: chatData.images || [],
      model: chatData.model || window.modelSelector?.value || 'Unknown',
      service: chatData.service || window.config?.defaultService || 'Unknown',
      systemPrompt: chatData.systemPrompt || {
        type: 'none',
        content: '',
      },
    };

    window.currentConversationId = conversation.id;
    window.currentConversationName = conversation.name;

    window.saveConversationToDb?.(conversation)
      .then((id) => {
        if (window.VERBOSE_LOGGING) {
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

