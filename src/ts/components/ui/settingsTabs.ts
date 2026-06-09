import { getApiKey } from "../../services/apiKeys.ts";
import { openSettingsAndSwitch } from "../../init/eventListeners/settingsPanel.ts";
import { config } from "../../../config/config.ts";
import { state } from "../../init/state.ts";
export function initTabs() {
  const tabButtons = document.querySelectorAll(".tab-button") as any;
  const tabContents = document.querySelectorAll(".tab-content") as any;

  if (!tabButtons.length || !tabContents.length) {
    console.warn("Tab elements not found, skipping tab initialization");
    return;
  }

  tabButtons.forEach((button: HTMLElement) => {
    button.addEventListener("click", () => {
      tabButtons.forEach((btn: HTMLElement) => {
        btn.classList.remove("active");
        btn.setAttribute("aria-selected", "false");
      });

      tabContents.forEach((content: HTMLElement) => {
        content.classList.remove("active");
      });

      button.classList.add("active");
      button.setAttribute("aria-selected", "true");

      const contentId = button.getAttribute("aria-controls");
      const content = contentId ? document.getElementById(contentId) as any : null;
      if (content) {
        content.classList.add("active");
      }
    });
  });
}

export function switchToTab(tabId: string) {
  const tabButtons = document.querySelectorAll(".tab-button") as any;
  const tabContents = document.querySelectorAll(".tab-content") as any;

  tabButtons.forEach((btn: HTMLElement) => {
    btn.classList.remove("active");
    btn.setAttribute("aria-selected", "false");
  });

  tabContents.forEach((content: HTMLElement) => {
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
