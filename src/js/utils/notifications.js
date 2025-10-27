/**
 * Notification popup system for displaying error and status messages
 */

// Notification container
let notificationContainer = null;

/**
 * Initialize the notification system
 */
window.initNotificationSystem = function() {
  if (notificationContainer) {
    return;
  } // Already initialized

  // Create notification container
  notificationContainer = document.createElement("div");
  notificationContainer.id = "notification-container";
  notificationContainer.className = "notification-container";
  document.body.appendChild(notificationContainer);

  // Add styles if not already present
  if (!document.getElementById("notification-styles")) {
    const style = document.createElement("style");
    style.id = "notification-styles";
    style.textContent = `
      .notification-container {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        pointer-events: none;
        max-width: 400px;
      }
      
      .notification {
        background: var(--bg-secondary, #f8f9fa);
        background: color-mix(in srgb, var(--bg-secondary, #f8f9fa) 94%, transparent);
        color: var(--text-primary, #333);
        border: 1px solid var(--border-color, #ddd);
        border-color: color-mix(in srgb, var(--border-color, #ddd) 75%, transparent);
        border-radius: 8px;
        padding: 12px 16px;
        margin-bottom: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        pointer-events: auto;
        transform: translateX(100%);
        opacity: 0;
        transition: all 0.3s ease;
        position: relative;
        max-width: 100%;
        word-wrap: break-word;
      }
      
      .notification.show {
        transform: translateX(0);
        opacity: 1;
      }
      
      .notification.error {
        --tone-color: var(--error-text, #c33);
        --tone-surface: var(--error-bg, var(--tone-color));
        color: var(--tone-color);
        background: var(--tone-surface);
        background: color-mix(in srgb, var(--tone-surface) 60%, var(--bg-secondary, #f8f9fa) 40%);
        border-color: var(--tone-color);
        border-color: color-mix(in srgb, var(--tone-color) 55%, transparent);
      }
      
      .notification.warning {
        --tone-color: var(--warning-color, color-mix(in srgb, var(--accent-color, #f4c361) 65%, #f4c361 35%));
        color: var(--tone-color);
        background: var(--warning-bg, var(--tone-color));
        background: color-mix(in srgb, var(--tone-color) 18%, var(--bg-secondary, #f8f9fa));
        border-color: var(--tone-color);
        border-color: color-mix(in srgb, var(--tone-color) 45%, transparent);
      }
      
      .notification.success {
        --tone-color: var(--success-color, color-mix(in srgb, var(--accent-color, #3dd68c) 70%, #3dd68c 30%));
        --tone-surface: var(--success-bg, var(--tone-color));
        color: var(--tone-color);
        background: var(--tone-surface);
        background: color-mix(in srgb, var(--tone-surface) 18%, var(--bg-secondary, #f8f9fa));
        border-color: var(--tone-color);
        border-color: color-mix(in srgb, var(--tone-color) 45%, transparent);
      }
      
      .notification.info {
        --tone-color: var(--info-color, color-mix(in srgb, var(--accent-color, #5bc0eb) 65%, #5bc0eb 35%));
        --tone-surface: var(--info-bg, var(--tone-color));
        color: var(--tone-color);
        background: var(--tone-surface);
        background: color-mix(in srgb, var(--tone-surface) 18%, var(--bg-secondary, #f8f9fa));
        border-color: var(--tone-color);
        border-color: color-mix(in srgb, var(--tone-color) 45%, transparent);
      }
      
      .notification-close {
        position: absolute;
        top: 8px;
        right: 8px;
        background: none;
        border: none;
        font-size: 16px;
        cursor: pointer;
        color: inherit;
        opacity: 0.6;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        transition: opacity 0.2s;
      }
      
      .notification-close:hover {
        opacity: 1;
        background: color-mix(in srgb, var(--text-primary, #333) 15%, transparent);
      }
      
      .notification-message {
        margin-right: 24px;
        font-size: 14px;
        line-height: 1.4;
      }
      
      @media (max-width: 480px) {
        .notification-container {
          left: 20px;
          right: 20px;
          max-width: none;
        }
        
        .notification {
          margin-bottom: 12px;
        }
      }
    `;
    document.head.appendChild(style);
  }
};

/**
 * Show a notification popup
 * @param {string} message - The message to display
 * @param {string} type - The type of notification (error, warning, success, info)
 * @param {number} duration - How long to show the notification (ms), 0 for persistent
 */
window.showNotification = function(message, type = "info", duration = 5000) {
  // Initialize if needed
  if (!notificationContainer) {
    window.initNotificationSystem();
  }

  // Create notification element
  const notification = document.createElement("div");
  notification.className = `notification ${type}`;

  // Create message element
  const messageEl = document.createElement("div");
  messageEl.className = "notification-message";
  messageEl.textContent = message;

  // Create close button
  const closeBtn = document.createElement("button");
  closeBtn.className = "notification-close";
  closeBtn.innerHTML = "×";
  closeBtn.setAttribute("aria-label", "Close notification");

  // Add elements to notification
  notification.appendChild(messageEl);
  notification.appendChild(closeBtn);

  // Add to container
  notificationContainer.appendChild(notification);

  // Show notification with animation
  requestAnimationFrame(() => {
    notification.classList.add("show");
  });

  // Auto-remove after duration (if not persistent)
  let autoRemoveTimeout;
  if (duration > 0) {
    autoRemoveTimeout = setTimeout(() => {
      removeNotification(notification);
    }, duration);
  }

  // Close button handler
  closeBtn.addEventListener("click", () => {
    if (autoRemoveTimeout) {
      clearTimeout(autoRemoveTimeout);
    }
    removeNotification(notification);
  });

  // Return notification element for manual control if needed
  return notification;
};

/**
 * Remove a notification with animation
 * @param {HTMLElement} notification - The notification element to remove
 */
function removeNotification(notification) {
  if (!notification || !notification.parentNode) {
    return;
  }

  notification.classList.remove("show");

  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  }, 300); // Match transition duration
}

/**
 * Show an error notification
 * @param {string} message - Error message
 */
window.showError = function(message) {
  return window.showNotification(message, "error", 8000);
};

/**
 * Show a warning notification
 * @param {string} message - Warning message
 */
window.showWarning = function(message) {
  return window.showNotification(message, "warning", 6000);
};

/**
 * Show a success notification
 * @param {string} message - Success message
 */
window.showSuccess = function(message) {
  return window.showNotification(message, "success", 4000);
};

/**
 * Show an info notification
 * @param {string} message - Info message
 */
window.showInfo = function(message) {
  return window.showNotification(message, "info", 5000);
};

/**
 * Clear all notifications
 */
window.clearAllNotifications = function() {
  if (notificationContainer) {
    const notifications = notificationContainer.querySelectorAll(".notification");
    notifications.forEach(removeNotification);
  }
};

// Initialize when DOM is loaded
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", window.initNotificationSystem);
} else {
  window.initNotificationSystem();
}
