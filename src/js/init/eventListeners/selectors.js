import { elements } from "../state.js";
import { ensureApiKeysLoaded } from "../../services/apiKeys.js";
import { updateBrowserHistory } from "../../services/history/state.js";
import { responsesClient } from "../../services/api.js";
import { updateParameterControls } from "../../components/ui/settingsControls.js";
import { updateHeaderInfo, updateModelSelector } from "../../components/settings.js";
import { refreshToolSettingsUI } from "../../components/tools.js";
import { updateReasoningAvailability } from "../modelSettings.js";

export function setupSelectorEventListeners() {
  if (elements.modelSelector) {
    elements.modelSelector.addEventListener('change', () => {
      elements.modelSelector.setAttribute('data-last-selected', elements.modelSelector.value);
                  updateHeaderInfo();
    
      updateReasoningAvailability();
      updateBrowserHistory();
                  refreshToolSettingsUI();
    
    });
  }

  if (elements.serviceSelector) {
    elements.serviceSelector.addEventListener('change', async() => {
      const selectedService = elements.serviceSelector.value;
      if (window.config && typeof window.config.isServiceEnabled === 'function' && !window.config.isServiceEnabled(selectedService)) {
        elements.serviceSelector.value = window.config.normalizeServiceKey?.(window.config.defaultService) || 'openai';
        return;
      }
      window.config.defaultService = selectedService;

                  ensureApiKeysLoaded();
    

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

                  updateModelSelector();
    
      updateParameterControls();
                  updateHeaderInfo();
    
      updateReasoningAvailability();
      updateBrowserHistory();

      const refreshToolsUI = () => {
                        refreshToolSettingsUI();
      
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
