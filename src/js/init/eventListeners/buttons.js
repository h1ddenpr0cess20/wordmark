import { icon } from "../../utils/icons.js";
import { isMobileDevice, focusUserInputSafely } from "../../utils/mobileHandling.js";
import { exportChat, handleExportFormatChange } from "../../services/export.js";
import { updateBrowserHistory } from "../../services/history/state.js";
import { startNewConversation } from "../../services/history/persistence.js";
import { updatePromptVisibility } from "../../components/ui/settingsControls.js";
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
      startNewConversation('New Conversation');
      window.updateHeaderInfo();
      updateBrowserHistory();
      if (typeof isMobileDevice === 'function' && !isMobileDevice() && window.userInput) {
        window.userInput.focus();
      }
    });
  }

  if (window.setPersonalityButton) {
    window.setPersonalityButton.addEventListener('click', () => {
      const personalityName = window.personalityInput ? window.personalityInput.value.trim() : '';
      startNewConversation(`Personality: ${personalityName}`);

      if (window.personalityPromptRadio) {
        window.personalityPromptRadio.checked = true;
      }
      if (window.personalityInput) {
        window.personalityInput.setAttribute('data-explicitly-set', 'true');
      }

      updatePromptVisibility();

      closePanelIfActive(closeSettingsPanel);

      if (typeof window.updateHeaderInfo === 'function') {
        window.updateHeaderInfo();
      }
      updateBrowserHistory();
      if (typeof focusUserInputSafely === 'function') {
        focusUserInputSafely();
      }
    });
  }

  if (window.exportChatButton) {
    window.exportChatButton.addEventListener('click', exportChat);
  }
  if (window.exportFormatSelector && typeof handleExportFormatChange === 'function') {
    window.exportFormatSelector.addEventListener('change', handleExportFormatChange);
  }

  if (window.resetPersonalityButton) {
    window.resetPersonalityButton.addEventListener('click', () => {
      startNewConversation('Default Personality');

      if (window.personalityInput) {
        window.personalityInput.value = window.DEFAULT_PERSONALITY;
        window.personalityInput.setAttribute('data-explicitly-set', 'true');
      }
      if (window.personalityPromptRadio) {
        window.personalityPromptRadio.checked = true;
      }

      updatePromptVisibility();
      if (typeof window.updateHeaderInfo === 'function') {
        window.updateHeaderInfo();
      }

      closePanelIfActive(closeSettingsPanel);

      updateBrowserHistory();
      if (typeof focusUserInputSafely === 'function') {
        focusUserInputSafely();
      }
    });
  }

  if (window.setCustomPromptButton) {
    window.setCustomPromptButton.addEventListener('click', () => {
      const customPrompt = window.systemPromptCustom ? window.systemPromptCustom.value.trim().substring(0, 30) : '';
      const conversationName = `Custom: ${customPrompt || 'Prompt'}`;
      startNewConversation(conversationName);

      if (window.customPromptRadio) {
        window.customPromptRadio.checked = true;
      }
      updatePromptVisibility();

      closePanelIfActive(closeSettingsPanel);

      if (typeof window.updateHeaderInfo === 'function') {
        window.updateHeaderInfo();
      }
      updateBrowserHistory();
      if (window.userInput) {
        window.userInput.focus();
      }
    });
  }

  if (window.setNoPromptButton) {
    window.setNoPromptButton.addEventListener('click', () => {
      startNewConversation('No System Prompt');

      if (window.noPromptRadio) {
        window.noPromptRadio.checked = true;
      }
      updatePromptVisibility();

      closePanelIfActive(closeSettingsPanel);

      if (typeof window.updateHeaderInfo === 'function') {
        window.updateHeaderInfo();
      }
      updateBrowserHistory();
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

  const refreshModelsButton = document.getElementById('refresh-models');
  if (refreshModelsButton) {
    refreshModelsButton.addEventListener('click', async(event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const serviceKey = window.config?.defaultService;
      const serviceConfig = serviceKey ? window.config?.services?.[serviceKey] : null;
      if (serviceConfig && typeof serviceConfig.fetchAndUpdateModels === 'function') {
        const serviceLabelMap = { lmstudio: 'LM Studio', ollama: 'Ollama', openai: 'OpenAI', xai: 'xAI' };
        const serviceLabel = serviceLabelMap[serviceKey] || serviceKey;
        refreshModelsButton.disabled = true;
        refreshModelsButton.innerHTML = icon('refresh-cw', { width: 16, height: 16, className: 'rotating-svg' });

        try {
          await serviceConfig.fetchAndUpdateModels();
          window.updateModelSelector();

          const models = serviceConfig.models || [];
          const hasError = models.length === 0 || models.some(m => typeof m === 'string' && (m.startsWith('Error:') || m.startsWith('No models')));

          const existingStatus = document.querySelector('.service-status');
          if (existingStatus) {
            existingStatus.remove();
          }

          const statusElement = document.createElement('div');
          statusElement.className = hasError ? 'service-status error' : 'service-status success';
          statusElement.textContent = hasError
            ? `Failed to refresh ${serviceLabel} models`
            : `${serviceLabel} models updated successfully!`;

          const statusAnchor = document.querySelector('.model-selector-container') || document.querySelector('.lmstudio-action-buttons');
          if (statusAnchor) {
            statusAnchor.insertAdjacentElement('afterend', statusElement);
            setTimeout(() => statusElement.remove(), 5000);
          }
        } catch (error) {
          console.error(`Error refreshing ${serviceLabel} models:`, error);

          const existingStatus = document.querySelector('.service-status');
          if (existingStatus) {
            existingStatus.remove();
          }

          const statusElement = document.createElement('div');
          statusElement.className = 'service-status error';
          statusElement.textContent = `Failed to refresh ${serviceLabel} models`;

          const statusAnchor = document.querySelector('.model-selector-container') || document.querySelector('.lmstudio-action-buttons');
          if (statusAnchor) {
            statusAnchor.insertAdjacentElement('afterend', statusElement);
            setTimeout(() => statusElement.remove(), 5000);
          }
        } finally {
          refreshModelsButton.disabled = false;
          refreshModelsButton.innerHTML = icon('refresh-cw', { width: 16, height: 16 });
        }
      }
    });
  }
}
