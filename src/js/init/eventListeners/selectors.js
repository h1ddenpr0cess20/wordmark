export function setupSelectorEventListeners() {
  if (window.modelSelector) {
    window.modelSelector.addEventListener('change', () => {
      window.modelSelector.setAttribute('data-last-selected', window.modelSelector.value);
      if (typeof window.updateHeaderInfo === 'function') {
        window.updateHeaderInfo();
      }
      if (typeof window.updateReasoningAvailability === 'function') {
        window.updateReasoningAvailability();
      }
      if (typeof window.updateBrowserHistory === 'function') {
        window.updateBrowserHistory();
      }
    });
  }

  if (window.serviceSelector) {
    window.serviceSelector.addEventListener('change', async() => {
      const selectedService = window.serviceSelector.value;
      window.config.defaultService = selectedService;

      if (typeof window.ensureApiKeysLoaded === 'function') {
        window.ensureApiKeysLoaded();
      }

      if (selectedService === 'lmstudio' &&
          window.config.services.lmstudio &&
          typeof window.config.services.lmstudio.fetchAndUpdateModels === 'function') {
        try {
          await window.config.services.lmstudio.fetchAndUpdateModels();
        } catch (error) {
          console.error('Failed to refresh LM Studio models:', error);
        }
      }

      if (typeof window.updateModelSelector === 'function') {
        window.updateModelSelector();
      }
      if (typeof window.updateParameterControls === 'function') {
        window.updateParameterControls();
      }
      if (typeof window.updateHeaderInfo === 'function') {
        window.updateHeaderInfo();
      }
      if (typeof window.updateReasoningAvailability === 'function') {
        window.updateReasoningAvailability();
      }
      if (typeof window.updateBrowserHistory === 'function') {
        window.updateBrowserHistory();
      }

      const refreshToolsUI = () => {
        if (typeof window.refreshToolSettingsUI === 'function') {
          window.refreshToolSettingsUI();
        }
      };

      if (window.responsesClient && typeof window.responsesClient.refreshMcpAvailability === 'function') {
        try {
          const maybePromise = window.responsesClient.refreshMcpAvailability(true);
          if (maybePromise && typeof maybePromise.then === 'function') {
            maybePromise.then(refreshToolsUI).catch((error) => {
              console.warn('Failed to refresh MCP availability after service change:', error);
              refreshToolsUI();
            });
          } else {
            refreshToolsUI();
          }
        } catch (error) {
          console.warn('Failed to refresh MCP availability after service change:', error);
          refreshToolsUI();
        }
      } else {
        refreshToolsUI();
      }
    });
  }
}

