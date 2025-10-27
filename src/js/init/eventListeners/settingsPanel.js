function updatePanelOpenState() {
  const settingsOpen = Boolean(window.settingsPanel && window.settingsPanel.classList.contains('active'));
  const historyOpen = Boolean(window.historyPanel && window.historyPanel.getAttribute('aria-hidden') === 'false');
  const galleryOpen = Boolean(window.galleryPanel && window.galleryPanel.getAttribute('aria-hidden') === 'false');

  if (typeof document !== 'undefined') {
    document.body.classList.toggle('panel-open', settingsOpen || historyOpen || galleryOpen);
  }
}

function storeOriginalValues(state) {
  state.originalPersonalityValue = window.personalityInput ? window.personalityInput.value : '';
  state.originalCustomPromptValue = window.systemPromptCustom ? window.systemPromptCustom.value : '';
}

function restoreOriginalValues(state) {
  if (window.personalityPromptRadio && window.personalityPromptRadio.checked && window.personalityInput) {
    window.personalityInput.value = state.originalPersonalityValue;
    if (state.originalPersonalityValue === window.DEFAULT_PERSONALITY) {
      window.personalityInput.setAttribute('data-explicitly-set', 'true');
    }
  }

  if (window.customPromptRadio && window.customPromptRadio.checked && window.systemPromptCustom) {
    window.systemPromptCustom.value = state.originalCustomPromptValue;
  }
}

function showSettingsPanel() {
  if (!window.settingsPanel || !window.settingsButton) {
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

  updatePanelOpenState();
}

function hideSettingsPanel({ focusButton = false } = {}) {
  if (!window.settingsPanel || !window.settingsButton) {
    return;
  }
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
  if (focusButton) {
    window.settingsButton.focus();
  }

  updatePanelOpenState();
}

function setupQuickAccessTargets(openSettingsAndSwitch) {
  const targets = [
    { selector: '#wordmark-logo', tabId: 'tab-about' },
    { selector: '#logo-wordmark', tabId: 'tab-about' },
    { selector: '#header-title', tabId: 'tab-model' },
    { selector: '#model-info', tabId: 'tab-personality' },
  ];

  targets.forEach(({ selector, tabId }) => {
    const element = document.getElementById(selector.replace('#', ''));
    if (element) {
      element.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.handled = true;
        openSettingsAndSwitch(tabId);
      });
    }
  });

  document.addEventListener('click', (event) => {
    const match = targets.find(({ selector }) => event.target.closest && event.target.closest(selector));
    if (!match) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.handled = true;
    openSettingsAndSwitch(match.tabId);
  }, true);
}

function setupOutsideClickHandler(state) {
  document.addEventListener('click', (event) => {
    if (window.VERBOSE_LOGGING && event.target.closest('.copy-address')) {
      console.info('Outside click handler - copy button detected:', {
        target: event.target,
        closest: event.target.closest('.copy-address'),
        defaultPrevented: event.defaultPrevented,
        cancelBubble: event.cancelBubble,
        handled: event.handled,
        timeStamp: event.timeStamp,
      });
    }

    if (event.defaultPrevented || event.cancelBubble || event.handled) {
      if (window.VERBOSE_LOGGING) {
        console.info('Outside click handler: event already handled/prevented');
      }
      return;
    }

    if (event.target.closest('.copy-address')) {
      if (window.VERBOSE_LOGGING) {
        console.info('Outside click handler: ignoring copy button click');
      }
      return;
    }

    const isSettingsPanelElement = window.settingsPanel && window.settingsPanel.contains(event.target);
    const isSettingsButton = event.target === window.settingsButton;

    if (window.settingsPanel && window.settingsPanel.classList.contains('active') &&
        !isSettingsPanelElement && !isSettingsButton) {
      restoreOriginalValues(state);
      hideSettingsPanel({ focusButton: true });
      if (typeof window.updateHeaderInfo === 'function') {
        window.updateHeaderInfo();
      }
    }

    if (!window.isSlideshowOpen &&
        window.galleryPanel && window.galleryPanel.getAttribute('aria-hidden') === 'false' &&
        !window.galleryPanel.contains(event.target) && event.target !== window.galleryButton) {
      window.galleryPanel.setAttribute('aria-hidden', 'true');
      window.galleryPanel.setAttribute('inert', 'true');
      window.galleryButton.setAttribute('aria-expanded', 'false');
      window.galleryButton.focus();
      updatePanelOpenState();
    }

    if (window.historyPanel && window.historyButton &&
        window.historyPanel.getAttribute('aria-hidden') === 'false' &&
        !window.historyPanel.contains(event.target) && event.target !== window.historyButton) {
      window.historyPanel.setAttribute('aria-hidden', 'true');
      window.historyPanel.setAttribute('inert', 'true');
      window.historyButton.setAttribute('aria-expanded', 'false');
      window.historyButton.focus();
      updatePanelOpenState();
    }
  });
}

export function initializeSettingsPanelControls() {
  const state = {
    originalPersonalityValue: '',
    originalCustomPromptValue: '',
  };

  function openSettingsAndSwitch(tabId, attempt = 0) {
    if (!window.settingsPanel || !window.settingsButton) {
      if (attempt < 10) {
        setTimeout(() => openSettingsAndSwitch(tabId, attempt + 1), 100);
      } else {
        console.warn('Settings panel not ready');
      }
      return;
    }

    storeOriginalValues(state);
    showSettingsPanel();

    if (typeof window.organizeSettingsLayout === 'function') {
      window.organizeSettingsLayout();
    }

    if (typeof window.switchToTab === 'function' && tabId) {
      setTimeout(() => window.switchToTab(tabId), 0);
    }
  }

  window.openSettingsAndSwitch = openSettingsAndSwitch;

  if (window.settingsButton && window.settingsPanel) {
    window.settingsButton.addEventListener('click', () => {
      storeOriginalValues(state);
      showSettingsPanel();
      if (typeof window.organizeSettingsLayout === 'function') {
        window.organizeSettingsLayout();
      }
    });
  }

  if (window.closeSettingsButton && window.settingsPanel) {
    window.closeSettingsButton.addEventListener('click', () => {
      restoreOriginalValues(state);
      hideSettingsPanel({ focusButton: true });
      if (typeof window.updateHeaderInfo === 'function') {
        window.updateHeaderInfo();
      }
    });
  }

  setupQuickAccessTargets(openSettingsAndSwitch);
  setupOutsideClickHandler(state);

  window.updatePanelOpenState = updatePanelOpenState;

  return {
    closeSettingsPanel: ({ focusButton = false } = {}) => hideSettingsPanel({ focusButton }),
  };
}
