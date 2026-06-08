import { elements } from "../state.js";
import { icon } from "../../utils/icons.js";
import { isMobileDevice, focusUserInputSafely } from "../../utils/mobileHandling.js";
import { exportChat, handleExportFormatChange } from "../../services/export.js";
import { updateBrowserHistory } from "../../services/history/state.js";
import { startNewConversation } from "../../services/history/persistence.js";
import { updatePromptVisibility } from "../../components/ui/settingsControls.js";
import { updateHeaderInfo, updateModelSelector } from "../../components/settings.js";
import { setReasoningEffort, DEFAULT_REASONING_EFFORT } from "../modelSettings.js";
import { DEFAULT_PERSONALITY, config } from "../../../config/config.js";
function closePanelIfActive(closeSettingsPanel) {
  if (typeof closeSettingsPanel === 'function' && elements.settingsPanel && elements.settingsPanel.classList.contains('active')) {
    closeSettingsPanel();
  } else if (elements.settingsPanel && elements.settingsButton) {
    elements.settingsPanel.classList.remove('active');
    elements.settingsButton.setAttribute('aria-expanded', 'false');
    elements.settingsPanel.setAttribute('aria-hidden', 'true');
    elements.settingsPanel.setAttribute('inert', 'true');
    elements.settingsButton.style.display = '';
    if (elements.historyButton) {
      elements.historyButton.style.display = '';
    }
    if (elements.galleryButton) {
      elements.galleryButton.style.display = '';
    }
  }
}

export function setupButtonEventListeners({ closeSettingsPanel } = {}) {
  if (elements.clearMemoryButton) {
    elements.clearMemoryButton.addEventListener('click', () => {
      startNewConversation('New Conversation');
      updateHeaderInfo();
      updateBrowserHistory();
      if (!isMobileDevice() && elements.userInput) {
        elements.userInput.focus();
      }
    });
  }

  if (elements.setPersonalityButton) {
    elements.setPersonalityButton.addEventListener('click', () => {
      const personalityName = elements.personalityInput ? elements.personalityInput.value.trim() : '';
      startNewConversation(`Personality: ${personalityName}`);

      if (elements.personalityPromptRadio) {
        elements.personalityPromptRadio.checked = true;
      }
      if (elements.personalityInput) {
        elements.personalityInput.setAttribute('data-explicitly-set', 'true');
      }

      updatePromptVisibility();

      closePanelIfActive(closeSettingsPanel);

                  updateHeaderInfo();
    
      updateBrowserHistory();
                  focusUserInputSafely();
    
    });
  }

  if (elements.exportChatButton) {
    elements.exportChatButton.addEventListener('click', exportChat);
  }
  if (elements.exportFormatSelector) {
    elements.exportFormatSelector.addEventListener('change', handleExportFormatChange);
  }

  if (elements.resetPersonalityButton) {
    elements.resetPersonalityButton.addEventListener('click', () => {
      startNewConversation('Default Personality');

      if (elements.personalityInput) {
        elements.personalityInput.value = DEFAULT_PERSONALITY;
        elements.personalityInput.setAttribute('data-explicitly-set', 'true');
      }
      if (elements.personalityPromptRadio) {
        elements.personalityPromptRadio.checked = true;
      }

      updatePromptVisibility();
                  updateHeaderInfo();
    

      closePanelIfActive(closeSettingsPanel);

      updateBrowserHistory();
                  focusUserInputSafely();
    
    });
  }

  if (elements.setCustomPromptButton) {
    elements.setCustomPromptButton.addEventListener('click', () => {
      const customPrompt = elements.systemPromptCustom ? elements.systemPromptCustom.value.trim().substring(0, 30) : '';
      const conversationName = `Custom: ${customPrompt || 'Prompt'}`;
      startNewConversation(conversationName);

      if (elements.customPromptRadio) {
        elements.customPromptRadio.checked = true;
      }
      updatePromptVisibility();

      closePanelIfActive(closeSettingsPanel);

                  updateHeaderInfo();
    
      updateBrowserHistory();
      if (elements.userInput) {
        elements.userInput.focus();
      }
    });
  }

  if (elements.setNoPromptButton) {
    elements.setNoPromptButton.addEventListener('click', () => {
      startNewConversation('No System Prompt');

      if (elements.noPromptRadio) {
        elements.noPromptRadio.checked = true;
      }
      updatePromptVisibility();

      closePanelIfActive(closeSettingsPanel);

                  updateHeaderInfo();
    
      updateBrowserHistory();
      if (elements.userInput) {
        elements.userInput.focus();
      }
    });
  }

  const resetModelSettingsButton = document.getElementById('reset-model-settings');
  if (resetModelSettingsButton) {
    resetModelSettingsButton.addEventListener('click', () => {
      setReasoningEffort(DEFAULT_REASONING_EFFORT || 'medium');
    });
  }

  const refreshModelsButton = document.getElementById('refresh-models');
  if (refreshModelsButton) {
    refreshModelsButton.addEventListener('click', async(event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const serviceKey = config?.defaultService;
      const serviceConfig = serviceKey ? config?.services?.[serviceKey] : null;
      if (serviceConfig && typeof serviceConfig.fetchAndUpdateModels === 'function') {
        const serviceLabelMap = { lmstudio: 'LM Studio', ollama: 'Ollama', openai: 'OpenAI', xai: 'xAI' };
        const serviceLabel = serviceLabelMap[serviceKey] || serviceKey;
        refreshModelsButton.disabled = true;
        refreshModelsButton.innerHTML = icon('refresh-cw', { width: 16, height: 16, className: 'rotating-svg' });

        try {
          await serviceConfig.fetchAndUpdateModels();
          updateModelSelector();

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
