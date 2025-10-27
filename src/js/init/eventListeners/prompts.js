function setupPromptRadioEventListeners() {
  if (window.personalityPromptRadio) {
    window.personalityPromptRadio.addEventListener('change', () => {
      if (window.personalityPromptRadio.checked && typeof window.updatePromptVisibility === 'function') {
        window.updatePromptVisibility();
      }
    });
  }

  if (window.customPromptRadio) {
    window.customPromptRadio.addEventListener('change', () => {
      if (window.customPromptRadio.checked && typeof window.updatePromptVisibility === 'function') {
        window.updatePromptVisibility();
      }
    });
  }

  if (window.noPromptRadio) {
    window.noPromptRadio.addEventListener('change', () => {
      if (window.noPromptRadio.checked && typeof window.updatePromptVisibility === 'function') {
        window.updatePromptVisibility();
      }
    });
  }
}

function setupInputFieldEventListeners() {
  if (window.personalityInput) {
    window.personalityInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        if (window.setPersonalityButton) {
          window.setPersonalityButton.click();
        }
      }
    });

    window.personalityInput.addEventListener('input', window.debounce(() => {}, 1000));
  }

  if (window.systemPromptCustom) {
    window.systemPromptCustom.addEventListener('input', window.debounce(() => {}, 1000));
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
      if (!personality || !window.personalityInput) {
        return;
      }

      window.startNewConversation(`Personality: ${personality}`);
      window.personalityInput.value = personality;

      if (window.personalityPromptRadio) {
        window.personalityPromptRadio.checked = true;
      }
      window.personalityInput.setAttribute('data-explicitly-set', 'true');

      if (typeof window.updatePromptVisibility === 'function') {
        window.updatePromptVisibility();
      }

      if (typeof closeSettingsPanel === 'function') {
        closeSettingsPanel();
      } else if (window.settingsPanel && window.settingsPanel.classList.contains('active')) {
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

      if (typeof window.updateHeaderInfo === 'function') {
        window.updateHeaderInfo();
      }
      if (typeof window.updateBrowserHistory === 'function') {
        window.updateBrowserHistory();
      }

      if (typeof window.focusUserInputSafely === 'function') {
        window.focusUserInputSafely();
      } else if (window.userInput) {
        window.userInput.focus();
      }
    });
  });
}

export function setupPromptEventListeners({ closeSettingsPanel } = {}) {
  setupPromptRadioEventListeners();
  setupInputFieldEventListeners();
  setupPersonalityPresetEventListeners(closeSettingsPanel);
}

