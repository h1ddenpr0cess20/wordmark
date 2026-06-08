import { elements } from "../state.js";
import { switchToTab } from "../../components/ui/settingsTabs.js";
import { updateHeaderInfo, organizeSettingsLayout } from "../../components/settings.js";

// Single settings panel — original prompt values are stashed here while the
// panel is open so they can be restored if the user dismisses without saving.
const panelState = {
  originalPersonalityValue: '',
  originalCustomPromptValue: '',
};

export function updatePanelOpenState() {
  const settingsOpen = Boolean(elements.settingsPanel && elements.settingsPanel.classList.contains('active'));
  const historyOpen = Boolean(elements.historyPanel && elements.historyPanel.getAttribute('aria-hidden') === 'false');
  const galleryOpen = Boolean(elements.galleryPanel && elements.galleryPanel.getAttribute('aria-hidden') === 'false');

  if (typeof document !== 'undefined') {
    document.body.classList.toggle('panel-open', settingsOpen || historyOpen || galleryOpen);
  }
}

function storeOriginalValues(state) {
  state.originalPersonalityValue = elements.personalityInput ? elements.personalityInput.value : '';
  state.originalCustomPromptValue = elements.systemPromptCustom ? elements.systemPromptCustom.value : '';
}

function restoreOriginalValues(state) {
  if (elements.personalityPromptRadio && elements.personalityPromptRadio.checked && elements.personalityInput) {
    elements.personalityInput.value = state.originalPersonalityValue;
    if (state.originalPersonalityValue === window.DEFAULT_PERSONALITY) {
      elements.personalityInput.setAttribute('data-explicitly-set', 'true');
    }
  }

  if (elements.customPromptRadio && elements.customPromptRadio.checked && elements.systemPromptCustom) {
    elements.systemPromptCustom.value = state.originalCustomPromptValue;
  }
}

function showSettingsPanel() {
  if (!elements.settingsPanel || !elements.settingsButton) {
    return;
  }
  elements.settingsPanel.classList.add('active');
  elements.settingsButton.setAttribute('aria-expanded', 'true');
  elements.settingsPanel.setAttribute('aria-hidden', 'false');
  elements.settingsPanel.removeAttribute('inert');
  elements.settingsButton.style.display = 'none';
  if (elements.historyButton) {
    elements.historyButton.style.display = 'none';
  }
  if (elements.galleryButton) {
    elements.galleryButton.style.display = 'none';
  }

  updatePanelOpenState();
}

function hideSettingsPanel({ focusButton = false } = {}) {
  if (!elements.settingsPanel || !elements.settingsButton) {
    return;
  }
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
  if (focusButton) {
    elements.settingsButton.focus();
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

    const isSettingsPanelElement = elements.settingsPanel && elements.settingsPanel.contains(event.target);
    const isSettingsButton = event.target === elements.settingsButton;

    if (elements.settingsPanel && elements.settingsPanel.classList.contains('active') &&
        !isSettingsPanelElement && !isSettingsButton) {
      restoreOriginalValues(state);
      hideSettingsPanel({ focusButton: true });
                  updateHeaderInfo();
    
    }

    if (!window.isSlideshowOpen &&
        elements.galleryPanel && elements.galleryPanel.getAttribute('aria-hidden') === 'false' &&
        !elements.galleryPanel.contains(event.target) && event.target !== elements.galleryButton) {
      elements.galleryPanel.setAttribute('aria-hidden', 'true');
      elements.galleryPanel.setAttribute('inert', 'true');
      elements.galleryButton.setAttribute('aria-expanded', 'false');
      elements.galleryButton.focus();
      updatePanelOpenState();
    }

    if (elements.historyPanel && elements.historyButton &&
        elements.historyPanel.getAttribute('aria-hidden') === 'false' &&
        !elements.historyPanel.contains(event.target) && event.target !== elements.historyButton) {
      elements.historyPanel.setAttribute('aria-hidden', 'true');
      elements.historyPanel.setAttribute('inert', 'true');
      elements.historyButton.setAttribute('aria-expanded', 'false');
      elements.historyButton.focus();
      updatePanelOpenState();
    }
  });
}

export function openSettingsAndSwitch(tabId, attempt = 0) {
  if (!elements.settingsPanel || !elements.settingsButton) {
    if (attempt < 10) {
      setTimeout(() => openSettingsAndSwitch(tabId, attempt + 1), 100);
    } else {
      console.warn('Settings panel not ready');
    }
    return;
  }

  storeOriginalValues(panelState);
  showSettingsPanel();

      organizeSettingsLayout();

  if (tabId) {
    setTimeout(() => switchToTab(tabId), 0);
  }
}

export function initializeSettingsPanelControls() {
  if (elements.settingsButton && elements.settingsPanel) {
    elements.settingsButton.addEventListener('click', () => {
      storeOriginalValues(panelState);
      showSettingsPanel();
                  organizeSettingsLayout();
    
    });
  }

  if (elements.closeSettingsButton && elements.settingsPanel) {
    elements.closeSettingsButton.addEventListener('click', () => {
      restoreOriginalValues(panelState);
      hideSettingsPanel({ focusButton: true });
                  updateHeaderInfo();
    
    });
  }

  setupQuickAccessTargets(openSettingsAndSwitch);
  setupOutsideClickHandler(panelState);

  return {
    closeSettingsPanel: ({ focusButton = false } = {}) => hideSettingsPanel({ focusButton }),
  };
}
