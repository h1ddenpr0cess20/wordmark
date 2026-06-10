import { elements } from "../state.ts";
import { debounce } from "../../utils/utils.ts";
import { focusUserInputSafely } from "../../utils/mobileHandling.ts";
import { updateBrowserHistory } from "../../services/history/state.ts";
import { startNewConversation } from "../../services/history/persistence.ts";
import { updatePromptVisibility } from "../../components/ui/settingsControls.ts";
import { updateHeaderInfo } from "../../components/settings.ts";

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

function setupPersonalityPresetEventListeners(closeSettingsPanel: (() => void) | undefined) {
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

      if (typeof closeSettingsPanel === "function") {
        closeSettingsPanel();
      } else if (elements.settingsPanel && elements.settingsButton && elements.settingsPanel.classList.contains("active")) {
        elements.settingsPanel.classList.remove("active");
        elements.settingsButton.setAttribute("aria-expanded", "false");
        elements.settingsPanel.setAttribute("aria-hidden", "true");
        elements.settingsPanel.setAttribute("inert", "true");
        elements.settingsButton.style.display = "";
        if (elements.historyButton) {
          elements.historyButton.style.display = "";
        }
        if (elements.galleryButton) {
          elements.galleryButton.style.display = "";
        }
      }

      updateHeaderInfo();

      updateBrowserHistory();

      focusUserInputSafely();

    });
  });
}

/** Wires the system-prompt radios and personality/custom-prompt input fields. */
export function setupPromptEventListeners(
  { closeSettingsPanel }: { closeSettingsPanel?: (opts?: { focusButton?: boolean }) => void } = {},
) {
  setupPromptRadioEventListeners();
  setupInputFieldEventListeners();
  setupPersonalityPresetEventListeners(closeSettingsPanel);
}

