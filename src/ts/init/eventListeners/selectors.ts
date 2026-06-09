import { elements } from "../state.ts";
import { ensureApiKeysLoaded } from "../../services/apiKeys.ts";
import { updateBrowserHistory } from "../../services/history/state.ts";
import { responsesClient } from "../../services/api.ts";
import { updateParameterControls } from "../../components/ui/settingsControls.ts";
import { updateHeaderInfo, updateModelSelector } from "../../components/settings.ts";
import { refreshToolSettingsUI } from "../../components/tools.ts";
import { updateReasoningAvailability } from "../modelSettings.ts";
import { config } from "../../../config/config.ts";

export function setupSelectorEventListeners() {
  const modelSelector = elements.modelSelector;
  if (modelSelector) {
    modelSelector.addEventListener("change", () => {
      modelSelector.setAttribute("data-last-selected", modelSelector.value);
      updateHeaderInfo();

      updateReasoningAvailability();
      updateBrowserHistory();
      refreshToolSettingsUI();

    });
  }

  const serviceSelector = elements.serviceSelector;
  if (serviceSelector) {
    serviceSelector.addEventListener("change", async() => {
      const selectedService = serviceSelector.value;
      if (config && typeof config.isServiceEnabled === "function" && !config.isServiceEnabled(selectedService)) {
        serviceSelector.value = config.normalizeServiceKey?.(config.defaultService) || "openai";
        return;
      }
      config.defaultService = selectedService;

      ensureApiKeysLoaded();

      const serviceConfig = config?.services?.[selectedService];
      if (serviceConfig && typeof serviceConfig.fetchAndUpdateModels === "function") {
        const serviceLabel = selectedService === "lmstudio"
          ? "LM Studio"
          : selectedService === "ollama"
            ? "Ollama"
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

      if (responsesClient && typeof responsesClient.refreshMcpAvailability === "function") {
        try {
          const maybePromise = responsesClient.refreshMcpAvailability(true);
          if (maybePromise && typeof maybePromise.then === "function") {
            maybePromise.then(refreshToolsUI).catch((error) => {
              console.warn("Failed to refresh MCP availability after service change:", error);
              refreshToolsUI();
            });
          } else {
            refreshToolsUI();
          }
        } catch (error) {
          console.warn("Failed to refresh MCP availability after service change:", error);
          refreshToolsUI();
        }
      } else {
        refreshToolsUI();
      }
    });
  }
}
