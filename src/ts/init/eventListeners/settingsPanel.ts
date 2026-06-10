import { elements, state } from "../state.ts";
import { switchToTab } from "../../components/ui/settingsTabs.ts";
import { updateHeaderInfo, organizeSettingsLayout } from "../../components/settings.ts";
import { DEFAULT_PERSONALITY } from "../../../config/config.ts";

// Single settings panel — original prompt values are stashed here while the
// panel is open so they can be restored if the user dismisses without saving.
interface PanelState {
  originalPersonalityValue: string;
  originalCustomPromptValue: string;
}

const panelState: PanelState = {
  originalPersonalityValue: "",
  originalCustomPromptValue: "",
};

// Quick-access (capture-phase) handlers mark a click here so the bubbling
// outside-click handler knows to skip it. Tracked via a WeakSet rather than a
// custom property on the Event object so it stays type-safe and self-cleaning.
const handledEvents = new WeakSet<Event>();

/**
 * Syncs body-level open/closed classes to reflect whether the settings, history,
 * or gallery panel is currently open.
 */
export function updatePanelOpenState() {
  const settingsOpen = Boolean(elements.settingsPanel && elements.settingsPanel.classList.contains("active"));
  const historyOpen = Boolean(elements.historyPanel && elements.historyPanel.getAttribute("aria-hidden") === "false");
  const galleryOpen = Boolean(elements.galleryPanel && elements.galleryPanel.getAttribute("aria-hidden") === "false");

  if (typeof document !== "undefined") {
    document.body.classList.toggle("panel-open", settingsOpen || historyOpen || galleryOpen);
  }
}

function storeOriginalValues(panelState: PanelState) {
  panelState.originalPersonalityValue = elements.personalityInput ? elements.personalityInput.value : "";
  panelState.originalCustomPromptValue = elements.systemPromptCustom ? elements.systemPromptCustom.value : "";
}

function restoreOriginalValues(panelState: PanelState) {
  if (elements.personalityPromptRadio && elements.personalityPromptRadio.checked && elements.personalityInput) {
    elements.personalityInput.value = panelState.originalPersonalityValue;
    if (panelState.originalPersonalityValue === DEFAULT_PERSONALITY) {
      elements.personalityInput.setAttribute("data-explicitly-set", "true");
    }
  }

  if (elements.customPromptRadio && elements.customPromptRadio.checked && elements.systemPromptCustom) {
    elements.systemPromptCustom.value = panelState.originalCustomPromptValue;
  }
}

function showSettingsPanel() {
  if (!elements.settingsPanel || !elements.settingsButton) {
    return;
  }
  elements.settingsPanel.classList.add("active");
  elements.settingsButton.setAttribute("aria-expanded", "true");
  elements.settingsPanel.setAttribute("aria-hidden", "false");
  elements.settingsPanel.removeAttribute("inert");
  elements.settingsButton.style.display = "none";
  if (elements.historyButton) {
    elements.historyButton.style.display = "none";
  }
  if (elements.galleryButton) {
    elements.galleryButton.style.display = "none";
  }

  updatePanelOpenState();
}

function hideSettingsPanel({ focusButton = false } = {}) {
  if (!elements.settingsPanel || !elements.settingsButton) {
    return;
  }
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
  if (focusButton) {
    elements.settingsButton.focus();
  }

  updatePanelOpenState();
}

function setupQuickAccessTargets(openSettingsAndSwitch: (tabId: string) => void) {
  const targets = [
    { selector: "#wordmark-logo", tabId: "tab-about" },
    { selector: "#logo-wordmark", tabId: "tab-about" },
    { selector: "#header-title", tabId: "tab-model" },
    { selector: "#model-info", tabId: "tab-personality" },
  ];

  targets.forEach(({ selector, tabId }) => {
    const element = document.getElementById(selector.replace("#", ""));
    if (element) {
      element.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        handledEvents.add(event);
        openSettingsAndSwitch(tabId);
      });
    }
  });

  document.addEventListener("click", (event) => {
    const match = targets.find(({ selector }) => (event.target as Element | null)?.closest(selector));
    if (!match) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    handledEvents.add(event);
    openSettingsAndSwitch(match.tabId);
  }, true);
}

