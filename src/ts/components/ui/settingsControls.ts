/**
 * Settings prompt controls.
 */

import { elements } from "../../init/state.ts";
import { config } from "../../../config/config.ts";

/**
 * Shows the prompt container (personality, custom, or none) matching the
 * currently selected system-prompt radio, hiding the others.
 */
export function updatePromptVisibility() {
  const personalityContainer = document.getElementById("personality-container");
  const customPromptContainer = document.getElementById("custom-prompt-container");
  const noPromptContainer = document.getElementById("no-prompt-container");

  if (elements.personalityPromptRadio?.checked) {
    if (personalityContainer) {
      personalityContainer.style.display = "block";
    }
    if (customPromptContainer) {
      customPromptContainer.style.display = "none";
    }
    if (noPromptContainer) {
      noPromptContainer.style.display = "none";
    }
  } else if (elements.customPromptRadio?.checked) {
    if (personalityContainer) {
      personalityContainer.style.display = "none";
    }
    if (customPromptContainer) {
      customPromptContainer.style.display = "block";
    }
    if (noPromptContainer) {
      noPromptContainer.style.display = "none";
    }
  } else if (elements.noPromptRadio?.checked) {
    if (personalityContainer) {
      personalityContainer.style.display = "none";
    }
    if (customPromptContainer) {
      customPromptContainer.style.display = "none";
    }
    if (noPromptContainer) {
      noPromptContainer.style.display = "block";
    }
  }
}

/**
 * Updates model-parameter controls for the active service, e.g. showing the
 * refresh-models button only when the service supports dynamic model fetching.
 */
export function updateParameterControls() {
  const currentService = config?.defaultService;
  const serviceConfig = currentService ? config?.services?.[currentService] : null;
  const hasDynamicModels = serviceConfig && typeof serviceConfig.fetchAndUpdateModels === "function";

  const refreshButton = document.getElementById("refresh-models");
  const refreshInfo = document.querySelector<HTMLElement>(".refresh-models-info");

  if (refreshButton) {
    refreshButton.style.display = hasDynamicModels ? "flex" : "none";
  }

  if (refreshInfo) {
    refreshInfo.style.display = hasDynamicModels ? "block" : "none";
  }
}
