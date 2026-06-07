import { ensureApiKeysLoaded } from "../../services/apiKeys.js";
import { updateBrowserHistory } from "../../services/history/state.js";
import { responsesClient } from "../../services/api.js";

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
      updateBrowserHistory();
      if (typeof window.refreshToolSettingsUI === 'function') {
        window.refreshToolSettingsUI();
      }
    });
  }

  if (window.serviceSelector) {
    window.serviceSelector.addEventListener('change', async() => {
      const selectedService = window.serviceSelector.value;
      if (window.config && typeof window.config.isServiceEnabled === 'function' && !window.config.isServiceEnabled(selectedService)) {
        window.serviceSelector.value = window.config.normalizeServiceKey?.(window.config.defaultService) || 'openai';
        return;
      }
      window.config.defaultService = selectedService;

      if (typeof ensureApiKeysLoaded === 'function') {
        ensureApiKeysLoaded();
      }

      const serviceConfig = window.config?.services?.[selectedService];
      if (serviceConfig && typeof serviceConfig.fetchAndUpdateModels === 'function') {
        const serviceLabel = selectedService === 'lmstudio'
          ? 'LM Studio'
          : selectedService === 'ollama'
            ? 'Ollama'
            : selectedService;
        try {
          await serviceConfig.fetchAndUpdateModels();
        } catch (error) {
          console.error(`Failed to refresh ${serviceLabel} models:`, error);
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
      updateBrowserHistory();

      const refreshToolsUI = () => {
        if (typeof window.refreshToolSettingsUI === 'function') {
          window.refreshToolSettingsUI();
        }
      };

      if (responsesClient && typeof responsesClient.refreshMcpAvailability === 'function') {
        try {
          const maybePromise = responsesClient.refreshMcpAvailability(true);
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