function setupOutsideClickHandler() {
  document.addEventListener("click", (event) => {
    if (state.verboseLogging && (event.target as Element | null)?.closest(".copy-address")) {
      console.info("Outside click handler - copy button detected:", {
        target: event.target,
        closest: (event.target as Element | null)?.closest(".copy-address"),
        defaultPrevented: event.defaultPrevented,
        cancelBubble: event.cancelBubble,
        handled: handledEvents.has(event),
        timeStamp: event.timeStamp,
      });
    }

    if (event.defaultPrevented || event.cancelBubble || handledEvents.has(event)) {
      if (state.verboseLogging) {
        console.info("Outside click handler: event already handled/prevented");
      }
      return;
    }

    if ((event.target as Element | null)?.closest(".copy-address")) {
      if (state.verboseLogging) {
        console.info("Outside click handler: ignoring copy button click");
      }
      return;
    }

    const isSettingsPanelElement = elements.settingsPanel && elements.settingsPanel.contains(event.target as Node);
    const isSettingsButton = event.target === elements.settingsButton;

    if (elements.settingsPanel && elements.settingsPanel.classList.contains("active") &&
        !isSettingsPanelElement && !isSettingsButton) {
      restoreOriginalValues(panelState);
      hideSettingsPanel({ focusButton: true });
      updateHeaderInfo();

    }

    if (!state.isSlideshowOpen &&
        elements.galleryPanel && elements.galleryPanel.getAttribute("aria-hidden") === "false" &&
        !elements.galleryPanel.contains(event.target as Node) && event.target !== elements.galleryButton && elements.galleryButton) {
      elements.galleryPanel.setAttribute("aria-hidden", "true");
      elements.galleryPanel.setAttribute("inert", "true");
      elements.galleryButton.setAttribute("aria-expanded", "false");
      elements.galleryButton.focus();
      updatePanelOpenState();
    }

    if (elements.historyPanel && elements.historyButton &&
        elements.historyPanel.getAttribute("aria-hidden") === "false" &&
        !elements.historyPanel.contains(event.target as Node) && event.target !== elements.historyButton) {
      elements.historyPanel.setAttribute("aria-hidden", "true");
      elements.historyPanel.setAttribute("inert", "true");
      elements.historyButton.setAttribute("aria-expanded", "false");
      elements.historyButton.focus();
      updatePanelOpenState();
    }
  });
}

/**
 * Opens the settings panel and switches to `tabId`, retrying briefly if the
 * panel DOM is not yet ready.
 *
 * @param attempt - Internal retry counter (gives up after 10 attempts).
 */
export function openSettingsAndSwitch(tabId: string, attempt = 0) {
  if (!elements.settingsPanel || !elements.settingsButton) {
    if (attempt < 10) {
      setTimeout(() => openSettingsAndSwitch(tabId, attempt + 1), 100);
    } else {
      console.warn("Settings panel not ready");
    }
    return;
  }

  storeOriginalValues(panelState);
  showSettingsPanel();

  organizeSettingsLayout();

  if (tabId) {
    setTimeout(() => switchToTab(tabId), 0);
  }
}

/**
 * Wires the settings panel open/close controls, including the outside-click and
 * save/cancel behavior.
 */
export function initializeSettingsPanelControls() {
  if (elements.settingsButton && elements.settingsPanel) {
    elements.settingsButton.addEventListener("click", () => {
      storeOriginalValues(panelState);
      showSettingsPanel();
      organizeSettingsLayout();

    });
  }

  if (elements.closeSettingsButton && elements.settingsPanel) {
    elements.closeSettingsButton.addEventListener("click", () => {
      restoreOriginalValues(panelState);
      hideSettingsPanel({ focusButton: true });
      updateHeaderInfo();

    });
  }

  setupQuickAccessTargets(openSettingsAndSwitch);
  setupOutsideClickHandler();

  return {
    closeSettingsPanel: ({ focusButton = false } = {}) => hideSettingsPanel({ focusButton }),
  };
}
