import { applyConsoleLogging } from "../../../config/config.js";
import { state } from "../state.js";
function showDebugToggleNotification(status) {
  const notification = document.createElement('div');
  notification.className = 'debug-toggle-notification';
  notification.textContent = `Debug Mode ${status.charAt(0).toUpperCase() + status.slice(1)}`;
  document.body.appendChild(notification);

  requestAnimationFrame(() => {
    notification.style.opacity = '1';
  });

  setTimeout(() => {
    notification.style.opacity = '0';
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

  if (typeof applyConsoleLogging === 'function') {
    applyConsoleLogging();
  }

  const status = state.debug ? 'enabled' : 'disabled';
  console.info(`Debug mode ${status}:`, {
    DEBUG: state.debug,
    VERBOSE_LOGGING: state.verboseLogging,
  });

  showDebugToggleNotification(status);
}

function setupAboutTabDebugToggle() {
  const aboutTab = document.getElementById('tab-about');
  if (!aboutTab) {
    return;
  }

  let clickCount = 0;
  let clickTimer = null;
  const clickTimeout = 1000;

  aboutTab.addEventListener('click', (event) => {
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

export function setupDebugEventListeners() {
  setupAboutTabDebugToggle();
}

