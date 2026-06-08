import { ensureApiKeysLoaded } from "../../services/apiKeys.js";
import { updateBrowserHistory } from "../../services/history/state.js";
import { responsesClient } from "../../services/api.js";
import { updateParameterControls } from "../../components/ui/settingsControls.js";
import { updateHeaderInfo, updateModelSelector } from "../../components/settings.js";
import { refreshToolSettingsUI } from "../../components/tools.js";
import { updateReasoningAvailability } from "../modelSettings.js";

export function setupSelectorEventListeners() {
  if (window.modelSelector) {
    window.modelSelector.addEventListener('change', () => {
      window.modelSelector.setAttribute('data-last-selected', window.modelSelector.value);
      if (typeof updateHeaderInfo === 'function') {
        updateHeaderInfo();
      }
      updateReasoningAvailability();
      updateBrowserHistory();
      if (typeof refreshToolSettingsUI === 'function') {
        refreshToolSettingsUI();
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

      if (typeof updateModelSelector === 'function') {
        updateModelSelector();
      }
      updateParameterControls();
      if (typeof updateHeaderInfo === 'function') {
        updateHeaderInfo();
      }
      updateReasoningAvailability();
      updateBrowserHistory();

      const refreshToolsUI = () => {
        if (typeof refreshToolSettingsUI === 'function') {
          refreshToolSettingsUI();
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
