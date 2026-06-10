import { getApiKey } from "../../services/apiKeyStorage.ts";
import { isLocalService } from "../../services/providers.ts";
import { openSettingsAndSwitch } from "../../init/eventListeners/settingsPanel.ts";
import { config } from "../../../config/config.ts";
import { state } from "../../init/state.ts";
/** Wires settings tab buttons so clicking one activates its tab and content panel. */
export function initTabs() {
  const tabButtons = document.querySelectorAll<HTMLElement>(".tab-button");
  const tabContents = document.querySelectorAll<HTMLElement>(".tab-content");

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
      const content = contentId ? document.getElementById(contentId) : null;
      if (content) {
        content.classList.add("active");
      }
    });
  });
}

/** Programmatically activates the settings tab whose button has id `tabId`. */
export function switchToTab(tabId: string) {
  const tabButtons = document.querySelectorAll<HTMLElement>(".tab-button");
  const tabContents = document.querySelectorAll<HTMLElement>(".tab-content");

  tabButtons.forEach((btn: HTMLElement) => {
    btn.classList.remove("active");
    btn.setAttribute("aria-selected", "false");
  });

  tabContents.forEach((content: HTMLElement) => {
    content.classList.remove("active");
  });

  const targetButton = document.getElementById(tabId);
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
  if (isLocalService(currentService)) {
    return false;
  }

  const apiKey = getApiKey(currentService);
  return !apiKey || apiKey.trim() === "";
}

/** Opens settings on the API Keys tab when the active cloud service lacks a key. */
export function openApiKeysTabIfNeeded() {
  if (!checkApiKeysMissing()) {
    return;
  }

  openSettingsAndSwitch("tab-apikeys");
  if (state.verboseLogging) {
    console.info("Automatically opened API keys tab via helper due to missing API key");
  }
}
