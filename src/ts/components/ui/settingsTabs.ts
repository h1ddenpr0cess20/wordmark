import { getApiKey } from "../../services/apiKeys.js";
import { openSettingsAndSwitch } from "../../init/eventListeners/settingsPanel.js";
import { config } from "../../../config/config.js";
import { state } from "../../init/state.js";
export function initTabs() {
  const tabButtons = document.querySelectorAll(".tab-button") as any;
  const tabContents = document.querySelectorAll(".tab-content") as any;

  if (!tabButtons.length || !tabContents.length) {
    console.warn("Tab elements not found, skipping tab initialization");
    return;
  }

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      tabButtons.forEach((btn) => {
        btn.classList.remove("active");
        btn.setAttribute("aria-selected", "false");
      });

      tabContents.forEach((content) => {
        content.classList.remove("active");
      });

      button.classList.add("active");
      button.setAttribute("aria-selected", "true");

      const contentId = button.getAttribute("aria-controls");
      const content = document.getElementById(contentId) as any;
      if (content) {
        content.classList.add("active");
      }
    });
  });
}

export function switchToTab(tabId) {
  const tabButtons = document.querySelectorAll(".tab-button") as any;
  const tabContents = document.querySelectorAll(".tab-content") as any;

  tabButtons.forEach((btn) => {
    btn.classList.remove("active");
    btn.setAttribute("aria-selected", "false");
  });

  tabContents.forEach((content) => {
    content.classList.remove("active");
  });

  const targetButton = document.getElementById(tabId) as any;
  const targetContentId = targetButton ? targetButton.getAttribute("aria-controls") : null;
  const targetContent = targetContentId ? document.getElementById(targetContentId) : null;

  if (targetButton && targetContent) {
    targetButton.classList.add("active");
    targetButton.setAttribute("aria-selected", "true");
    targetContent.classList.add("active");
  }
}

function checkApiKeysMissing() {
  if (!config || !config.services) {
    return false;
  }

  const currentService = config.defaultService;
  if (currentService === "lmstudio" || currentService === "ollama") {
    return false;
  }

  const apiKey =getApiKey(currentService);
  return !apiKey || apiKey.trim() === "";
}

export function openApiKeysTabIfNeeded() {
  if (!checkApiKeysMissing()) {
    return;
  }

  openSettingsAndSwitch("tab-apikeys");
  if (state.verboseLogging) {
    console.info("Automatically opened API keys tab via helper due to missing API key");
  }
}
