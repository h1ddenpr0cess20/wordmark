/**
 * System-prompt event listeners.
 *
 * @remarks
 * Wires the prompt-mode radios, the personality and custom-prompt input fields,
 * and the personality preset buttons.
 */

import { elements } from "../state.ts";
import { debounce } from "../../utils/utils.ts";
import { focusUserInputSafely } from "../../utils/dom/mobileHandling.ts";
import { updateBrowserHistory } from "../../services/history/state.ts";
import { startNewConversation } from "../../services/history/persistence.ts";
import { updatePromptVisibility } from "../../components/ui/settingsControls.ts";
import { updateHeaderInfo } from "../../components/settings.ts";
import { closeSettingsPanelIfOpen } from "./settingsPanel.ts";

/** Toggles prompt-field visibility when the active prompt-mode radio changes. */
function setupPromptRadioEventListeners() {
  const personalityPromptRadio = elements.personalityPromptRadio;
  if (personalityPromptRadio) {
    personalityPromptRadio.addEventListener("change", () => {
      if (personalityPromptRadio.checked) {
        updatePromptVisibility();
      }
    });
  }

  const customPromptRadio = elements.customPromptRadio;
  if (customPromptRadio) {
    customPromptRadio.addEventListener("change", () => {
      if (customPromptRadio.checked) {
        updatePromptVisibility();
      }
    });
  }

  const noPromptRadio = elements.noPromptRadio;
  if (noPromptRadio) {
    noPromptRadio.addEventListener("change", () => {
      if (noPromptRadio.checked) {
        updatePromptVisibility();
      }
    });
  }
}

/** Wires Enter-to-submit on the personality field and input debouncing. */
function setupInputFieldEventListeners() {
  if (elements.personalityInput) {
    elements.personalityInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        if (elements.setPersonalityButton) {
          elements.setPersonalityButton.click();
        }
      }
    });

    elements.personalityInput.addEventListener("input", debounce(() => {}, 1000));
  }

  if (elements.systemPromptCustom) {
    elements.systemPromptCustom.addEventListener("input", debounce(() => {}, 1000));
  }
}

/** Wires preset personality buttons to start a conversation with that persona. */
function setupPersonalityPresetEventListeners() {
  const presetButtons = document.querySelectorAll<HTMLElement>(".preset-button");

  presetButtons.forEach((button) => {
    const personality = button.getAttribute("data-personality");
    if (personality) {
      button.title = personality;
    }

    button.addEventListener("click", () => {
      if (!personality || !elements.personalityInput) {
        return;
      }

      startNewConversation(`Personality: ${personality}`);
      elements.personalityInput.value = personality;

      if (elements.personalityPromptRadio) {
        elements.personalityPromptRadio.checked = true;
      }
      elements.personalityInput.setAttribute("data-explicitly-set", "true");

      updatePromptVisibility();

      closeSettingsPanelIfOpen();

      updateHeaderInfo();

      updateBrowserHistory();

      focusUserInputSafely();

    });
  });
}

/** Wires the system-prompt radios and personality/custom-prompt input fields. */
export function setupPromptEventListeners() {
  setupPromptRadioEventListeners();
  setupInputFieldEventListeners();
  setupPersonalityPresetEventListeners();
}

