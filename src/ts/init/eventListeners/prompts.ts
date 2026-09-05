/**
 * System-prompt event listeners.
 *
 * @remarks
 * Wires the prompt-mode radios, the personality and custom-prompt input fields,
 * and the preset persona suggestion dropdown.
 */

import { PERSONALITY_PRESETS } from "../../../config/config.ts";
import { elements } from "../state.ts";
import { debounce } from "../../utils/utils.ts";
import { updatePromptVisibility } from "../../components/ui/settingsControls.ts";

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

/**
 * Populates the preset persona dropdown.
 *
 * @remarks
 * The dropdown only suggests a persona: picking one fills the personality field
 * and leaves the settings panel open so the choice can be edited. Applying it
 * (starting a new conversation and closing the panel) stays with the
 * "Set Personality" button.
 */
function setupPersonalityPresetEventListeners() {
  const presetSelect = document.querySelector<HTMLSelectElement>("#personality-preset-select");
  if (!presetSelect) {
    return;
  }

  PERSONALITY_PRESETS.forEach(({ label, personality }) => {
    const option = document.createElement("option");
    option.value = personality;
    option.textContent = label;
    presetSelect.appendChild(option);
  });

  presetSelect.addEventListener("change", () => {
    const personality = presetSelect.value;
    presetSelect.selectedIndex = 0;
    if (!personality || !elements.personalityInput) {
      return;
    }

    elements.personalityInput.value = personality;

    if (elements.personalityPromptRadio) {
      elements.personalityPromptRadio.checked = true;
    }

    updatePromptVisibility();

    elements.personalityInput.focus();
    elements.personalityInput.select();
  });
}

/** Wires the system-prompt radios and personality/custom-prompt input fields. */
export function setupPromptEventListeners() {
  setupPromptRadioEventListeners();
  setupInputFieldEventListeners();
  setupPersonalityPresetEventListeners();
}

