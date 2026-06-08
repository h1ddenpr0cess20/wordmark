import { elements } from "../../init/state.js";
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

export function updateParameterControls() {
  const currentService = window.config?.defaultService;
  const serviceConfig = currentService ? window.config?.services?.[currentService] : null;
  const hasDynamicModels = serviceConfig && typeof serviceConfig.fetchAndUpdateModels === "function";

  const refreshButton = document.getElementById("refresh-models");
  const refreshInfo = document.querySelector(".refresh-models-info");

  if (refreshButton) {
    refreshButton.style.display = hasDynamicModels ? "flex" : "none";
  }

  if (refreshInfo) {
    refreshInfo.style.display = hasDynamicModels ? "block" : "none";
  }
}
