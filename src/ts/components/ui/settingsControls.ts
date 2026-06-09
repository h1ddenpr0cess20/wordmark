import { elements } from "../../init/state.ts";
import { config } from "../../../config/config.ts";
export function updatePromptVisibility() {
  const personalityContainer = document.getElementById("personality-container") as any;
  const customPromptContainer = document.getElementById("custom-prompt-container") as any;
  const noPromptContainer = document.getElementById("no-prompt-container") as any;

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
  const currentService = config?.defaultService;
  const serviceConfig = currentService ? config?.services?.[currentService] : null;
  const hasDynamicModels = serviceConfig && typeof serviceConfig.fetchAndUpdateModels === "function";

  const refreshButton = document.getElementById("refresh-models") as any;
  const refreshInfo = document.querySelector(".refresh-models-info") as any;

  if (refreshButton) {
    refreshButton.style.display = hasDynamicModels ? "flex" : "none";
  }

  if (refreshInfo) {
    refreshInfo.style.display = hasDynamicModels ? "block" : "none";
  }
}
