import { getApiKey } from "../../services/apiKeys.js";
import { openSettingsAndSwitch } from "../../init/eventListeners/settingsPanel.js";
export function initTabs() {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');

  if (!tabButtons.length || !tabContents.length) {
    console.warn('Tab elements not found, skipping tab initialization');
    return;
  }

  tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      tabButtons.forEach((btn) => {
        btn.classList.remove('active');
        btn.setAttribute('aria-selected', 'false');
      });

      tabContents.forEach((content) => {
        content.classList.remove('active');
      });

      button.classList.add('active');
      button.setAttribute('aria-selected', 'true');

      const contentId = button.getAttribute('aria-controls');
      const content = document.getElementById(contentId);
      if (content) {
        content.classList.add('active');
      }
    });
  });
}

export function switchToTab(tabId) {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach((btn) => {
    btn.classList.remove('active');
    btn.setAttribute('aria-selected', 'false');
  });

  tabContents.forEach((content) => {
    content.classList.remove('active');
  });

  const targetButton = document.getElementById(tabId);
  const targetContentId = targetButton ? targetButton.getAttribute('aria-controls') : null;
  const targetContent = targetContentId ? document.getElementById(targetContentId) : null;

  if (targetButton && targetContent) {
    targetButton.classList.add('active');
    targetButton.setAttribute('aria-selected', 'true');
    targetContent.classList.add('active');
  }
}

function checkApiKeysMissing() {
  if (!window.config || !window.config.services) {
    return false;
  }

  const currentService = window.config.defaultService;
  if (currentService === 'lmstudio' || currentService === 'ollama') {
    return false;
  }

  const apiKey = typeof getApiKey === 'function' ? getApiKey(currentService) : null;
  return !apiKey || apiKey.trim() === '';
}

export function openApiKeysTabIfNeeded() {
  if (!checkApiKeysMissing()) {
    return;
  }

  openSettingsAndSwitch('tab-apikeys');
  if (window.VERBOSE_LOGGING) {
    console.info('Automatically opened API keys tab via helper due to missing API key');
  }
}
