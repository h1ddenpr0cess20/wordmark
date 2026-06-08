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
  window.DEBUG = !window.DEBUG;
  window.VERBOSE_LOGGING = !window.VERBOSE_LOGGING;

  if (typeof window.applyConsoleLogging === 'function') {
    window.applyConsoleLogging();
  }

  const status = window.DEBUG ? 'enabled' : 'disabled';
  console.info(`Debug mode ${status}:`, {
    DEBUG: window.DEBUG,
    VERBOSE_LOGGING: window.VERBOSE_LOGGING,
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

