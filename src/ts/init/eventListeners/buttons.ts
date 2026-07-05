/**
 * Header and action button event listeners.
 *
 * @remarks
 * Wires the prompt-preset buttons (set personality, custom prompt, reset),
 * chat export controls, and the model-refresh button.
 */

import { elements } from "../state.ts";
import { icon } from "../../utils/icons.ts";
import { showInlineStatus } from "../../utils/inlineStatus.ts";
import { isMobileDevice, focusUserInputSafely } from "../../utils/dom/mobileHandling.ts";
import { exportChat, handleExportFormatChange } from "../../services/export.ts";
import { updateBrowserHistory } from "../../services/history/state.ts";
import { startNewConversation } from "../../services/history/persistence.ts";
import { updatePromptVisibility } from "../../components/ui/settingsControls.ts";
import { updateHeaderInfo, updateModelSelector, serviceStatusLabel } from "../../components/settings.ts";
import { closeSettingsPanelIfOpen } from "./settingsPanel.ts";
import { setReasoningEffort, DEFAULT_REASONING_EFFORT } from "../modelSettings.ts";
import { DEFAULT_PERSONALITY, config } from "../../../config/config.ts";

/** Wires header/action button click handlers (new conversation, clear, etc.). */
export function setupButtonEventListeners() {
  if (elements.clearMemoryButton) {
    elements.clearMemoryButton.addEventListener("click", () => {
      startNewConversation("New Conversation");
      updateHeaderInfo();
      updateBrowserHistory();
      if (!isMobileDevice() && elements.userInput) {
        elements.userInput.focus();
      }
    });
  }

  if (elements.setPersonalityButton) {
    elements.setPersonalityButton.addEventListener("click", () => {
      const personalityName = elements.personalityInput ? elements.personalityInput.value.trim() : "";
      startNewConversation(`Personality: ${personalityName}`);

      if (elements.personalityPromptRadio) {
        elements.personalityPromptRadio.checked = true;
      }
      if (elements.personalityInput) {
        elements.personalityInput.setAttribute("data-explicitly-set", "true");
      }

      updatePromptVisibility();

      closeSettingsPanelIfOpen();

      updateHeaderInfo();

      updateBrowserHistory();
      focusUserInputSafely();

    });
  }

  if (elements.exportChatButton) {
    elements.exportChatButton.addEventListener("click", exportChat);
  }
  if (elements.exportFormatSelector) {
    elements.exportFormatSelector.addEventListener("change", handleExportFormatChange);
  }

  if (elements.resetPersonalityButton) {
    elements.resetPersonalityButton.addEventListener("click", () => {
      startNewConversation("Default Personality");

      if (elements.personalityInput) {
        elements.personalityInput.value = DEFAULT_PERSONALITY;
        elements.personalityInput.setAttribute("data-explicitly-set", "true");
      }
      if (elements.personalityPromptRadio) {
        elements.personalityPromptRadio.checked = true;
      }

      updatePromptVisibility();
      updateHeaderInfo();

      closeSettingsPanelIfOpen();

      updateBrowserHistory();
      focusUserInputSafely();

    });
  }

  if (elements.setCustomPromptButton) {
    elements.setCustomPromptButton.addEventListener("click", () => {
      const customPrompt = elements.systemPromptCustom ? elements.systemPromptCustom.value.trim().substring(0, 30) : "";
      const conversationName = `Custom: ${customPrompt || "Prompt"}`;
      startNewConversation(conversationName);

      if (elements.customPromptRadio) {
        elements.customPromptRadio.checked = true;
      }
      updatePromptVisibility();

      closeSettingsPanelIfOpen();

      updateHeaderInfo();

      updateBrowserHistory();
      if (elements.userInput) {
        elements.userInput.focus();
      }
    });
  }

  if (elements.setNoPromptButton) {
    elements.setNoPromptButton.addEventListener("click", () => {
      startNewConversation("No System Prompt");

      if (elements.noPromptRadio) {
        elements.noPromptRadio.checked = true;
      }
      updatePromptVisibility();

      closeSettingsPanelIfOpen();

      updateHeaderInfo();

      updateBrowserHistory();
      if (elements.userInput) {
        elements.userInput.focus();
      }
    });
  }

  const resetModelSettingsButton = document.getElementById("reset-model-settings");
  if (resetModelSettingsButton) {
    resetModelSettingsButton.addEventListener("click", () => {
      setReasoningEffort(DEFAULT_REASONING_EFFORT || "medium");
    });
  }

  const refreshModelsButton = document.getElementById("refresh-models") as HTMLButtonElement | null;
  if (refreshModelsButton) {
    refreshModelsButton.addEventListener("click", async(event: Event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const serviceKey = config?.defaultService;
      const serviceConfig = serviceKey ? config?.services?.[serviceKey] : null;
      if (serviceConfig && typeof serviceConfig.fetchAndUpdateModels === "function") {
        const serviceLabel = serviceStatusLabel(serviceKey);
        refreshModelsButton.disabled = true;
        refreshModelsButton.innerHTML = icon("refresh-cw", { width: 16, height: 16, className: "rotating-svg" });

        try {
          await serviceConfig.fetchAndUpdateModels();
          updateModelSelector();

          const models = serviceConfig.models || [];
          const hasError = models.length === 0 || models.some((m: unknown) => typeof m === "string" && (m.startsWith("Error:") || m.startsWith("No models")));

          showInlineStatus(
            "service-status",
            [".model-selector-container", ".lmstudio-action-buttons"],
            hasError
              ? `Failed to refresh ${serviceLabel} models`
              : `${serviceLabel} models updated successfully!`,
            hasError ? "error" : "success",
          );
        } catch (error) {
          console.error(`Error refreshing ${serviceLabel} models:`, error);

          showInlineStatus(
            "service-status",
            [".model-selector-container", ".lmstudio-action-buttons"],
            `Failed to refresh ${serviceLabel} models`,
            "error",
          );
        } finally {
          refreshModelsButton.disabled = false;
          refreshModelsButton.innerHTML = icon("refresh-cw", { width: 16, height: 16 });
        }
      }
    });
  }
}
