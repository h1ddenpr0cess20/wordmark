window.initTabs = function() {
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
};

window.switchToTab = function(tabId) {
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
};

window.checkApiKeysMissing = function() {
  if (!window.config || !window.config.services) {
    return false;
  }

  const currentService = window.config.defaultService;
  if (currentService === 'lmstudio' || currentService === 'ollama') {
    return false;
  }

  const apiKey = typeof window.getApiKey === 'function' ? window.getApiKey(currentService) : null;
  return !apiKey || apiKey.trim() === '';
};

window.openApiKeysTabIfNeeded = function() {
  if (!window.checkApiKeysMissing()) {
    return;
  }

  if (typeof window.openSettingsAndSwitch === 'function') {
    window.openSettingsAndSwitch('tab-apikeys');
    if (window.VERBOSE_LOGGING) {
      console.info('Automatically opened API keys tab via helper due to missing API key');
    }
    return;
  }

  if (!window.settingsPanel || !window.settingsButton) {
    console.warn('Settings panel elements not found, cannot auto-open API keys tab');
    return;
  }

  window.settingsPanel.classList.add('active');
  window.settingsButton.setAttribute('aria-expanded', 'true');
  window.settingsPanel.setAttribute('aria-hidden', 'false');
  window.settingsPanel.removeAttribute('inert');
  window.settingsButton.style.display = 'none';
  if (window.historyButton) {
    window.historyButton.style.display = 'none';
  }
  if (window.galleryButton) {
    window.galleryButton.style.display = 'none';
  }

  window.switchToTab('tab-apikeys');

  if (typeof window.organizeSettingsLayout === 'function') {
    window.organizeSettingsLayout();
  }

  if (window.VERBOSE_LOGGING) {
    console.info('Automatically opened API keys tab due to missing API key');
  }
};
