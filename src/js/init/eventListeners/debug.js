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

  if (!window.debugImagesButton) {
    return;
  }

  if (localStorage.getItem('developerMode') !== 'true') {
    return;
  }

  window.debugImagesButton.style.display = 'block';
  window.debugImagesButton.addEventListener('click', () => {
    if (typeof window.debugImageLoading !== 'function') {
      console.error('Debug image loading function not available');
      alert('Debug image loading function not available');
      return;
    }

    const diagnostics = window.debugImageLoading(true);
    console.group('Image Loading Diagnostics Results');
    console.table(diagnostics);

    const summary = `Image Loading Diagnostics:\n- Messages with images: ${diagnostics.messagesWithImages}\n- Total image placeholders: ${diagnostics.totalImagePlaceholders}\n- Filename-specific placeholders: ${diagnostics.filenameSpecificPlaceholders}\n- Generic placeholders: ${diagnostics.genericPlaceholders}\n- Images missing message associations: ${diagnostics.imagesWithoutAssociatedMessage}`;
    alert(summary);

    if (typeof window.ensureImagesHaveMessageIds === 'function') {
      const fixedCount = window.ensureImagesHaveMessageIds();
      console.info(`Fixed ${fixedCount} image associations`);
      if (fixedCount > 0) {
        alert(`Fixed ${fixedCount} image associations. Save the conversation to preserve these changes.`);
      }
    }
  });
}

