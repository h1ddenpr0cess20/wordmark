function closePanelIfActive(closeSettingsPanel) {
  if (typeof closeSettingsPanel === 'function' && window.settingsPanel && window.settingsPanel.classList.contains('active')) {
    closeSettingsPanel();
  } else if (window.settingsPanel && window.settingsButton) {
    window.settingsPanel.classList.remove('active');
    window.settingsButton.setAttribute('aria-expanded', 'false');
    window.settingsPanel.setAttribute('aria-hidden', 'true');
    window.settingsPanel.setAttribute('inert', 'true');
    window.settingsButton.style.display = '';
    if (window.historyButton) {
      window.historyButton.style.display = '';
    }
    if (window.galleryButton) {
      window.galleryButton.style.display = '';
    }
  }
}

export function setupButtonEventListeners({ closeSettingsPanel } = {}) {
  if (window.clearMemoryButton) {
    window.clearMemoryButton.addEventListener('click', () => {
      window.startNewConversation('New Conversation');
      window.updateHeaderInfo();
      if (typeof window.updateBrowserHistory === 'function') {
        window.updateBrowserHistory();
      }
      if (typeof window.isMobileDevice === 'function' && !window.isMobileDevice() && window.userInput) {
        window.userInput.focus();
      }
    });
  }

  if (window.setPersonalityButton) {
    window.setPersonalityButton.addEventListener('click', () => {
      const personalityName = window.personalityInput ? window.personalityInput.value.trim() : '';
      window.startNewConversation(`Personality: ${personalityName}`);

      if (window.personalityPromptRadio) {
        window.personalityPromptRadio.checked = true;
      }
      if (window.personalityInput) {
        window.personalityInput.setAttribute('data-explicitly-set', 'true');
      }

      if (typeof window.updatePromptVisibility === 'function') {
        window.updatePromptVisibility();
      }

      closePanelIfActive(closeSettingsPanel);

      if (typeof window.updateHeaderInfo === 'function') {
        window.updateHeaderInfo();
      }
      if (typeof window.updateBrowserHistory === 'function') {
        window.updateBrowserHistory();
      }
      if (typeof window.focusUserInputSafely === 'function') {
        window.focusUserInputSafely();
      }
    });
  }

  if (window.exportChatButton) {
    window.exportChatButton.addEventListener('click', window.exportChat);
  }
  if (window.exportFormatSelector && typeof window.handleExportFormatChange === 'function') {
    window.exportFormatSelector.addEventListener('change', window.handleExportFormatChange);
  }

  if (window.resetPersonalityButton) {
    window.resetPersonalityButton.addEventListener('click', () => {
      window.startNewConversation('Default Personality');

      if (window.personalityInput) {
        window.personalityInput.value = window.DEFAULT_PERSONALITY;
        window.personalityInput.setAttribute('data-explicitly-set', 'true');
      }
      if (window.personalityPromptRadio) {
        window.personalityPromptRadio.checked = true;
      }

      if (typeof window.updatePromptVisibility === 'function') {
        window.updatePromptVisibility();
      }
      if (typeof window.updateHeaderInfo === 'function') {
        window.updateHeaderInfo();
      }

      closePanelIfActive(closeSettingsPanel);

      if (typeof window.updateBrowserHistory === 'function') {
        window.updateBrowserHistory();
      }
      if (typeof window.focusUserInputSafely === 'function') {
        window.focusUserInputSafely();
      }
    });
  }

  if (window.setCustomPromptButton) {
    window.setCustomPromptButton.addEventListener('click', () => {
      const customPrompt = window.systemPromptCustom ? window.systemPromptCustom.value.trim().substring(0, 30) : '';
      const conversationName = `Custom: ${customPrompt || 'Prompt'}`;
      window.startNewConversation(conversationName);

      if (window.customPromptRadio) {
        window.customPromptRadio.checked = true;
      }
      if (typeof window.updatePromptVisibility === 'function') {
        window.updatePromptVisibility();
      }

      closePanelIfActive(closeSettingsPanel);

      if (typeof window.updateHeaderInfo === 'function') {
        window.updateHeaderInfo();
      }
      if (typeof window.updateBrowserHistory === 'function') {
        window.updateBrowserHistory();
      }
      if (window.userInput) {
        window.userInput.focus();
      }
    });
  }

  if (window.setNoPromptButton) {
    window.setNoPromptButton.addEventListener('click', () => {
      window.startNewConversation('No System Prompt');

      if (window.noPromptRadio) {
        window.noPromptRadio.checked = true;
      }
      if (typeof window.updatePromptVisibility === 'function') {
        window.updatePromptVisibility();
      }

      closePanelIfActive(closeSettingsPanel);

      if (typeof window.updateHeaderInfo === 'function') {
        window.updateHeaderInfo();
      }
      if (typeof window.updateBrowserHistory === 'function') {
        window.updateBrowserHistory();
      }
      if (window.userInput) {
        window.userInput.focus();
      }
    });
  }

  const resetModelSettingsButton = document.getElementById('reset-model-settings');
  if (resetModelSettingsButton) {
    resetModelSettingsButton.addEventListener('click', () => {
      if (typeof window.setReasoningEffort === 'function') {
        window.setReasoningEffort(window.DEFAULT_REASONING_EFFORT || 'medium');
      }
    });
  }

  const refreshLmStudioModelsButton = document.getElementById('refresh-lmstudio-models');
  if (refreshLmStudioModelsButton) {
    refreshLmStudioModelsButton.addEventListener('click', async(event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const serviceKey = window.config?.defaultService;
      const serviceConfig = serviceKey ? window.config?.services?.[serviceKey] : null;
      if (serviceConfig && typeof serviceConfig.fetchAndUpdateModels === 'function') {
        const serviceLabel = serviceKey === 'lmstudio'
          ? 'LM Studio'
          : serviceKey === 'ollama'
            ? 'Ollama'
            : 'Local';
        refreshLmStudioModelsButton.disabled = true;
        refreshLmStudioModelsButton.innerHTML = window.icon('refresh-cw', { width: 16, height: 16, className: 'rotating-svg' });

        try {
          await serviceConfig.fetchAndUpdateModels();
          window.updateModelSelector();

          const existingStatus = document.querySelector('.lmstudio-status');
          if (existingStatus) {
            existingStatus.remove();
          }

          const statusElement = document.createElement('div');
          statusElement.className = 'lmstudio-status success';
          statusElement.textContent = `${serviceLabel} models updated successfully!`;

          const statusAnchor = document.querySelector('.model-selector-container') || document.querySelector('.lmstudio-action-buttons');
          if (statusAnchor) {
            statusAnchor.insertAdjacentElement('afterend', statusElement);
            setTimeout(() => statusElement.remove(), 5000);
          }
        } catch (error) {
          console.error(`Error refreshing ${serviceLabel} models:`, error);

          const existingStatus = document.querySelector('.lmstudio-status');
          if (existingStatus) {
            existingStatus.remove();
          }

          const statusElement = document.createElement('div');
          statusElement.className = 'lmstudio-status error';
          statusElement.textContent = `Failed to refresh ${serviceLabel} models`;

          const statusAnchor = document.querySelector('.model-selector-container') || document.querySelector('.lmstudio-action-buttons');
          if (statusAnchor) {
            statusAnchor.insertAdjacentElement('afterend', statusElement);
            setTimeout(() => statusElement.remove(), 5000);
          }
        } finally {
          refreshLmStudioModelsButton.disabled = false;
          refreshLmStudioModelsButton.innerHTML = window.icon('refresh-cw', { width: 16, height: 16 });
        }
      }
    });
  }
}
