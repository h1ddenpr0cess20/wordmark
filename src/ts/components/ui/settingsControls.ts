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
  const partyPanel = document.getElementById("party-panel");
  const partyRadio = document.getElementById("party-prompt") as HTMLInputElement | null;
  const verboseModeItem = document.getElementById("verbose-mode-item");

  if (personalityContainer) {
    personalityContainer.style.display = elements.personalityPromptRadio?.checked ? "block" : "none";
  }
  if (customPromptContainer) {
    customPromptContainer.style.display = elements.customPromptRadio?.checked ? "block" : "none";
  }
  if (noPromptContainer) {
    noPromptContainer.style.display = elements.noPromptRadio?.checked ? "block" : "none";
  }
  if (partyPanel) {
    partyPanel.style.display = partyRadio?.checked ? "block" : "none";
  }
  if (verboseModeItem) {
    verboseModeItem.style.display = partyRadio?.checked ? "none" : "block";
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
