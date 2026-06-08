import { elements } from "../state.js";
import { debounce } from "../../utils/utils.js";
import { focusUserInputSafely } from "../../utils/mobileHandling.js";
import { updateBrowserHistory } from "../../services/history/state.js";
import { startNewConversation } from "../../services/history/persistence.js";
import { updatePromptVisibility } from "../../components/ui/settingsControls.js";
import { updateHeaderInfo } from "../../components/settings.js";

function setupPromptRadioEventListeners() {
  if (elements.personalityPromptRadio) {
    elements.personalityPromptRadio.addEventListener('change', () => {
      if (elements.personalityPromptRadio.checked) {
        updatePromptVisibility();
      }
    });
  }

  if (elements.customPromptRadio) {
    elements.customPromptRadio.addEventListener('change', () => {
      if (elements.customPromptRadio.checked) {
        updatePromptVisibility();
      }
    });
  }

  if (elements.noPromptRadio) {
    elements.noPromptRadio.addEventListener('change', () => {
      if (elements.noPromptRadio.checked) {
        updatePromptVisibility();
      }
    });
  }
}

function setupInputFieldEventListeners() {
  if (elements.personalityInput) {
    elements.personalityInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        if (elements.setPersonalityButton) {
          elements.setPersonalityButton.click();
        }
      }
    });

    elements.personalityInput.addEventListener('input', debounce(() => {}, 1000));
  }

  if (elements.systemPromptCustom) {
    elements.systemPromptCustom.addEventListener('input', debounce(() => {}, 1000));
  }
}

function setupPersonalityPresetEventListeners(closeSettingsPanel) {
  const presetButtons = document.querySelectorAll('.preset-button');

  presetButtons.forEach((button) => {
    const personality = button.getAttribute('data-personality');
    if (personality) {
      button.title = personality;
    }

    button.addEventListener('click', () => {
      if (!personality || !elements.personalityInput) {
        return;
      }

      startNewConversation(`Personality: ${personality}`);
      elements.personalityInput.value = personality;

      if (elements.personalityPromptRadio) {
        elements.personalityPromptRadio.checked = true;
      }
      elements.personalityInput.setAttribute('data-explicitly-set', 'true');

      updatePromptVisibility();

      if (typeof closeSettingsPanel === 'function') {
        closeSettingsPanel();
      } else if (elements.settingsPanel && elements.settingsPanel.classList.contains('active')) {
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

                  updateHeaderInfo();
    
      updateBrowserHistory();

                  focusUserInputSafely();
    
    });
  });
}

export function setupPromptEventListeners({ closeSettingsPanel } = {}) {
  setupPromptRadioEventListeners();
  setupInputFieldEventListeners();
  setupPersonalityPresetEventListeners(closeSettingsPanel);
}

