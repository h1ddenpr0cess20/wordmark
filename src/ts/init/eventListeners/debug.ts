import { applyConsoleLogging } from "../../../config/config.ts";
import { state } from "../state.ts";
function showDebugToggleNotification(status: string) {
  const notification = document.createElement("div");
  notification.className = "debug-toggle-notification";
  notification.textContent = `Debug Mode ${status.charAt(0).toUpperCase() + status.slice(1)}`;
  document.body.appendChild(notification);

  requestAnimationFrame(() => {
    notification.style.opacity = "1";
  });

  setTimeout(() => {
    notification.style.opacity = "0";
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, 2000);
}

function toggleDebugMode() {
  state.debug = !state.debug;
  state.verboseLogging = !state.verboseLogging;

  applyConsoleLogging();

  const status = state.debug ? "enabled" : "disabled";
  console.info(`Debug mode ${status}:`, {
    DEBUG: state.debug,
    VERBOSE_LOGGING: state.verboseLogging,
  });

  showDebugToggleNotification(status);
}

function setupAboutTabDebugToggle() {
  const aboutTab = document.getElementById("tab-about");
  if (!aboutTab) {
    return;
  }

  let clickCount = 0;
  let clickTimer: ReturnType<typeof setTimeout> | null = null;
  const clickTimeout = 1000;

  aboutTab.addEventListener("click", (event: Event) => {
    clickCount++;

    if (clickTimer) {
      clearTimeout(clickTimer);
    }

    clickTimer = setTimeout(() => {
      if (clickCount === 3) {
        toggleDebugMode();
      }
      clickCount = 0;
    }, clickTimeout);

    if (clickCount === 3) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);
}

/** Wires debug-mode triggers, including the triple-click About toggle. */
export function setupDebugEventListeners() {
  setupAboutTabDebugToggle();
}

